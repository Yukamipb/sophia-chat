package main

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// HermesAPI connects the desktop UI to the Hermes API server.
type HermesAPI struct {
	ctx      context.Context
	baseURL  string
	apiKey   string
	username string
	password string
}

func NewHermesAPI() *HermesAPI {
	return &HermesAPI{
		baseURL:  "https://dash.yukilab.xyz",
		username: "admin",
	}
}

func (a *HermesAPI) Startup(ctx context.Context) {
	a.ctx = ctx
}

// SetConfig updates endpoint + auth. Returns the cleaned base URL.
func (a *HermesAPI) SetConfig(baseURL, apiKey, username, password string) string {
	baseURL = strings.TrimSpace(baseURL)
	if baseURL == "" {
		baseURL = "https://dash.yukilab.xyz"
	}
	a.baseURL = strings.TrimRight(baseURL, "/")
	a.apiKey = apiKey
	a.username = username
	a.password = password
	return a.baseURL
}

func (a *HermesAPI) authHeaders() http.Header {
	h := make(http.Header)
	h.Set("Accept", "text/event-stream")
	h.Set("Content-Type", "application/json")
	if a.username != "" || a.password != "" {
		h.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(a.username+":"+a.password)))
	}
	if a.apiKey != "" {
		h.Set("X-API-Key", a.apiKey)
	}
	return h
}

// TestConnection hits /api/health on the configured endpoint.
func (a *HermesAPI) TestConnection() (string, error) {
	req, err := http.NewRequest("GET", a.baseURL+"/api/health", nil)
	if err != nil {
		return "", err
	}
	req.Header = a.authHeaders()
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return fmt.Sprintf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body))), nil
}

// SendMessage streams a chat completion and emits each chunk via Wails runtime events.
func (a *HermesAPI) SendMessage(model, prompt string) (string, error) {
	payload := fmt.Sprintf(`{"model":"%s","prompt":%q,"stream":true}`, model, prompt)

	req, err := http.NewRequest("POST", a.baseURL+"/api/chat", strings.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header = a.authHeaders()

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var full strings.Builder
	dec := NewSSEDecoder(resp.Body)
	for {
		event, err := dec.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		if event.Data != "" {
			full.WriteString(event.Data)
			if a.ctx != nil {
				runtime.EventsEmit(a.ctx, "chunk", event.Data)
			}
		}
	}
	return full.String(), nil
}

// SSEEvent is one Server-Sent Events frame.
type SSEEvent struct {
	Event string
	Data  string
}

// SSEDecoder parses text/event-stream.
type SSEDecoder struct {
	sc *bufio.Scanner
}

func NewSSEDecoder(r io.Reader) *SSEDecoder {
	sc := bufio.NewScanner(r)
	sc.Split(bufio.ScanLines)
	return &SSEDecoder{sc: sc}
}

func (d *SSEDecoder) Next() (*SSEEvent, error) {
	e := &SSEEvent{}
	var dataLines []string
	for d.sc.Scan() {
		line := strings.TrimRight(d.sc.Text(), "\r")
		if line == "" {
			if len(dataLines) > 0 || e.Event != "" {
				e.Data = strings.Join(dataLines, "\n")
				return e, nil
			}
			continue
		}
		if strings.HasPrefix(line, "event:") {
			e.Event = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		} else if strings.HasPrefix(line, "data:") {
			dataLines = append(dataLines, strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
	if err := d.sc.Err(); err != nil {
		return nil, err
	}
	if len(dataLines) > 0 || e.Event != "" {
		e.Data = strings.Join(dataLines, "\n")
		return e, nil
	}
	return nil, io.EOF
}
