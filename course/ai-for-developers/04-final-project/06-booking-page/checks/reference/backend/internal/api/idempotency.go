package api

import "sync"

// keyState is what an Idempotency-Key lookup found.
type keyState int

const (
	keyFresh      keyState = iota // first use: the caller runs the request and records the answer
	keyReplay                     // the same key with the same body already has an answer
	keyMismatch                   // the same key was used with another body: 422 idempotency_mismatch
	keyInProgress                 // the first request with this key is still running: 409 idempotency_in_progress
)

type storedAnswer struct {
	status int
	body   []byte
}

type keyEntry struct {
	fingerprint string
	answer      *storedAnswer // nil while the first request runs
}

// idempotencyKeys remembers every key with the body it came with and, once known, the answer.
// It has its own mutex: a key lookup never waits for the booking lock.
type idempotencyKeys struct {
	mu      sync.Mutex
	entries map[string]*keyEntry
}

func newIdempotencyKeys() *idempotencyKeys {
	return &idempotencyKeys{entries: map[string]*keyEntry{}}
}

// begin claims the key for a fresh request, or reports why the request must not run again.
func (k *idempotencyKeys) begin(key, fingerprint string) (keyState, *storedAnswer) {
	k.mu.Lock()
	defer k.mu.Unlock()
	entry, exists := k.entries[key]
	if !exists {
		k.entries[key] = &keyEntry{fingerprint: fingerprint}
		return keyFresh, nil
	}
	if entry.fingerprint != fingerprint {
		return keyMismatch, nil
	}
	if entry.answer == nil {
		return keyInProgress, nil
	}
	return keyReplay, entry.answer
}

// finish records the answer of the request that claimed the key, so a retry gets the same answer.
func (k *idempotencyKeys) finish(key string, answer storedAnswer) {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.entries[key].answer = &answer
}
