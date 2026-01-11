import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'File Metadata Service (Rust)',
  description: `# File Metadata Service

## What You're Building

A **file metadata tracking service** in Rust. Track file information (name, size, type, checksum) without storing actual files. Useful for deduplication and file management systems.

This is a medium-difficulty Rust challenge with aggregation and filtering.

---

## API Contract

#### \`POST /files\`
Register a file.

**Request:**
\`\`\`json
{
  "name": "document.pdf",
  "size": 1024576,
  "mimeType": "application/pdf",
  "checksum": "abc123def456"
}
\`\`\`

**Success (201):**
\`\`\`json
{
  "id": "file_1",
  "name": "document.pdf",
  "size": 1024576,
  "mimeType": "application/pdf",
  "checksum": "abc123def456",
  "createdAt": "..."
}
\`\`\`

---

#### \`GET /files\`
List files with filters.

**Query:**
- \`?mimeType=image/*\` - Filter by type (supports wildcards)
- \`?minSize=1000\` - Minimum size in bytes
- \`?maxSize=1000000\` - Maximum size

**Success (200):** Array of files

---

#### \`GET /files/{id}\`
Get single file metadata.

**Success (200):** File object
**Error (404)**

---

#### \`DELETE /files/{id}\`
Unregister a file.

**Success (204)**
**Error (404)**

---

#### \`GET /files/duplicates\`
Find files with same checksum.

**Success (200):**
\`\`\`json
[
  [{ "id": "file_1", ... }, { "id": "file_3", ... }],
  [{ "id": "file_2", ... }, { "id": "file_5", ... }]
]
\`\`\`

---

#### \`GET /stats\`
Storage statistics.

**Success (200):**
\`\`\`json
{
  "totalFiles": 150,
  "totalSize": 1073741824,
  "byMimeType": {
    "application/pdf": { "count": 50, "size": 500000000 },
    "image/png": { "count": 100, "size": 573741824 }
  }
}
\`\`\`

---

#### \`GET /health\`
**Success (200):** \`{ "ok": true }\`

---

## Hints

1. **Wildcard matching**: \`image/*\` should match \`image/png\`, \`image/jpeg\`, etc.
2. **Duplicates**: Group files by checksum, return groups with 2+ files

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Register file | 2 |
| List with filters | 3 |
| Get/Delete file | 2 |
| Find duplicates | 3 |
| Stats endpoint | 3 |

**Total: ~13 tests**
`,

  starterFiles: {
    'src/main.rs': `#![allow(unused)]

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post, delete},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::{net::TcpListener, sync::Mutex};

#[derive(Clone, Serialize, Deserialize)]
struct FileMeta {
    id: String,
    name: String,
    size: u64,
    #[serde(rename = "mimeType")]
    mime_type: String,
    checksum: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

type AppState = Arc<Mutex<Vec<FileMeta>>>;

#[tokio::main]
async fn main() {
    let state: AppState = Arc::new(Mutex::new(Vec::new()));

    let app = Router::new()
        .route("/health", get(health))
        .route("/files", get(list_files).post(create_file))
        .route("/files/duplicates", get(find_duplicates))
        .route("/files/:id", get(get_file).delete(delete_file))
        .route("/stats", get(stats))
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
struct CreateFile {
    name: String,
    size: u64,
    #[serde(rename = "mimeType")]
    mime_type: String,
    checksum: String,
}

async fn create_file(
    State(state): State<AppState>,
    Json(payload): Json<CreateFile>,
) -> (StatusCode, Json<serde_json::Value>) {
    // TODO: Create file metadata
    (StatusCode::NOT_IMPLEMENTED, Json(serde_json::json!({"error": "not implemented"})))
}

#[derive(Deserialize)]
struct ListQuery {
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
    #[serde(rename = "minSize")]
    min_size: Option<u64>,
    #[serde(rename = "maxSize")]
    max_size: Option<u64>,
}

async fn list_files(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Json<Vec<FileMeta>> {
    // TODO: Filter by mimeType (support wildcards), minSize, maxSize
    Json(vec![])
}

async fn get_file(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<FileMeta>, StatusCode> {
    // TODO: Get file by ID
    Err(StatusCode::NOT_IMPLEMENTED)
}

async fn delete_file(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> StatusCode {
    // TODO: Delete file
    StatusCode::NOT_IMPLEMENTED
}

async fn find_duplicates(
    State(state): State<AppState>,
) -> Json<Vec<Vec<FileMeta>>> {
    // TODO: Group by checksum, return groups with 2+ files
    Json(vec![])
}

async fn stats(
    State(state): State<AppState>,
) -> Json<serde_json::Value> {
    // TODO: Calculate total files, total size, breakdown by mimeType
    Json(serde_json::json!({
        "totalFiles": 0,
        "totalSize": 0,
        "byMimeType": {}
    }))
}
`,
    'README.md': `# File Metadata Service (Rust)

Implement the handlers in \`src/main.rs\`.
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
      },
      installCommand: 'cargo build --release',
      runCommand: './target/release/candidate',
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

describe('File Metadata Service - Public Tests', () => {
  test('GET /health', async () => {
    expect((await request(BASE_URL).get('/health')).body).toEqual({ ok: true });
  });

  test('POST /files registers file', async () => {
    const res = await request(BASE_URL)
      .post('/files')
      .send({ name: 'test.pdf', size: 1024, mimeType: 'application/pdf', checksum: 'abc' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('test.pdf');
  });

  test('GET /files returns array', async () => {
    const created = await request(BASE_URL).post('/files').send({ name: 'list.txt', size: 100, mimeType: 'text/plain', checksum: 'xyz' });
    expect(created.status).toBe(201);
    const res = await request(BASE_URL).get('/files');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some(f => f.id === created.body.id)).toBe(true);
  });

  test('GET /files?mimeType filters', async () => {
    const img = await request(BASE_URL).post('/files').send({ name: 'img.png', size: 500, mimeType: 'image/png', checksum: 'img1' });
    const other = await request(BASE_URL).post('/files').send({ name: 'other.txt', size: 10, mimeType: 'text/plain', checksum: 'txt1' });
    expect(img.status).toBe(201);
    expect(other.status).toBe(201);
    const res = await request(BASE_URL).get('/files?mimeType=image/png');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.some(f => f.id === img.body.id)).toBe(true);
    expect(res.body.some(f => f.id === other.body.id)).toBe(false);
    expect(res.body.every(f => f.mimeType === 'image/png')).toBe(true);
  });

  test('GET /files?mimeType=image/* supports wildcard filtering', async () => {
    const a = await request(BASE_URL).post('/files').send({ name: 'a.jpg', size: 100, mimeType: 'image/jpeg', checksum: 'w1' });
    const b = await request(BASE_URL).post('/files').send({ name: 'b.png', size: 100, mimeType: 'image/png', checksum: 'w2' });
    const c = await request(BASE_URL).post('/files').send({ name: 'c.txt', size: 100, mimeType: 'text/plain', checksum: 'w3' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(c.status).toBe(201);

    const res = await request(BASE_URL).get('/files?mimeType=image/*');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const ids = res.body.map(f => f.id);
    expect(ids).toContain(a.body.id);
    expect(ids).toContain(b.body.id);
    expect(ids).not.toContain(c.body.id);
    expect(res.body.every(f => typeof f.mimeType === 'string' && f.mimeType.startsWith('image/'))).toBe(true);
  });

  test('GET /files?minSize filters out smaller files', async () => {
    const small = await request(BASE_URL).post('/files').send({ name: 'small.bin', size: 100, mimeType: 'application/octet-stream', checksum: 's1' });
    const large = await request(BASE_URL).post('/files').send({ name: 'large.bin', size: 10000, mimeType: 'application/octet-stream', checksum: 's2' });
    expect(small.status).toBe(201);
    expect(large.status).toBe(201);

    const res = await request(BASE_URL).get('/files?minSize=5000');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const ids = res.body.map(f => f.id);
    expect(ids).toContain(large.body.id);
    expect(ids).not.toContain(small.body.id);
    expect(res.body.every(f => typeof f.size === 'number' && f.size >= 5000)).toBe(true);
  });

  test('GET /files/{id}', async () => {
    const create = await request(BASE_URL).post('/files').send({ name: 'get.txt', size: 50, mimeType: 'text/plain', checksum: 'get1' });
    const get = await request(BASE_URL).get('/files/' + create.body.id);
    expect(get.status).toBe(200);
    expect(get.body).toEqual(expect.objectContaining({ id: create.body.id, name: 'get.txt' }));
  });

  test('DELETE /files/{id}', async () => {
    const create = await request(BASE_URL).post('/files').send({ name: 'del.txt', size: 50, mimeType: 'text/plain', checksum: 'del1' });
    expect((await request(BASE_URL).delete('/files/' + create.body.id)).status).toBe(204);
  });

  test('GET /files/duplicates', async () => {
    const checksum = 'dup_' + Date.now();
    await request(BASE_URL).post('/files').send({ name: 'a.txt', size: 100, mimeType: 'text/plain', checksum });
    await request(BASE_URL).post('/files').send({ name: 'b.txt', size: 100, mimeType: 'text/plain', checksum });
    const res = await request(BASE_URL).get('/files/duplicates');
    expect(res.body.some(group => group.length >= 2)).toBe(true);
  });

  test('GET /stats', async () => {
    const res = await request(BASE_URL).get('/stats');
    expect(typeof res.body.totalFiles).toBe('number');
    expect(typeof res.body.totalSize).toBe('number');
  });
});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('BASE_URL is required');

const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 8);

describe('File Metadata Service - Hidden Tests', () => {
  test('Registers with random data', async () => {
    const name = 'file_' + randomString() + '.txt';
    const size = Math.floor(Math.random() * 10000);
    const res = await request(BASE_URL)
      .post('/files')
      .send({ name, size, mimeType: 'text/plain', checksum: randomString() });
    expect(res.body.name).toBe(name);
    expect(res.body.size).toBe(size);
  });

  test('Size filtering works', async () => {
    const checksum = 'size_' + randomString();
    const small = await request(BASE_URL).post('/files').send({ name: 'small.txt', size: 100, mimeType: 'text/plain', checksum: checksum + '_s' });
    const large = await request(BASE_URL).post('/files').send({ name: 'large.txt', size: 10000, mimeType: 'text/plain', checksum: checksum + '_l' });
    expect(small.status).toBe(201);
    expect(large.status).toBe(201);
    
    const filtered = await request(BASE_URL).get('/files?minSize=5000');
    expect(filtered.status).toBe(200);
    expect(Array.isArray(filtered.body)).toBe(true);
    expect(filtered.body.length).toBeGreaterThan(0);
    const ids = filtered.body.map(f => f.id);
    expect(ids).toContain(large.body.id);
    expect(ids).not.toContain(small.body.id);
    expect(filtered.body.every(f => f.size >= 5000)).toBe(true);
  });

  test('Wildcard mimeType filtering', async () => {
    const checksum = 'wild_' + randomString();
    const a = await request(BASE_URL).post('/files').send({ name: 'a.jpg', size: 100, mimeType: 'image/jpeg', checksum: checksum + '_1' });
    const b = await request(BASE_URL).post('/files').send({ name: 'b.png', size: 100, mimeType: 'image/png', checksum: checksum + '_2' });
    const c = await request(BASE_URL).post('/files').send({ name: 'c.txt', size: 100, mimeType: 'text/plain', checksum: checksum + '_3' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(c.status).toBe(201);
    
    const filtered = await request(BASE_URL).get('/files?mimeType=image/*');
    expect(filtered.status).toBe(200);
    expect(Array.isArray(filtered.body)).toBe(true);
    expect(filtered.body.length).toBeGreaterThanOrEqual(2);
    const ids = filtered.body.map(f => f.id);
    expect(ids).toContain(a.body.id);
    expect(ids).toContain(b.body.id);
    expect(ids).not.toContain(c.body.id);
    expect(filtered.body.every(f => f.mimeType.startsWith('image/'))).toBe(true);
  });

  test('Duplicates groups by checksum', async () => {
    const checksum = 'dup_group_' + randomString();
    await request(BASE_URL).post('/files').send({ name: 'dup1.txt', size: 100, mimeType: 'text/plain', checksum });
    await request(BASE_URL).post('/files').send({ name: 'dup2.txt', size: 100, mimeType: 'text/plain', checksum });
    await request(BASE_URL).post('/files').send({ name: 'dup3.txt', size: 100, mimeType: 'text/plain', checksum });
    
    const dups = await request(BASE_URL).get('/files/duplicates');
    const group = dups.body.find(g => g.some(f => f.checksum === checksum));
    expect(group).toBeDefined();
    expect(group.length).toBe(3);
  });

  test('Stats updates correctly', async () => {
    const before = await request(BASE_URL).get('/stats');
    const beforeCount = before.body.totalFiles;
    
    await request(BASE_URL).post('/files').send({ name: 'stat.txt', size: 500, mimeType: 'text/plain', checksum: 'stat_' + randomString() });
    
    const after = await request(BASE_URL).get('/stats');
    expect(after.body.totalFiles).toBe(beforeCount + 1);
  });
});
`,
};

