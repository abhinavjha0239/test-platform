# Backend Templates (FastAPI, Flask, Django, Go, Rust, Node)

This document provides **copy/paste templates** for authoring backend/API challenges using the **HTTP blackbox runner** (`runner.mode = 'http'`).

## Why HTTP blackbox is the default for backend

- Candidate code runs in **container A** with **no tests mounted**
- Tests run in **container B** (Jest + supertest) and call A via `BASE_URL`
- Hidden tests remain truly hidden

## Common contract for all backend templates

Your candidate server **must**:

- listen on `PORT` environment variable (default in your app is fine, but grader sets `PORT`)
- bind to `0.0.0.0` (not `127.0.0.1`)
- expose a stable health endpoint (`healthPath`) used by the grader to wait for readiness

Your tests **must**:

- use `BASE_URL` from env
- avoid the 404/400 trap (prove endpoint exists first)

### Generic Jest + supertest harness (use in all backend challenges)

```js
const request = require('supertest');
const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) throw new Error('Missing BASE_URL');
```

---

## Template: Node.js (Express) API

### Runner preset

```ts
runner: {
  mode: 'http',
  runtime: 'node',
  candidate: {
    image: 'node:20-alpine',
    workdir: '/app',
    // Grader auto-generates package.json from challenge.dependencies for runtime=node
    installCommand: 'npm install --legacy-peer-deps 2>&1',
    runCommand: 'node src/server.js',
    port: 3000,
    healthPath: '/health',
    startupTimeoutMs: 20000,
  },
  tests: {
    framework: 'jest',
    image: 'node:20-alpine',
    installCommand: 'npm install --legacy-peer-deps 2>&1',
    testCommand: 'npm test 2>&1 || true',
    timeoutMs: 120000,
  },
}
```

### Starter files (minimal)

```js
// src/app.js
const express = require('express');
const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.status(200).json({ ok: true }));

// TODO: implement endpoints

module.exports = app;
```

```js
// src/server.js
const app = require('./app');
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`listening ${PORT}`));
```

### Public tests (pattern)

```js
const request = require('supertest');
const BASE_URL = process.env.BASE_URL;

describe('Public API', () => {
  test('health', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
  });
});
```

---

## Template: FastAPI (Python) API

### Runner preset

```ts
runner: {
  mode: 'http',
  runtime: 'python',
  candidate: {
    image: 'python:3.11-slim',
    workdir: '/app',
    generatedFiles: {
      // Candidate cannot modify this (blocked); grader writes it.
      'requirements.txt': [
        'fastapi==0.115.5',
        'uvicorn==0.32.1',
      ].join('\\n') + '\\n',
    },
    installCommand: 'pip install -r requirements.txt',
    runCommand: 'python -m uvicorn main:app --host 0.0.0.0 --port $PORT',
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
}
```

### Starter files (minimal)

```py
# main.py
import os
from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
def health():
    return {"ok": True}

# TODO: implement endpoints
```

### Tests (pattern)

```js
const request = require('supertest');
const BASE_URL = process.env.BASE_URL;

test('health', async () => {
  const res = await request(BASE_URL).get('/health');
  expect(res.status).toBe(200);
  expect(res.body).toEqual(expect.objectContaining({ ok: true }));
});
```

---

## Template: Flask (Python) API

### Runner preset

```ts
runner: {
  mode: 'http',
  runtime: 'python',
  candidate: {
    image: 'python:3.11-slim',
    workdir: '/app',
    generatedFiles: {
      'requirements.txt': 'flask==3.0.3\\n',
    },
    installCommand: 'pip install -r requirements.txt',
    runCommand: 'python app.py',
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
}
```

### Starter files (minimal)

```py
# app.py
import os
from flask import Flask, jsonify

app = Flask(__name__)

@app.get("/health")
def health():
    return jsonify({"ok": True})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3000"))
    app.run(host="0.0.0.0", port=port)
```

---

## Template: Django (Python) API (minimal)

### When to use Django

