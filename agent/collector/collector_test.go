package collector

import (
	"testing"
	"time"
)

func TestRateBetweenReadings(t *testing.T) {
	// 10240 bytes accumulated over 5 seconds → 2048 bytes/sec.
	got := rate(1000, 11240, 5*time.Second)
	if got != 2048 {
		t.Fatalf("got %d, want 2048", got)
	}
}

func TestRateHandlesCounterReset(t *testing.T) {
	// counter went backwards (reboot): treat current value as the amount.
	got := rate(99999, 500, 5*time.Second)
	if got != 100 {
		t.Fatalf("got %d, want 100", got)
	}
}

func TestRateZeroElapsedIsZero(t *testing.T) {
	if got := rate(0, 1000, 0); got != 0 {
		t.Fatalf("got %d, want 0", got)
	}
}

func TestTopNSortsAndTruncates(t *testing.T) {
	in := []scored{{1, 5}, {2, 90}, {3, 40}, {4, 10}, {5, 70}}
	out := topN(in, 3)
	if len(out) != 3 || out[0].id != 2 || out[1].id != 5 || out[2].id != 3 {
		t.Fatalf("bad topN: %+v", out)
	}
}

func TestCollectSmoke(t *testing.T) {
	// Integration smoke test: runs against the real OS. Two calls so rates
	// have a prior reading to delta against.
	c := New()
	if _, err := c.Collect(); err != nil {
		t.Fatalf("first collect: %v", err)
	}
	time.Sleep(200 * time.Millisecond)
	snap, err := c.Collect()
	if err != nil {
		t.Fatalf("second collect: %v", err)
	}
	if snap.Mem.Total == 0 {
		t.Fatal("expected non-zero total memory")
	}
	if len(snap.Disks) == 0 {
		t.Fatal("expected at least one disk")
	}
}
