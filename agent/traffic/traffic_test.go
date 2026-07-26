package traffic

import (
	"path/filepath"
	"testing"
	"time"
)

func date(y int, m time.Month, d, h int) time.Time {
	return time.Date(y, m, d, h, 0, 0, 0, time.UTC)
}

func TestAccumulatesDeltas(t *testing.T) {
	tr := New(filepath.Join(t.TempDir(), "s.json"), 1)
	// resetDay=1. First reading primes the baseline (no delta added).
	tr.Update(date(2026, time.May, 10, 0), 1000, 2000)
	tr.Update(date(2026, time.May, 10, 1), 1500, 2500) // +500 / +500
	tr.Update(date(2026, time.May, 10, 2), 1800, 3000) // +300 / +500
	rx, tx, month := tr.Current()
	if rx != 800 || tx != 1000 || month != "2026-05" {
		t.Fatalf("got rx=%d tx=%d month=%s", rx, tx, month)
	}
}

func TestCounterResetTreatedAsFreshDelta(t *testing.T) {
	tr := New(filepath.Join(t.TempDir(), "s.json"), 1)
	tr.Update(date(2026, time.May, 10, 0), 5000, 5000) // baseline
	tr.Update(date(2026, time.May, 10, 1), 6000, 6000) // +1000 / +1000
	// reboot: counters drop below previous → treat current value as the delta.
	tr.Update(date(2026, time.May, 10, 2), 200, 300) // +200 / +300
	rx, tx, _ := tr.Current()
	if rx != 1200 || tx != 1300 {
		t.Fatalf("got rx=%d tx=%d, want 1200/1300", rx, tx)
	}
}

func TestPeriodRolloverResetsTotals(t *testing.T) {
	tr := New(filepath.Join(t.TempDir(), "s.json"), 1)
	tr.Update(date(2026, time.May, 20, 0), 0, 0)       // baseline, period 2026-05
	tr.Update(date(2026, time.May, 31, 0), 9000, 9000) // +9000/+9000
	// crossing into June 1 (resetDay=1) starts a new period; totals reset.
	tr.Update(date(2026, time.June, 1, 0), 9500, 9500) // new period, delta +500
	rx, tx, month := tr.Current()
	if rx != 500 || tx != 500 || month != "2026-06" {
		t.Fatalf("got rx=%d tx=%d month=%s, want 500/500/2026-06", rx, tx, month)
	}
}

func TestPeriodKeyHonorsResetDay(t *testing.T) {
	// resetDay=15: May 10 belongs to the period that started 2026-04-15.
	if k := periodKey(date(2026, time.May, 10, 0), 15); k != "2026-04" {
		t.Fatalf("got %s, want 2026-04", k)
	}
	if k := periodKey(date(2026, time.May, 20, 0), 15); k != "2026-05" {
		t.Fatalf("got %s, want 2026-05", k)
	}
}

func TestPersistenceRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "s.json")
	tr := New(path, 1)
	tr.Update(date(2026, time.May, 10, 0), 1000, 1000)
	tr.Update(date(2026, time.May, 10, 1), 1700, 1900) // +700/+900
	if err := tr.Save(); err != nil {
		t.Fatal(err)
	}
	// A fresh instance loads prior state; the next reading deltas against it.
	tr2 := New(path, 1)
	if err := tr2.Load(); err != nil {
		t.Fatal(err)
	}
	tr2.Update(date(2026, time.May, 10, 2), 2000, 2200) // +300/+300
	rx, tx, _ := tr2.Current()
	if rx != 1000 || tx != 1200 {
		t.Fatalf("got rx=%d tx=%d, want 1000/1200", rx, tx)
	}
}
