package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTemp(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestLoadValid(t *testing.T) {
	p := writeTemp(t, `
dashboard_url: https://dashboard.example.com:9443/ingest
token: secret-token
vps_id: vps-a
label: VPS-A
sample_interval_sec: 5
traffic_reset_day: 1
state_path: /var/lib/vps-agent/state.json
`)
	c, err := Load(p)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.VpsID != "vps-a" || c.SampleIntervalSec != 5 || c.TrafficResetDay != 1 {
		t.Fatalf("bad parse: %+v", c)
	}
}

func TestLoadDefaults(t *testing.T) {
	p := writeTemp(t, `
dashboard_url: https://x/ingest
token: t
vps_id: v
label: V
`)
	c, err := Load(p)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if c.SampleIntervalSec != 5 || c.TrafficResetDay != 1 || c.StatePath != "/var/lib/vps-agent/state.json" {
		t.Fatalf("defaults not applied: %+v", c)
	}
}

func TestLoadRejectsMissingRequired(t *testing.T) {
	p := writeTemp(t, "vps_id: v\n")
	if _, err := Load(p); err == nil {
		t.Fatal("expected error for missing dashboard_url/token")
	}
}
