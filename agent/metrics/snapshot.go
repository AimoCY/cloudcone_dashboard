package metrics

// Snapshot is the exact JSON payload POSTed to the dashboard /ingest endpoint.
// See CONTRACT.md — JSON tags are the contract.
type Snapshot struct {
	VpsID      string  `json:"vps_id"`
	Label      string  `json:"label"`
	Ts         int64   `json:"ts"`
	UptimeSec  uint64  `json:"uptime_sec"`
	CPU        CPU     `json:"cpu"`
	Load       Load    `json:"load"`
	Mem        Mem     `json:"mem"`
	Swap       Swap    `json:"swap"`
	Disks      []Disk  `json:"disks"`
	DiskIO     DiskIO  `json:"disk_io"`
	Nets       []Net   `json:"nets"`
	Traffic    Traffic `json:"traffic"`
	TopProcCPU []Proc  `json:"top_proc_cpu"`
	TopProcMem []Proc  `json:"top_proc_mem"`
}

type CPU struct {
	TotalPct float64   `json:"total_pct"`
	PerCore  []float64 `json:"per_core"`
}
type Load struct {
	Load1  float64 `json:"load1"`
	Load5  float64 `json:"load5"`
	Load15 float64 `json:"load15"`
}
type Mem struct {
	Total     uint64 `json:"total"`
	Used      uint64 `json:"used"`
	Available uint64 `json:"available"`
	Cached    uint64 `json:"cached"`
}
type Swap struct {
	Total uint64 `json:"total"`
	Used  uint64 `json:"used"`
}
type Disk struct {
	Mount   string  `json:"mount"`
	Fstype  string  `json:"fstype"`
	Total   uint64  `json:"total"`
	Used    uint64  `json:"used"`
	Free    uint64  `json:"free"`
	Percent float64 `json:"percent"`
}
type DiskIO struct {
	ReadBps  uint64 `json:"read_bps"`
	WriteBps uint64 `json:"write_bps"`
}
type Net struct {
	Iface   string `json:"iface"`
	RxBps   uint64 `json:"rx_bps"`
	TxBps   uint64 `json:"tx_bps"`
	RxTotal uint64 `json:"rx_total"`
	TxTotal uint64 `json:"tx_total"`
}
type Traffic struct {
	Month   string `json:"month"`
	RxBytes uint64 `json:"rx_bytes"`
	TxBytes uint64 `json:"tx_bytes"`
}
type Proc struct {
	Pid    int32   `json:"pid"`
	Name   string  `json:"name"`
	CPUPct float64 `json:"cpu_pct"`
	MemPct float64 `json:"mem_pct"`
}
