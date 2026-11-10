package api

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

// maxBodyBytes bounds a request body; the largest valid schedule is far below it.
const maxBodyBytes = 1 << 20

// decodeStrict reads exactly one JSON value into target and refuses unknown fields: a generated or
// hand-written struct alone accepts them silently (decision 5, sealed objects).
func decodeStrict(r *http.Request, target any) error {
	body, err := io.ReadAll(http.MaxBytesReader(nil, r.Body, maxBodyBytes))
	if err != nil {
		return fmt.Errorf("body: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("body: %w", err)
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return errors.New("body: more than one JSON value")
	}
	return nil
}