Django requires more scaffolding than Flask/FastAPI. Prefer Django only if the challenge explicitly tests:

- Django ORM patterns
- Django REST Framework usage
- project structure + settings

### Runner preset

```ts
runner: {
  mode: 'http',
  runtime: 'python',
  candidate: {
    image: 'python:3.11-slim',
    workdir: '/app',
    generatedFiles: {
      'requirements.txt': [
        'Django==5.1.3',
        // Optional: DRF
        // 'djangorestframework==3.15.2',
      ].join('\\n') + '\\n',
    },
    installCommand: 'pip install -r requirements.txt',
    // NOTE: Ensure your starter project binds 0.0.0.0 and uses $PORT
    runCommand: 'python manage.py runserver 0.0.0.0:$PORT',
    port: 3000,
    healthPath: '/health',
    startupTimeoutMs: 45000,
  },
  tests: {
    framework: 'jest',
    image: 'node:20-alpine',
    installCommand: 'npm install --legacy-peer-deps 2>&1',
    testCommand: 'npm test 2>&1 || true',
    timeoutMs: 180000,
  },
}
```

### Starter files (recommended approach)

- Provide a pre-generated Django project (manage.py, settings.py, urls.py, a minimal app).
- Use SQLite (file-based) to avoid external services.
- Include a simple `/health` view.

---

## Template: Go (net/http) API

### Runner preset

```ts
runner: {
  mode: 'http',
  runtime: 'go',
  candidate: {
    image: 'golang:1.23-alpine',
    workdir: '/app',
    // go.mod is a blocked path; use generatedFiles to provide it
    generatedFiles: {
      'go.mod': 'module candidate\n\ngo 1.23\n',
      // If using external dependencies, add go.sum too
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
}
```

### Starter files (minimal)

```go
package main

import (
  "encoding/json"
  "log"
  "net/http"
  "os"
)

func main() {
  mux := http.NewServeMux()
  mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
  })

  port := os.Getenv("PORT")
  if port == "" { port = "3000" }

  addr := "0.0.0.0:" + port
  log.Printf("listening on %s", addr)
  log.Fatal(http.ListenAndServe(addr, mux))
}
```

---

## Template: Rust (Axum) API

### Notes

Rust compilation can be slower. Keep the dependency set small and avoid heavy crates. Pin dependencies via `generatedFiles` so candidates cannot alter them.

### Runner preset (recommended)

```ts
runner: {
  mode: 'http',
  runtime: 'rust',
  candidate: {
    image: 'rust:1.83-slim',
    workdir: '/app',
    generatedFiles: {
      'Cargo.toml': `
[package]
name = "candidate"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "net"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
`.trim() + "\\n",
    },
    installCommand: 'cargo build --release',
    runCommand: './target/release/candidate',
    port: 3000,
    healthPath: '/health',
    startupTimeoutMs: 90000, // Rust compile times can be long
  },
  tests: {
    framework: 'jest',
    image: 'node:20-alpine',
    installCommand: 'npm install --legacy-peer-deps 2>&1',
    testCommand: 'npm test 2>&1 || true',
    timeoutMs: 240000,
  },
}
```

### Starter files (minimal)

```rust
// src/main.rs
use axum::{routing::get, Json, Router};
use tokio::net::TcpListener;

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3000);

    let app = Router::new().route("/health", get(health));

    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).await.unwrap();
    println!("listening on {}", addr);
    axum::serve(listener, app).await.unwrap();
}
```

> **Note**: This uses Axum 0.7+ API (`axum::serve` + `TcpListener`). The `serde` and `serde_json` crates are included in the `Cargo.toml` generatedFiles.

---

## API test patterns you should reuse

### Prove endpoints exist before negative tests

Use the pattern from `03-TEST-DESIGN.md`:

- create a resource (201)
- read it (200)
- then assert 404/400 for invalid inputs

### Don’t require ordering unless specified

If list ordering matters, specify it in the challenge contract and test it. Otherwise, assert as sets.


