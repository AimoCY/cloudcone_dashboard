package config

import (
	"errors"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	DashboardURL      string `yaml:"dashboard_url"`
	Token             string `yaml:"token"`
	VpsID             string `yaml:"vps_id"`
	Label             string `yaml:"label"`
	SampleIntervalSec int    `yaml:"sample_interval_sec"`
	TrafficResetDay   int    `yaml:"traffic_reset_day"`
	StatePath         string `yaml:"state_path"`
}

// Load reads, parses, applies defaults, and validates the agent config file.
func Load(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}
	var c Config
	if err := yaml.Unmarshal(raw, &c); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	if c.SampleIntervalSec == 0 {
		c.SampleIntervalSec = 5
	}
	if c.TrafficResetDay == 0 {
		c.TrafficResetDay = 1
	}
	if c.StatePath == "" {
		c.StatePath = "/var/lib/vps-agent/state.json"
	}
	if err := c.validate(); err != nil {
		return nil, err
	}
	return &c, nil
}

func (c *Config) validate() error {
	if c.DashboardURL == "" || c.Token == "" || c.VpsID == "" || c.Label == "" {
		return errors.New("config: dashboard_url, token, vps_id, label are all required")
	}
	if c.TrafficResetDay < 1 || c.TrafficResetDay > 28 {
		return errors.New("config: traffic_reset_day must be 1..28")
	}
	return nil
}
