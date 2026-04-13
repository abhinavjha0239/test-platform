import type { CreateChallengeInput } from '@exam-platform/shared';

// Starter code extracted for Hot Swap - used in both starterFiles and generatedFiles
const starterMainRs = `#![allow(unused)]

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc};
use tokio::{net::TcpListener, sync::Mutex};

#[derive(Clone, Serialize, Deserialize)]
struct Metric {
    id: String,
    name: String,
    value: f64,
    unit: String,
    timestamp: String,
}

type AppState = Arc<Mutex<Vec<Metric>>>;

#[tokio::main]
async fn main() {
    let state: AppState = Arc::new(Mutex::new(Vec::new()));

    let app = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(list_metrics).post(create_metric))
        .route("/metrics/latest/:name", get(latest_metric))
        .route("/metrics/avg/:name", get(avg_metric))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{}", port);
    println!("Listening on {}", addr);
    
    let listener = TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true }))
}

#[derive(Deserialize)]
struct CreateMetric {
    name: String,
    value: f64,
    unit: String,
}

async fn create_metric(
    State(state): State<AppState>,
    Json(payload): Json<CreateMetric>,
) -> (StatusCode, Json<serde_json::Value>) {
    // TODO: Generate ID, create metric, store, return 201
    (StatusCode::NOT_IMPLEMENTED, Json(serde_json::json!({"error": "not implemented"})))
}

#[derive(Deserialize)]
struct ListQuery {
    name: Option<String>,
    limit: Option<usize>,
}

async fn list_metrics(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Json<Vec<Metric>> {
    // TODO: Filter by name, apply limit
    Json(vec![])
}

async fn latest_metric(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<Metric>, StatusCode> {
    // TODO: Find most recent metric with this name
    Err(StatusCode::NOT_IMPLEMENTED)
}

#[derive(Deserialize)]
struct AvgQuery {
    from: Option<String>,
    to: Option<String>,
}

async fn avg_metric(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Query(query): Query<AvgQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // TODO: Calculate average of metrics with this name
    Err(StatusCode::NOT_IMPLEMENTED)
}
`;

