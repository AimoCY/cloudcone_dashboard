// Package collector samples host metrics via gopsutil and builds a
// metrics.Snapshot. It does NOT fill VpsID/Label/Ts/Traffic — main.go does.
package collector

import (
	"sort"
	"time"

	"cloudcone-dashboard/agent/metrics"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/load"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"github.com/shirou/gopsutil/v3/process"
)

// rate converts a cumulative-counter delta over an elapsed window to bytes/sec.
// A backwards counter (reboot) is treated as: current value is the amount.
func rate(last, cur uint64, elapsed time.Duration) uint64 {
	if elapsed <= 0 {
		return 0
	}
	var d uint64
	if cur < last {
		d = cur
	} else {
		d = cur - last
	}
	return uint64(float64(d) / elapsed.Seconds())
}

type scored struct {
	id    int32
	value float64
}

// topN returns the n highest-scored entries, descending.
func topN(in []scored, n int) []scored {
	cp := append([]scored(nil), in...)
	sort.Slice(cp, func(i, j int) bool { return cp[i].value > cp[j].value })
	if len(cp) > n {
		cp = cp[:n]
	}
	return cp
}

type ioSample struct {
	rx, tx, read, write uint64
	at                  time.Time
}

// netTotals maps an interface name to its {rxTotal, txTotal} counters.
type netTotals map[string][2]uint64

// Collector holds the prior I/O reading needed to compute rates.
type Collector struct {
	prev     *ioSample
	prevNets netTotals
	hasPrev  bool
}

func New() *Collector { return &Collector{} }

// Collect builds a Snapshot. CPU percentages are since the previous Collect
// call (gopsutil interval 0), so the first call returns 0% CPU — expected.
func (c *Collector) Collect() (metrics.Snapshot, error) {
	var s metrics.Snapshot
	now := time.Now()

	total, err := cpu.Percent(0, false)
	if err != nil {
		return s, err
	}
	if len(total) > 0 {
		s.CPU.TotalPct = round1(total[0])
	}
	per, err := cpu.Percent(0, true)
	if err != nil {
		return s, err
	}
	for _, p := range per {
		s.CPU.PerCore = append(s.CPU.PerCore, round1(p))
	}

	if l, err := load.Avg(); err == nil {
		s.Load = metrics.Load{Load1: l.Load1, Load5: l.Load5, Load15: l.Load15}
	}
	if vm, err := mem.VirtualMemory(); err == nil {
		s.Mem = metrics.Mem{Total: vm.Total, Used: vm.Used, Available: vm.Available, Cached: vm.Cached}
	}
	if sw, err := mem.SwapMemory(); err == nil {
		s.Swap = metrics.Swap{Total: sw.Total, Used: sw.Used}
	}
	if up, err := host.Uptime(); err == nil {
		s.UptimeSec = up
	}

	parts, _ := disk.Partitions(false)
	for _, p := range parts {
		u, err := disk.Usage(p.Mountpoint)
		if err != nil {
			continue
		}
		s.Disks = append(s.Disks, metrics.Disk{
			Mount: p.Mountpoint, Fstype: p.Fstype,
			Total: u.Total, Used: u.Used, Free: u.Free, Percent: round1(u.UsedPercent),
		})
	}

	cur := ioSample{at: now}
	if nics, err := net.IOCounters(true); err == nil {
		for _, n := range nics {
			if n.Name == "lo" {
				continue
			}
			cur.rx += n.BytesRecv
			cur.tx += n.BytesSent
			s.Nets = append(s.Nets, metrics.Net{
				Iface: n.Name, RxTotal: n.BytesRecv, TxTotal: n.BytesSent,
			})
		}
	}
	if dios, err := disk.IOCounters(); err == nil {
		for _, d := range dios {
			cur.read += d.ReadBytes
			cur.write += d.WriteBytes
		}
	}
	if c.hasPrev {
		el := cur.at.Sub(c.prev.at)
		s.DiskIO = metrics.DiskIO{
			ReadBps:  rate(c.prev.read, cur.read, el),
			WriteBps: rate(c.prev.write, cur.write, el),
		}
		for i := range s.Nets {
			s.Nets[i].RxBps = rate(prevIface(c.prevNets, s.Nets[i].Iface, true), s.Nets[i].RxTotal, el)
			s.Nets[i].TxBps = rate(prevIface(c.prevNets, s.Nets[i].Iface, false), s.Nets[i].TxTotal, el)
		}
	}
	c.prev = &cur
	c.prevNets = snapshotNets(s.Nets)
	c.hasPrev = true

	s.TopProcCPU, s.TopProcMem = topProcs()
	return s, nil
}

// snapshotNets captures the current per-interface totals for the next rate calc.
func snapshotNets(ns []metrics.Net) netTotals {
	m := netTotals{}
	for _, n := range ns {
		m[n.Iface] = [2]uint64{n.RxTotal, n.TxTotal}
	}
	return m
}

// prevIface returns the prior rx (rx=true) or tx counter for an interface,
// or 0 if the interface was not seen before.
func prevIface(m netTotals, iface string, rx bool) uint64 {
	v, ok := m[iface]
	if !ok {
		return 0
	}
	if rx {
		return v[0]
	}
	return v[1]
}

// topProcs returns the top 10 processes by CPU and by memory.
func topProcs() (byCPU, byMem []metrics.Proc) {
	procs, err := process.Processes()
	if err != nil {
		return nil, nil
	}
	var cpuScores, memScores []scored
	info := map[int32]metrics.Proc{}
	for _, p := range procs {
		cp, _ := p.CPUPercent()
		mp, _ := p.MemoryPercent()
		name, _ := p.Name()
		info[p.Pid] = metrics.Proc{Pid: p.Pid, Name: name, CPUPct: round1(cp), MemPct: round1(float64(mp))}
		cpuScores = append(cpuScores, scored{p.Pid, cp})
		memScores = append(memScores, scored{p.Pid, float64(mp)})
	}
	for _, s := range topN(cpuScores, 10) {
		byCPU = append(byCPU, info[s.id])
	}
	for _, s := range topN(memScores, 10) {
		byMem = append(byMem, info[s.id])
	}
	return byCPU, byMem
}

// round1 rounds to one decimal place.
func round1(f float64) float64 { return float64(int(f*10+0.5)) / 10 }
