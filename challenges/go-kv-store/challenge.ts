import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Key-Value Store API (Go)',
  description: `# Key-Value Store API

## What You're Building

You're building an **in-memory key-value store API** using Go's standard library. Think of it as a simplified Redis - store values by key, retrieve them, and optionally set TTL (time-to-live).

This is great for learning Go's \`net/http\` package and working with JSON.

---

## API Contract

#### \`PUT /kv/{key}\`
Set a value for a key.

**Request Body:** Raw value (string)
\`\`\`json
{ "value": "hello world" }
\`\`\`

**Success:**
- \`201 Created\` if new key
- \`200 OK\` if updating existing

**Response:**
\`\`\`json
{ "key": "mykey", "value": "hello world", "createdAt": "..." }
\`\`\`

---

#### \`GET /kv/{key}\`
Get value by key.

**Success (200 OK):**
\`\`\`json
{ "key": "mykey", "value": "hello world", "expiresAt": null }
\`\`\`

**Error:** \`404\` - key not found or expired

---

#### \`DELETE /kv/{key}\`
Delete a key.

**Success:** \`204 No Content\`
**Error:** \`404\`

---

#### \`POST /kv/{key}/expire\`
Set TTL (time-to-live) in seconds.

**Request:**
\`\`\`json
{ "ttl": 60 }
\`\`\`

**Success (200 OK):**
\`\`\`json
{ "key": "mykey", "expiresAt": "2024-01-15T10:01:00Z" }
\`\`\`

---

#### \`GET /kv\`
List all keys (not expired).

**Success (200 OK):**
\`\`\`json
["key1", "key2", "key3"]
\`\`\`

---

#### \`GET /health\`
**Success (200 OK):** \`{ "ok": true }\`

---

## Hints

1. **Go HTTP**: Use \`http.HandleFunc\` or a mux like \`http.NewServeMux()\`
2. **Path Parsing**: Extract key from path using \`strings.TrimPrefix\`
3. **JSON**: Use \`json.NewDecoder(r.Body).Decode(&data)\` and \`json.NewEncoder(w).Encode(data)\`
4. **TTL**: Store \`expiresAt\` as \`time.Time\`. On GET, check if \`time.Now().After(expiresAt)\`

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Health endpoint | 1 |
| PUT (create/update) | 2 |
| GET key | 2 |
| DELETE key | 2 |
| List keys | 2 |
| TTL/expiration | 3 |

**Total: ~12 tests**
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

type KVEntry struct {
	Value     string     \`json:"value"\`
	CreatedAt time.Time  \`json:"createdAt"\`
	ExpiresAt *time.Time \`json:"expiresAt,omitempty"\`
}

var (
	store = make(map[string]*KVEntry)
	mu    sync.RWMutex
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", healthHandler)
	mux.HandleFunc("/kv", kvListHandler)      // GET /kv
	mux.HandleFunc("/kv/", kvHandler)         // GET/PUT/DELETE /kv/{key}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	addr := "0.0.0.0:" + port
	log.Printf("KV Store listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func kvListHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// TODO: Return list of all non-expired keys
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode([]string{})
}

func kvHandler(w http.ResponseWriter, r *http.Request) {
	// Extract key from path: /kv/{key} or /kv/{key}/expire
	path := strings.TrimPrefix(r.URL.Path, "/kv/")
	parts := strings.Split(path, "/")
	key := parts[0]

	if len(parts) == 2 && parts[1] == "expire" {
		// POST /kv/{key}/expire
		handleExpire(w, r, key)
		return
	}

	switch r.Method {
	case http.MethodGet:
		handleGet(w, r, key)
	case http.MethodPut:
		handlePut(w, r, key)
	case http.MethodDelete:
		handleDelete(w, r, key)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleGet(w http.ResponseWriter, r *http.Request, key string) {
	// TODO: Look up key in store
	// TODO: Check if expired (return 404 if expired)
	// TODO: Return entry with key, value, expiresAt
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(map[string]string{"error": "not implemented"})
}

func handlePut(w http.ResponseWriter, r *http.Request, key string) {
	// TODO: Parse JSON body for "value"
	// TODO: Check if key exists (200) or new (201)
	// TODO: Store entry and return it
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(map[string]string{"error": "not implemented"})
}

func handleDelete(w http.ResponseWriter, r *http.Request, key string) {
	// TODO: Check if key exists (404 if not)
	// TODO: Delete and return 204
	w.WriteHeader(http.StatusNotImplemented)
}

func handleExpire(w http.ResponseWriter, r *http.Request, key string) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// TODO: Parse JSON body for "ttl" (seconds)
	// TODO: Find key (404 if not found)
	// TODO: Set expiresAt = now + ttl
	// TODO: Return key and expiresAt
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(map[string]string{"error": "not implemented"})
}
`,
    'README.md': `# Key-Value Store API (Go)

An in-memory key-value store built with Go.

## Getting Started

\`\`\`bash
go build -o app .
./app
\`\`\`

## Your Task

Implement the TODO sections in \`main.go\`.
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
      generatedFiles: {
        'go.mod': 'module candidate\n\ngo 1.23\n',
      },
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

describe('KV Store API - Public Tests', () => {
  test('GET /health returns ok', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('PUT /kv/{key} creates a key', async () => {
    const res = await request(BASE_URL)
      .put('/kv/testkey')
      .send({ value: 'testvalue' });
    expect([200, 201]).toContain(res.status);
    expect(res.body.key).toBe('testkey');
    expect(res.body.value).toBe('testvalue');
  });

  test('GET /kv/{key} retrieves value', async () => {
    await request(BASE_URL).put('/kv/getkey').send({ value: 'getvalue' });
    const res = await request(BASE_URL).get('/kv/getkey');
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('getvalue');
  });

  test('GET /kv/{key} returns 404 for non-existent', async () => {
    const valid = await request(BASE_URL).put('/kv/exists').send({ value: 'x' });
    expect([200, 201]).toContain(valid.status);
    expect((await request(BASE_URL).get('/kv/exists')).status).toBe(200);
    
    const res = await request(BASE_URL).get('/kv/nonexistent');
    expect(res.status).toBe(404);
  });

  test('DELETE /kv/{key} removes key', async () => {
    await request(BASE_URL).put('/kv/delkey').send({ value: 'todelete' });
    const delRes = await request(BASE_URL).delete('/kv/delkey');
    expect(delRes.status).toBe(204);
    expect((await request(BASE_URL).get('/kv/delkey')).status).toBe(404);
  });

  test('GET /kv lists keys', async () => {
    await request(BASE_URL).put('/kv/listkey1').send({ value: 'a' });
    const res = await request(BASE_URL).get('/kv');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain('listkey1');
  });

  test('POST /kv/{key}/expire sets TTL', async () => {
    await request(BASE_URL).put('/kv/expirekey').send({ value: 'expiring' });
    const res = await request(BASE_URL)
      .post('/kv/expirekey/expire')
      .send({ ttl: 3600 });
    expect(res.status).toBe(200);
    expect(res.body.expiresAt).toBeDefined();
  });

  test('Expired keys return 404 and are not listed (TTL)', async () => {
    const key = 'expire-soon';
    const put = await request(BASE_URL).put('/kv/' + key).send({ value: 'x' });
    expect([200, 201]).toContain(put.status);

    const expireRes = await request(BASE_URL).post('/kv/' + key + '/expire').send({ ttl: 1 });
    expect(expireRes.status).toBe(200);
    expect(expireRes.body.expiresAt).toBeDefined();

    // Should exist before TTL elapses
    const before = await request(BASE_URL).get('/kv/' + key);
    expect(before.status).toBe(200);

    // Wait until after expiresAt (avoid boundary flake)
    const expiresAtMs = new Date(expireRes.body.expiresAt).getTime();
    expect(Number.isFinite(expiresAtMs)).toBe(true);
    const waitMs = expiresAtMs - Date.now() + 200;
    expect(waitMs).toBeLessThanOrEqual(5000);
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

    const after = await request(BASE_URL).get('/kv/' + key);
    expect(after.status).toBe(404);

    const list = await request(BASE_URL).get('/kv');
    expect(list.status).toBe(200);
    expect(list.body).not.toContain(key);
  });
});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 8);

describe('KV Store API - Hidden Tests', () => {
  test('PUT/GET with random keys and values', async () => {
    const key = 'key_' + randomString();
    const value = 'value_' + randomString();
    
    const putRes = await request(BASE_URL).put('/kv/' + key).send({ value });
    expect([200, 201]).toContain(putRes.status);
    
    const getRes = await request(BASE_URL).get('/kv/' + key);
    expect(getRes.status).toBe(200);
    expect(getRes.body.value).toBe(value);
  });

  test('PUT updates existing key', async () => {
    const key = 'update_' + randomString();
    await request(BASE_URL).put('/kv/' + key).send({ value: 'old' });
    const updated = await request(BASE_URL).put('/kv/' + key).send({ value: 'new' });
    expect(updated.status).toBe(200);
    expect(updated.body.value).toBe('new');
  });

  test('DELETE returns 404 for non-existent', async () => {
    const valid = await request(BASE_URL).put('/kv/del_valid_' + randomString()).send({ value: 'x' });
    expect([200, 201]).toContain(valid.status);
    
    const res = await request(BASE_URL).delete('/kv/nonexistent_' + randomString());
    expect(res.status).toBe(404);
  });

  test('GET /kv includes random keys', async () => {
    const key = 'list_' + randomString();
    await request(BASE_URL).put('/kv/' + key).send({ value: 'x' });
    const res = await request(BASE_URL).get('/kv');
    expect(res.body).toContain(key);
  });

  test('TTL works with random keys', async () => {
    const key = 'ttl_' + randomString();
    await request(BASE_URL).put('/kv/' + key).send({ value: 'x' });
    const res = await request(BASE_URL).post('/kv/' + key + '/expire').send({ ttl: 60 });
    expect(res.status).toBe(200);
    expect(res.body.key).toBe(key);
    expect(res.body.expiresAt).toBeDefined();
  });

  test('TTL expiration is enforced (randomized)', async () => {
    const key = 'ttl_expire_' + randomString();
    await request(BASE_URL).put('/kv/' + key).send({ value: 'x' });

    const expireRes = await request(BASE_URL).post('/kv/' + key + '/expire').send({ ttl: 1 });
    expect(expireRes.status).toBe(200);
    expect(expireRes.body.expiresAt).toBeDefined();

    // Exists immediately
    expect((await request(BASE_URL).get('/kv/' + key)).status).toBe(200);

    // Wait until after expiresAt (avoid boundary flake)
    const expiresAtMs = new Date(expireRes.body.expiresAt).getTime();
    expect(Number.isFinite(expiresAtMs)).toBe(true);
    const waitMs = expiresAtMs - Date.now() + 200;
    expect(waitMs).toBeLessThanOrEqual(5000);
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

    expect((await request(BASE_URL).get('/kv/' + key)).status).toBe(404);
    const list = await request(BASE_URL).get('/kv');
    expect(list.body).not.toContain(key);
  });

  test('GET returns 404 for random non-existent keys', async () => {
    const validKey = 'valid_' + randomString();
    await request(BASE_URL).put('/kv/' + validKey).send({ value: 'x' });
    expect((await request(BASE_URL).get('/kv/' + validKey)).status).toBe(200);
    
    const randomKeys = ['random_' + randomString(), 'fake_' + Date.now()];
    for (const k of randomKeys) {
      expect((await request(BASE_URL).get('/kv/' + k)).status).toBe(404);
    }
  });
});
`,
};

