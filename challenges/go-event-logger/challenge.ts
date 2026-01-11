import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Event Logger API (Go)',
  description: `# Event Logger API

## What You're Building

An **application event logging and querying service** in Go. Log events with types and payloads, then query and analyze them.

This medium-difficulty Go challenge tests filtering, aggregation, and time-based queries.

---

## API Contract

#### \`POST /events\`
Log an event.

**Request:**
\`\`\`json
{
  "type": "user.login",
  "payload": { "userId": "123", "ip": "1.2.3.4" },
  "source": "auth-service"
}
\`\`\`

**Success (201):**
\`\`\`json
{
  "id": "evt_1",
  "type": "user.login",
  "payload": {...},
  "source": "auth-service",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
\`\`\`

---

#### \`GET /events\`
Query events with filters.

**Query Params:**
- \`?type=user.login\` - Filter by type
- \`?from=2024-01-01T00:00:00Z\` - Start time
- \`?to=2024-01-31T23:59:59Z\` - End time
- \`?limit=100\` - Max results (default 100)

**Success (200):** Array of events

---

#### \`GET /events/{id}\`
Get single event.

**Success (200):** Event object
**Error (404)**

---

#### \`GET /stats\`
Get event statistics.

**Success (200):**
\`\`\`json
{
  "total": 1500,
  "byType": {
    "user.login": 500,
    "user.logout": 300,
    "error": 50
  }
}
\`\`\`

---

#### \`DELETE /events\`
Purge old events.

**Query:** \`?olderThan=2024-01-01T00:00:00Z\`

**Success (200):**
\`\`\`json
{ "deleted": 150 }
\`\`\`

---

#### \`GET /health\`
**Success (200):** \`{ "ok": true }\`

---

## Hints

1. **Time Parsing**: Use \`time.Parse(time.RFC3339, str)\`
2. **Filtering**: Build a filtered slice in the handler
3. **Stats**: Use a map to count by type

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Log event | 2 |
| List events | 2 |
| Filter by type | 2 |
| Filter by time | 2 |
| Get by ID | 2 |
| Stats endpoint | 2 |
| Purge events | 2 |

**Total: ~14 tests**
`,

  starterFiles: {
    'main.go': `package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type Event struct {
	ID        string                 \`json:"id"\`
	Type      string                 \`json:"type"\`
	Payload   map[string]interface{} \`json:"payload"\`
	Source    string                 \`json:"source,omitempty"\`
	Timestamp time.Time              \`json:"timestamp"\`
}

var (
	events  = make([]Event, 0)
	counter = 0
	mu      sync.RWMutex
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/events", eventsHandler)
	mux.HandleFunc("/events/", eventByIDHandler)
	mux.HandleFunc("/stats", statsHandler)

	port := os.Getenv("PORT")
	if port == "" { port = "3000" }
	log.Printf("Event Logger on :%s", port)
	log.Fatal(http.ListenAndServe("0.0.0.0:"+port, mux))
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func eventsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodPost:
		// TODO: Create event
		w.WriteHeader(http.StatusNotImplemented)
		json.NewEncoder(w).Encode(map[string]string{"error": "not implemented"})
	case http.MethodGet:
		// TODO: List with filters (type, from, to, limit)
		json.NewEncoder(w).Encode([]Event{})
	case http.MethodDelete:
		// TODO: Purge old events
		w.WriteHeader(http.StatusNotImplemented)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func eventByIDHandler(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/events/")
	// TODO: Get event by ID
	_ = id
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
}

func statsHandler(w http.ResponseWriter, r *http.Request) {
	// TODO: Return total count and counts by type
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"total":  0,
		"byType": map[string]int{},
	})
}
`,
    'README.md': `# Event Logger API (Go)

Implement event logging in \`main.go\`.
`
  },

  dependencies: {},
  nodeVersion: '20',

  runner: {
    mode: 'http',
    runtime: 'go',
    candidate: {
      image: 'golang:1.23-alpine',
      workdir: '/app',
      generatedFiles: { 'go.mod': 'module candidate\n\ngo 1.23\n' },
      installCommand: 'go build -o app .',
      runCommand: './app',
      port: 3000,
      healthPath: '/health',
      startupTimeoutMs: 30000,
    },
    tests: {
      framework: 'jest',
      image: 'node:20-alpine',
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      testCommand: 'npm test 2>&1 || true',
      timeoutMs: 120000,
    },
  },

  publicTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

