// Command vps-agent samples this host every N seconds and pushes the metrics
// to the dashboard. Run: vps-agent -config /etc/vps-agent/config.yaml
package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cloudcone-dashboard/agent/collector"
	"cloudcone-dashboard/agent/config"
	"cloudcone-dashboard/agent/metrics"
	"cloudcone-dashboard/agent/pusher"
	"cloudcone-dashboard/agent/traffic"

	gnet "github.com/shirou/gopsutil/v3/net"
)

func main() {
	cfgPath := flag.String("config", "/etc/vps-agent/config.yaml", "path to config file")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	coll := collector.New()
	tr := traffic.New(cfg.StatePath, cfg.TrafficResetDay)
	if err := tr.Load(); err != nil {
		log.Printf("traffic: load state failed (continuing fresh): %v", err)
	}
	// Buffer ~5 minutes of samples while the dashboard is unreachable.
	bufCap := (5 * 60) / cfg.SampleIntervalSec
	push := pusher.New(cfg.DashboardURL, cfg.Token, bufCap)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	ticker := time.NewTicker(time.Duration(cfg.SampleIntervalSec) * time.Second)
	defer ticker.Stop()

	log.Printf("vps-agent started: vps_id=%s interval=%ds -> %s", cfg.VpsID, cfg.SampleIntervalSec, cfg.DashboardURL)
	for {
		select {
		case <-stop:
			if err := tr.Save(); err != nil {
				log.Printf("traffic: save on shutdown failed: %v", err)
			}
			log.Println("vps-agent stopped")
			return
		case <-ticker.C:
			sample(cfg, coll, tr, push)
		}
	}
}

func sample(cfg *config.Config, coll *collector.Collector, tr *traffic.Tracker, push *pusher.Pusher) {
	snap, err := coll.Collect()
	if err != nil {
		log.Printf("collect: %v", err)
		return
	}
	snap.VpsID = cfg.VpsID
	snap.Label = cfg.Label
	snap.Ts = time.Now().Unix()

	// Traffic accounting from aggregate interface counters.
	var rx, tx uint64
	if nics, err := gnet.IOCounters(true); err == nil {
		for _, n := range nics {
			if n.Name == "lo" {
				continue
			}
			rx += n.BytesRecv
			tx += n.BytesSent
		}
	}
	tr.Update(time.Now(), rx, tx)
	mRx, mTx, month := tr.Current()
	snap.Traffic = metrics.Traffic{Month: month, RxBytes: mRx, TxBytes: mTx}
	if err := tr.Save(); err != nil {
		log.Printf("traffic: save: %v", err)
	}

	if err := push.Send(snap); err != nil {
		log.Printf("push (buffered=%d): %v", push.Buffered(), err)
	}
}
