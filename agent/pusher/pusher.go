// Package pusher delivers Snapshots to the dashboard, buffering in memory and
// retrying when the dashboard is unreachable.
package pusher

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"cloudcone-dashboard/agent/metrics"
)

type Pusher struct {
	url    string
	token  string
	cap    int
	buf    []metrics.Snapshot
	client *http.Client
}

// New creates a Pusher. capN is the max number of snapshots buffered while the
// dashboard is unreachable (oldest evicted past the cap).
func New(url, token string, capN int) *Pusher {
	return &Pusher{
		url:    url,
		token:  token,
		cap:    capN,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (p *Pusher) Buffered() int { return len(p.buf) }

// Send delivers snap. On success it first drains any buffered backlog (oldest
// first). On failure snap is appended to the buffer and an error is returned;
// the caller should not crash — the next Send retries.
func (p *Pusher) Send(snap metrics.Snapshot) error {
	for len(p.buf) > 0 {
		if err := p.post(p.buf[0]); err != nil {
			p.enqueue(snap)
			return err
		}
		p.buf = p.buf[1:]
	}
	if err := p.post(snap); err != nil {
		p.enqueue(snap)
		return err
	}
	return nil
}

func (p *Pusher) enqueue(snap metrics.Snapshot) {
	p.buf = append(p.buf, snap)
	if len(p.buf) > p.cap {
		p.buf = p.buf[len(p.buf)-p.cap:]
	}
}

func (p *Pusher) post(snap metrics.Snapshot) error {
	body, err := json.Marshal(snap)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, p.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.token)
	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("pusher: dashboard returned %d", resp.StatusCode)
	}
	return nil
}