describe('Event Logger API - Public Tests', () => {
  test('GET /health', async () => {
    expect((await request(BASE_URL).get('/health')).body).toEqual({ ok: true });
  });

  test('POST /events logs event', async () => {
    const res = await request(BASE_URL)
      .post('/events')
      .send({ type: 'test.event', payload: { foo: 'bar' } });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('test.event');
    expect(res.body.id).toMatch(/^evt_/);
  });

  test('GET /events returns array', async () => {
    const created = await request(BASE_URL).post('/events').send({ type: 'list.event' });
    expect(created.status).toBe(201);

    const res = await request(BASE_URL).get('/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some(e => e.id === created.body.id)).toBe(true);
  });

  test('GET /events?type filters', async () => {
    const keep = await request(BASE_URL).post('/events').send({ type: 'filter.type' });
    const other = await request(BASE_URL).post('/events').send({ type: 'other.type' });
    expect(keep.status).toBe(201);
    expect(other.status).toBe(201);

    const res = await request(BASE_URL).get('/events?type=filter.type');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some(e => e.id === keep.body.id)).toBe(true);
    expect(res.body.some(e => e.id === other.body.id)).toBe(false);
    expect(res.body.every(e => e.type === 'filter.type')).toBe(true);
  });

  test('GET /events/{id} returns event', async () => {
    const create = await request(BASE_URL).post('/events').send({ type: 'get.by.id' });
    const get = await request(BASE_URL).get('/events/' + create.body.id);
    expect(get.status).toBe(200);
    expect(get.body.id).toBe(create.body.id);
  });

  test('GET /events/{id} returns 404 for non-existent id (after proving GET works)', async () => {
    const create = await request(BASE_URL).post('/events').send({ type: 'get.404.proof' });
    expect(create.status).toBe(201);

    const ok = await request(BASE_URL).get('/events/' + create.body.id);
    expect(ok.status).toBe(200);

    const res = await request(BASE_URL).get('/events/evt_does_not_exist_123');
    expect(res.status).toBe(404);
  });

  test('GET /stats returns counts', async () => {
    await request(BASE_URL).post('/events').send({ type: 'stats.type' });
    const res = await request(BASE_URL).get('/stats');
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(typeof res.body.byType).toBe('object');
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.byType['stats.type']).toBeGreaterThanOrEqual(1);
  });

  test('GET /events supports basic time filtering via to=<past> (should return empty)', async () => {
    const created = await request(BASE_URL).post('/events').send({ type: 'time.filter.test' });
    expect(created.status).toBe(201);

    const res = await request(BASE_URL).get('/events?to=1970-01-01T00:00:00Z');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  test('DELETE /events?olderThan purges events', async () => {
    const e1 = await request(BASE_URL).post('/events').send({ type: 'purge.test.1', payload: { n: 1 } });
    const e2 = await request(BASE_URL).post('/events').send({ type: 'purge.test.2', payload: { n: 2 } });
    expect(e1.status).toBe(201);
    expect(e2.status).toBe(201);

    const purgeRes = await request(BASE_URL).delete('/events?olderThan=2999-01-01T00:00:00Z');
    expect(purgeRes.status).toBe(200);
    expect(purgeRes.body).toEqual(expect.objectContaining({ deleted: expect.any(Number) }));
    expect(purgeRes.body.deleted).toBeGreaterThanOrEqual(2);

    const get1 = await request(BASE_URL).get('/events/' + e1.body.id);
    const get2 = await request(BASE_URL).get('/events/' + e2.body.id);
    expect(get1.status).toBe(404);
    expect(get2.status).toBe(404);
  });
});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 8);

describe('Event Logger API - Hidden Tests', () => {
  test('Logs event with random type', async () => {
    const type = 'random.' + randomString();
    const res = await request(BASE_URL).post('/events').send({ type });
    expect(res.body.type).toBe(type);
  });

  test('Filter by random type', async () => {
    const type = 'unique.' + randomString();
    await request(BASE_URL).post('/events').send({ type });
    const res = await request(BASE_URL).get('/events?type=' + type);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every(e => e.type === type)).toBe(true);
  });

  test('Stats count by type correctly', async () => {
    const type = 'count.' + randomString();
    await request(BASE_URL).post('/events').send({ type });
    await request(BASE_URL).post('/events').send({ type });
    await request(BASE_URL).post('/events').send({ type });
    
    const stats = await request(BASE_URL).get('/stats');
    expect(stats.body.byType[type]).toBe(3);
  });

  test('GET by ID returns 404 for random non-existent', async () => {
    const valid = await request(BASE_URL).post('/events').send({ type: 'valid' });
    expect((await request(BASE_URL).get('/events/' + valid.body.id)).status).toBe(200);
    
    expect((await request(BASE_URL).get('/events/evt_' + randomString())).status).toBe(404);
  });

  test('Payload preserved correctly', async () => {
    const payload = { key: randomString(), num: Math.random() };
    const create = await request(BASE_URL).post('/events').send({ type: 'payload', payload });
    const get = await request(BASE_URL).get('/events/' + create.body.id);
    expect(get.body.payload.key).toBe(payload.key);
  });

  test('DELETE /events purges events using olderThan (randomized)', async () => {
    const type1 = 'purge.' + randomString();
    const type2 = 'purge.' + randomString();
    const e1 = await request(BASE_URL).post('/events').send({ type: type1, payload: { v: randomString() } });
    const e2 = await request(BASE_URL).post('/events').send({ type: type2, payload: { v: randomString() } });
    expect(e1.status).toBe(201);
    expect(e2.status).toBe(201);

    const purgeRes = await request(BASE_URL).delete('/events?olderThan=2999-01-01T00:00:00Z');
    expect(purgeRes.status).toBe(200);
    expect(purgeRes.body.deleted).toBeGreaterThanOrEqual(2);

    expect((await request(BASE_URL).get('/events/' + e1.body.id)).status).toBe(404);
    expect((await request(BASE_URL).get('/events/' + e2.body.id)).status).toBe(404);
  });
});
`,
};

