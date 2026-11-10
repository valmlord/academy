package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// The refserver writes its own HTTP/1.1 responses instead of using net/http's server: net/http sorts
// header fields and builds Allow itself, and K5/K6 of design 4.L7 draw both per run.

// route is one path of the contract; "{}" is a path parameter.
type route struct {
	pattern  string
	handlers map[string]http.HandlerFunc
}

type paramsKey struct{}

// pathParam is the n-th path parameter of the matched route, percent-decoded.
func pathParam(r *http.Request, n int) string {
	params, _ := r.Context().Value(paramsKey{}).([]string)
	if n >= len(params) {
		return ""
	}
	return params[n]
}

// match returns the route of the path and its parameters; segments must be non-empty.
func match(routes []route, escapedPath string) (*route, []string) {
	segments := strings.Split(strings.TrimPrefix(escapedPath, "/"), "/")
	for i := range routes {
		parts := strings.Split(strings.TrimPrefix(routes[i].pattern, "/"), "/")
		if len(parts) != len(segments) {
			continue
		}
		var params []string
		matched := true
		for j, part := range parts {
			segment, err := url.PathUnescape(segments[j])
			if err != nil || segment == "" {
				matched = false
				break
			}
			if part == "{}" {
				params = append(params, segment)
			} else if part != segment {
				matched = false
				break
			}
		}
		if matched {
			return &routes[i], params
		}
	}
	return nil, nil
}

// buffer collects one handler's answer before it is written with the run's header order.
type buffer struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (b *buffer) Header() http.Header { return b.header }
func (b *buffer) WriteHeader(status int) {
	if b.status == 0 {
		b.status = status
	}
}
func (b *buffer) Write(data []byte) (int, error) {
	if b.status == 0 {
		b.status = http.StatusOK
	}
	return b.body.Write(data)
}

func serve(listener net.Listener, a *api) error {
	routes := a.routes()
	for {
		conn, err := listener.Accept()
		if err != nil {
			return err
		}
		go serveConn(conn, a, routes)
	}
}

func serveConn(conn net.Conn, a *api, routes []route) {
	defer conn.Close()
	reader := bufio.NewReader(conn)
	for {
		request, err := http.ReadRequest(reader)
		if err != nil {
			return
		}
		if strings.EqualFold(request.Header.Get("Expect"), "100-continue") {
			_, _ = io.WriteString(conn, "HTTP/1.1 100 Continue\r\n\r\n")
		}
		answer := &buffer{header: http.Header{}}
		isHead := dispatch(answer, request, a, routes)
		_, _ = io.Copy(io.Discard, request.Body)
		_ = request.Body.Close()
		// ReadRequest sets Close for "Connection: close" and for HTTP/1.0 without keep-alive.
		closing := request.Close
		time.Sleep(a.cos.latency())
		if err := writeResponse(conn, answer, a.cos.HeaderOrder, isHead, closing); err != nil || closing {
			return
		}
	}
}

// dispatch runs the route's handler, or answers 404 / 405 as net/http's ServeMux would (text/plain); the
// contract checks these by status only. It reports whether the request was a HEAD.
func dispatch(w *buffer, r *http.Request, a *api, routes []route) bool {
	matched, params := match(routes, r.URL.EscapedPath())
	if matched == nil {
		writeText(w, http.StatusNotFound, "404 page not found\n")
		return false
	}
	method := r.Method
	isHead := method == http.MethodHead && a.cos.AllowHead && matched.handlers[http.MethodGet] != nil
	if isHead {
		method = http.MethodGet
	}
	handler := matched.handlers[method]
	if handler == nil {
		w.Header().Set("Allow", allowed(matched, a.cos))
		writeText(w, http.StatusMethodNotAllowed, "Method Not Allowed\n")
		return false
	}
	handler(w, r.WithContext(context.WithValue(r.Context(), paramsKey{}, params)))
	return isHead
}

// allowed is the Allow value of a route in the run's method order (K6); HEAD comes with GET when the run
// offers it.
func allowed(matched *route, cos *cosmeticState) string {
	var methods []string
	for _, method := range cos.MethodOrder {
		_, has := matched.handlers[method]
		if method == http.MethodHead {
			has = cos.AllowHead && matched.handlers[http.MethodGet] != nil
		}
		if has {
			methods = append(methods, method)
		}
	}
	return strings.Join(methods, ", ")
}

func writeText(w *buffer, status int, text string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(text))
}

func writeResponse(conn net.Conn, answer *buffer, order []string, isHead, closing bool) error {
	if answer.status == 0 {
		answer.status = http.StatusOK
	}
	fields := map[string]string{
		"content-length": strconv.Itoa(answer.body.Len()),
		"date":           time.Now().UTC().Format(http.TimeFormat),
	}
	for name, values := range answer.header {
		fields[strings.ToLower(name)] = strings.Join(values, ", ")
	}
	if closing {
		fields["connection"] = "close"
	}
	var out bytes.Buffer
	fmt.Fprintf(&out, "HTTP/1.1 %d %s\r\n", answer.status, http.StatusText(answer.status))
	written := map[string]bool{}
	writeField := func(name string) {
		if value, ok := fields[name]; ok && !written[name] {
			fmt.Fprintf(&out, "%s: %s\r\n", http.CanonicalHeaderKey(name), value)
			written[name] = true
		}
	}
	for _, name := range order {
		writeField(name)
	}
	for _, name := range []string{"content-type", "allow", "date", "content-length", "connection"} {
		writeField(name)
	}
	out.WriteString("\r\n")
	if !isHead {
		out.Write(answer.body.Bytes())
	}
	_, err := conn.Write(out.Bytes())
	return err
}