export const challenge: CreateChallengeInput = {
  name: 'Health Metrics API (Rust)',
  description: `# Health Metrics API

## What You're Building

A **system health metrics collection API** using Rust and Axum. Record metrics like CPU usage, memory, disk space, and query historical data.

This is an introduction to Rust web development with Axum.

---

## API Contract

#### \`POST /metrics\`
Record a metric.

**Request:**
\`\`\`json
{
  "name": "cpu_usage",
  "value": 45.5,
  "unit": "percent"
}
\`\`\`

**Success (201):**
\`\`\`json
{
  "id": "metric_1",
  "name": "cpu_usage",
  "value": 45.5,
  "unit": "percent",
  "timestamp": "2024-01-15T10:00:00.000Z"
}
\`\`\`

---

#### \`GET /metrics\`
List recent metrics.

**Query:**
- \`?name=cpu_usage\` - Filter by name
- \`?limit=100\` - Max results

**Success (200):** Array of metrics

---

#### \`GET /metrics/latest/{name}\`
Get the most recent value for a metric.

**Success (200):** Single metric
**Error (404):** No data for this metric name

---

#### \`GET /metrics/avg/{name}\`
Get average value for a metric.

**Query:** \`?from=...&to=...\` for time range

**Success (200):**
\`\`\`json
{
  "name": "cpu_usage",
  "avg": 42.3,
  "count": 150,
  "from": "...",
  "to": "..."
}
\`\`\`

---

#### \`GET /health\`
**Success (200):** \`{ "ok": true }\`

---

## Hints

1. **Axum Basics**: Use \`Router::new().route("/path", get(handler))\`
2. **JSON**: Use \`axum::Json<T>\` for request/response
3. **State**: Use \`Arc<Mutex<Vec<Metric>>>\` for shared state

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Record metric | 2 |
| List metrics | 2 |
| Filter by name | 2 |
| Latest value | 2 |
| Average calculation | 3 |

**Total: ~11 tests**
`,

  starterFiles: {
    'src/main.rs': starterMainRs,
    'README.md': `# Health Metrics API (Rust)

Implement the handlers in \`src/main.rs\`.

## Build & Run
\`\`\`bash
cargo build --release
./target/release/candidate
\`\`\`
`
  },

  dependencies: {},
  nodeVersion: '20',

  runner: {
    mode: 'http',
    runtime: 'rust',
    candidate: {
      image: 'rust:1.75-slim',
      workdir: '/app',
      generatedFiles: {
        'Cargo.toml': `[package]
name = "candidate"
version = "0.1.0"
edition = "2021"

[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "net"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
chrono = { version = "0.4", features = ["serde"] }
`,
        'src/main.rs': starterMainRs,  // Hot Swap: pre-compile during warmup
      },
      installCommand: 'cargo build --release',
      runCommand: 'cargo build --release && ./target/release/candidate',  // Incremental rebuild
      port: 3000,
      healthPath: '/health',
      startupTimeoutMs: 120000,
    },
    tests: {
      framework: 'jest',
      image: 'node:20-alpine',
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      testCommand: 'npm test 2>&1 || true',
      timeoutMs: 240000,
    },
  },

  publicTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

describe('Health Metrics API - Public Tests', () => {
  test('GET /health', async () => {
    expect((await request(BASE_URL).get('/health')).body).toEqual({ ok: true });
  });

  test('POST /metrics records metric', async () => {
    const res = await request(BASE_URL)
      .post('/metrics')
      .send({ name: 'cpu', value: 50.5, unit: 'percent' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('cpu');
    expect(res.body.value).toBe(50.5);
  });

  test('GET /metrics returns array', async () => {
    const created = await request(BASE_URL).post('/metrics').send({ name: 'mem', value: 70, unit: 'percent' });
    expect(created.status).toBe(201);
    const res = await request(BASE_URL).get('/metrics');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some(m => m.name === 'mem' && m.value === 70)).toBe(true);
  });

  test('GET /metrics?name filters', async () => {
    const keep = await request(BASE_URL).post('/metrics').send({ name: 'disk', value: 30, unit: 'gb' });
    const other = await request(BASE_URL).post('/metrics').send({ name: 'other', value: 999, unit: 'x' });
    expect(keep.status).toBe(201);
    expect(other.status).toBe(201);
    const res = await request(BASE_URL).get('/metrics?name=disk');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some(m => m.value === 30)).toBe(true);
    expect(res.body.some(m => m.name === 'other')).toBe(false);
    expect(res.body.every(m => m.name === 'disk')).toBe(true);
  });

  test('GET /metrics/latest/{name}', async () => {
    await request(BASE_URL).post('/metrics').send({ name: 'latest_test', value: 1, unit: 'x' });
    await request(BASE_URL).post('/metrics').send({ name: 'latest_test', value: 2, unit: 'x' });
    const res = await request(BASE_URL).get('/metrics/latest/latest_test');
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(2);
  });

  test('GET /metrics/avg/{name}', async () => {
    await request(BASE_URL).post('/metrics').send({ name: 'avg_test', value: 10, unit: 'x' });
    await request(BASE_URL).post('/metrics').send({ name: 'avg_test', value: 20, unit: 'x' });
    const res = await request(BASE_URL).get('/metrics/avg/avg_test');
    expect(res.status).toBe(200);
    expect(res.body.avg).toBe(15);
  });
});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 8);

describe('Health Metrics API - Hidden Tests', () => {
  test('Records with random name and value', async () => {
    const name = 'metric_' + randomString();
    const value = Math.random() * 100;
    const res = await request(BASE_URL)
      .post('/metrics')
      .send({ name, value, unit: 'test' });
    expect(res.body.name).toBe(name);
    expect(res.body.value).toBeCloseTo(value, 5);
  });

  test('Filter by random name', async () => {
    const name = 'filter_' + randomString();
    await request(BASE_URL).post('/metrics').send({ name, value: 1, unit: 'x' });
    const res = await request(BASE_URL).get('/metrics?name=' + name);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe(name);
  });

  test('Latest returns most recent', async () => {
    const name = 'latest_' + randomString();
    await request(BASE_URL).post('/metrics').send({ name, value: 10, unit: 'x' });
    await request(BASE_URL).post('/metrics').send({ name, value: 20, unit: 'x' });
    await request(BASE_URL).post('/metrics').send({ name, value: 30, unit: 'x' });
    const res = await request(BASE_URL).get('/metrics/latest/' + name);
    expect(res.body.value).toBe(30);
  });

  test('Average with random values', async () => {
    const name = 'avg_' + randomString();
    const values = [10, 20, 30, 40];
    for (const v of values) {
      await request(BASE_URL).post('/metrics').send({ name, value: v, unit: 'x' });
    }
    const res = await request(BASE_URL).get('/metrics/avg/' + name);
    expect(res.body.avg).toBe(25);
    expect(res.body.count).toBe(4);
  });

  test('Latest returns 404 for unknown name', async () => {
    const valid = 'valid_' + randomString();
    await request(BASE_URL).post('/metrics').send({ name: valid, value: 1, unit: 'x' });
    expect((await request(BASE_URL).get('/metrics/latest/' + valid)).status).toBe(200);
    expect((await request(BASE_URL).get('/metrics/latest/unknown_' + randomString())).status).toBe(404);
  });
});
`,
};

