// Package traffic accumulates month-to-date network traffic from monotonic
// since-boot interface counters, surviving reboots (counter resets) and
// billing-period rollovers, and persists its state to disk.
package traffic

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

type state struct {
	Period  string `json:"period"`
	MonthRx uint64 `json:"month_rx"`
	MonthTx uint64 `json:"month_tx"`
	LastRx  uint64 `json:"last_rx"`
	LastTx  uint64 `json:"last_tx"`
	Primed  bool   `json:"primed"`
}

type Tracker struct {
	path     string
	resetDay int
	st       state
}

func New(path string, resetDay int) *Tracker {
	return &Tracker{path: path, resetDay: resetDay}
}

// periodKey returns the YYYY-MM of the billing period that `now` falls in.
// With resetDay=N, a period runs from day N of one month to day N of the next;
// the key is the year-month in which the period started.
func periodKey(now time.Time, resetDay int) string {
	t := now
	if now.Day() < resetDay {
		t = now.AddDate(0, -1, 0)
	}
	return t.Format("2006-01")
}

// Update folds one counter reading (cumulative rx/tx bytes summed across
// interfaces) into the month-to-date totals.
func (tr *Tracker) Update(now time.Time, curRx, curTx uint64) {
	pk := periodKey(now, tr.resetDay)
	if tr.st.Period != pk {
		// New billing period (or first ever run): reset totals, keep counter
		// baseline so we still delta correctly against the live counters.
		tr.st.Period = pk
		tr.st.MonthRx = 0
		tr.st.MonthTx = 0
	}
	if !tr.st.Primed {
		// First reading: establish a baseline, contribute nothing.
		tr.st.LastRx, tr.st.LastTx = curRx, curTx
		tr.st.Primed = true
		return
	}
	tr.st.MonthRx += delta(tr.st.LastRx, curRx)
	tr.st.MonthTx += delta(tr.st.LastTx, curTx)
	tr.st.LastRx, tr.st.LastTx = curRx, curTx
}

// delta returns cur-last, or cur itself when the counter went backwards
// (a reboot reset the kernel counters).
func delta(last, cur uint64) uint64 {
	if cur < last {
		return cur
	}
	return cur - last
}

// Current returns month-to-date rx, tx and the period key.
func (tr *Tracker) Current() (rx, tx uint64, month string) {
	return tr.st.MonthRx, tr.st.MonthTx, tr.st.Period
}

// Save atomically writes state to disk.
func (tr *Tracker) Save() error {
	if err := os.MkdirAll(filepath.Dir(tr.path), 0o755); err != nil {
		return fmt.Errorf("traffic: mkdir state dir: %w", err)
	}
	b, err := json.Marshal(tr.st)
	if err != nil {
		return err
	}
	tmp := tr.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return fmt.Errorf("traffic: write state: %w", err)
	}
	return os.Rename(tmp, tr.path)
}

// Load reads prior state. A missing file is not an error (fresh start).
func (tr *Tracker) Load() error {
	b, err := os.ReadFile(tr.path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("traffic: read state: %w", err)
	}
	return json.Unmarshal(b, &tr.st)
}
