package pusher

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"cloudcone-dashboard/agent/metrics"
)

func TestSendPostsBearerToken(t *testing.T) {
	var gotAuth, gotBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		buf := make([]byte, r.ContentLength)
		r.Body.Read(buf)
		gotBody = string(buf)
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := New(srv.URL, "tok-123", 10)
	if err := p.Send(metrics.Snapshot{VpsID: "vps-a"}); err != nil {
		t.Fatalf("send: %v", err)
	}
	if gotAuth != "Bearer tok-123" {
		t.Fatalf("auth header = %q", gotAuth)
	}
	if gotBody == "" {
		t.Fatal("empty body")
	}
}

func TestSendBuffersOnFailureAndFlushes(t *testing.T) {
	var mu sync.Mutex
	received := 0
	fail := true
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if fail {
			w.WriteHeader(500)
			return
		}
		received++
		w.WriteHeader(200)
	}))
	defer srv.Close()

	p := New(srv.URL, "t", 10)
	// 3 sends fail → all buffered.
	for i := 0; i < 3; i++ {
		_ = p.Send(metrics.Snapshot{VpsID: "v"})
	}
	if p.Buffered() != 3 {
		t.Fatalf("buffered = %d, want 3", p.Buffered())
	}
	// server recovers; next send flushes backlog + current = 4 total.
	mu.Lock()
	fail = false
	mu.Unlock()
	if err := p.Send(metrics.Snapshot{VpsID: "v"}); err != nil {
		t.Fatalf("send after recovery: %v", err)
	}
	if p.Buffered() != 0 {
		t.Fatalf("buffered = %d, want 0", p.Buffered())
	}
	if received != 4 {
		t.Fatalf("received = %d, want 4", received)
	}
}

func TestBufferCapEvictsOldest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(500)
	}))
	defer srv.Close()
	p := New(srv.URL, "t", 2) // cap 2
	for i := 0; i < 5; i++ {
		_ = p.Send(metrics.Snapshot{VpsID: "v"})
	}
	if p.Buffered() != 2 {
		t.Fatalf("buffered = %d, want 2 (capped)", p.Buffered())
	}
}
