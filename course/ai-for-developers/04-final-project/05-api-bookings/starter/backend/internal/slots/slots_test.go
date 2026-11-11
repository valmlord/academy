package slots

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// caseFile is one file of testdata/slots in the case format of task.md.
type caseFile struct {
	ID       string   `json:"id"`
	Req      []string `json:"req"`
	Request  Request  `json:"request"`
	Expected []Slot   `json:"expected"`
}

const casesGlob = "../../../testdata/slots/*.json"

func TestAvailableMatchesEveryCaseFile(t *testing.T) {
	paths, err := filepath.Glob(casesGlob)
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) == 0 {
		t.Fatalf("no case files match %s", casesGlob)
	}
	for _, path := range paths {
		t.Run(filepath.Base(path), func(t *testing.T) {
			data, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			var c caseFile
			if err := json.Unmarshal(data, &c); err != nil {
				t.Fatalf("%s: %v", path, err)
			}

			got, err := Available(c.Request)

			if err != nil {
				t.Fatalf("%s (%v): %v", c.ID, c.Req, err)
			}
			if len(got) != len(c.Expected) {
				t.Fatalf("%s (%v): %d slots, want %d: %v", c.ID, c.Req, len(got), len(c.Expected), got)
			}
			for i := range got {
				if !got[i].Start.Equal(c.Expected[i].Start) || !got[i].End.Equal(c.Expected[i].End) {
					t.Errorf("%s (%v): slot %d is %v..%v, want %v..%v", c.ID, c.Req, i,
						got[i].Start, got[i].End, c.Expected[i].Start, c.Expected[i].End)
				}
			}
		})
	}
}

func TestResolveLocalPicksTheCourseInstant(t *testing.T) {
	cases := []struct {
		name, zone string
		day        civilDate
		minute     int
		want       string
	}{
		{"New York gap moves forward", "America/New_York", civilDate{2026, 3, 8}, 2*60 + 30, "2026-03-08T07:30:00Z"},
		{"New York repeated hour takes the earlier", "America/New_York", civilDate{2026, 11, 1}, 60 + 30, "2026-11-01T05:30:00Z"},
		{"Berlin repeated hour takes the earlier", "Europe/Berlin", civilDate{2026, 10, 25}, 2*60 + 30, "2026-10-25T00:30:00Z"},
		{"Sydney repeated hour takes the earlier", "Australia/Sydney", civilDate{2026, 4, 5}, 2*60 + 30, "2026-04-04T15:30:00Z"},
		{"24:00 is the next local midnight", "Asia/Kathmandu", civilDate{2026, 3, 7}, 24 * 60, "2026-03-07T18:15:00Z"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			loc, err := time.LoadLocation(c.zone)
			if err != nil {
				t.Fatal(err)
			}

			got := resolveLocal(c.day, c.minute, loc)

			if got.UTC().Format(time.RFC3339) != c.want {
				t.Errorf("resolveLocal = %s, want %s", got.UTC().Format(time.RFC3339), c.want)
			}
		})
	}
}
