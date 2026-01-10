import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Poll/Voting API (FastAPI)',
  description: `# Poll/Voting API

## What You're Building

You're building a **polling and voting service** like Strawpoll or Twitter Polls. Users can create polls with multiple options, cast votes, and view results with percentages.

This challenge tests your ability to handle more complex business logic: preventing duplicate votes, calculating percentages, and optional expiration.

---

## API Contract

### Polls

#### \`POST /polls\`
Create a new poll.

**Request:**
\`\`\`json
{
  "question": "What's your favorite programming language?",
  "options": ["Python", "JavaScript", "Go", "Rust"],
  "expiresIn": 3600
}
\`\`\`
- \`options\`: Array of 2-10 option strings
- \`expiresIn\`: Optional, seconds until poll expires (null = never expires)

**Success (201 Created):**
\`\`\`json
{
  "id": "poll_1",
  "question": "What's your favorite programming language?",
  "options": [
    { "id": "opt_1", "text": "Python", "votes": 0 },
    { "id": "opt_2", "text": "JavaScript", "votes": 0 },
    { "id": "opt_3", "text": "Go", "votes": 0 },
    { "id": "opt_4", "text": "Rust", "votes": 0 }
  ],
  "totalVotes": 0,
  "expiresAt": "2024-01-15T11:00:00.000Z",
  "createdAt": "2024-01-15T10:00:00.000Z"
}
\`\`\`

**Errors:**
- \`400\` - \`{ "error": "question is required" }\`
- \`400\` - \`{ "error": "at least 2 options required" }\`
- \`400\` - \`{ "error": "maximum 10 options allowed" }\`

---

#### \`GET /polls/{id}\`
Get a poll with current results.

**Success (200 OK):** Returns poll object (same as creation response, with updated votes)
**Error:** \`404\` - \`{ "error": "poll not found" }\`

---

#### \`POST /polls/{id}/vote\`
Cast a vote on a poll.

**Request:**
\`\`\`json
{
  "optionId": "opt_1",
  "voterId": "user_abc123"
}
\`\`\`
- \`voterId\`: A unique identifier for the voter (to prevent double-voting)

**Success (200 OK):**
\`\`\`json
{
  "success": true,
  "optionId": "opt_1",
  "totalVotes": 1
}
\`\`\`

**Errors:**
- \`404\` - poll not found
- \`400\` - \`{ "error": "optionId is required" }\`
- \`400\` - \`{ "error": "voterId is required" }\`
- \`400\` - \`{ "error": "invalid option" }\`
- \`400\` - \`{ "error": "already voted" }\`
- \`410\` - \`{ "error": "poll has expired" }\`

---

#### \`GET /polls/{id}/results\`
Get detailed poll results with percentages.

**Success (200 OK):**
\`\`\`json
{
  "id": "poll_1",
  "question": "What's your favorite programming language?",
  "totalVotes": 100,
  "options": [
    { "id": "opt_1", "text": "Python", "votes": 45, "percentage": 45.0 },
    { "id": "opt_2", "text": "JavaScript", "votes": 30, "percentage": 30.0 },
    { "id": "opt_3", "text": "Go", "votes": 15, "percentage": 15.0 },
    { "id": "opt_4", "text": "Rust", "votes": 10, "percentage": 10.0 }
  ],
  "isExpired": false
}
\`\`\`

**Error:** \`404\` - poll not found

---

#### \`GET /health\`
Health check.

**Success (200 OK):** \`{ "ok": true }\`

---

## Examples

### Example 1: Create and Vote

\`\`\`bash
# Create a poll
curl -X POST http://localhost:3000/polls \\
  -H "Content-Type: application/json" \\
  -d '{"question": "Tabs or spaces?", "options": ["Tabs", "Spaces"]}'
# Response: {"id":"poll_1","question":"Tabs or spaces?","options":[...]}

# Cast a vote
curl -X POST http://localhost:3000/polls/poll_1/vote \\
  -H "Content-Type: application/json" \\
  -d '{"optionId": "opt_1", "voterId": "user_123"}'
# Response: {"success":true,"optionId":"opt_1","totalVotes":1}

# View results
curl http://localhost:3000/polls/poll_1/results
# Response: {"id":"poll_1","totalVotes":1,"options":[{"text":"Tabs","votes":1,"percentage":100},...]}
\`\`\`

### Example 2: Prevent Double Voting

\`\`\`bash
# First vote - succeeds
curl -X POST http://localhost:3000/polls/poll_1/vote \\
  -d '{"optionId": "opt_1", "voterId": "user_abc"}'
# Response: 200 OK

# Same voter tries again - fails
curl -X POST http://localhost:3000/polls/poll_1/vote \\
  -d '{"optionId": "opt_2", "voterId": "user_abc"}'
# Response: 400 {"error": "already voted"}
\`\`\`

---

## Hints (Explore These)

1. **Option IDs**: Generate unique IDs for each option when creating the poll (e.g., \`opt_1\`, \`opt_2\`).

2. **Vote Tracking**: Store a Set of \`voterId\`s per poll to detect duplicates.

3. **Percentage Calculation**: \`percentage = (votes / totalVotes) * 100\`. Handle division by zero (0 votes = 0%).

4. **Expiration Check**: Compare \`expiresAt\` with current time. Use \`datetime.now()\`.

5. **HTTP 410 Gone**: The \`410 Gone\` status code indicates a resource that existed but is no longer available (perfect for expired polls).

---

## Constraints

- Poll IDs: \`poll_1\`, \`poll_2\`, etc.
- Option IDs: \`opt_1\`, \`opt_2\`, etc. (per poll)
- Minimum 2 options, maximum 10 options
- Percentages should be floats (e.g., 33.33, not 33)
- Expired polls return 410 for voting but 200 for viewing results (with \`isExpired: true\`)

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Health endpoint | 1 |
| Create poll | 2 |
| Get poll | 2 |
| Vote on poll | 3 |
| Prevent duplicate votes | 2 |
| Results with percentages | 2 |
| Option count validation | 2 |
| Expiration handling | 2 |

**Total: ~16 tests**
`,

  starterFiles: {
    'main.py': `import os
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI()

# In-memory storage
polls = {}  # poll_id -> poll data
votes = {}  # poll_id -> set of voter_ids
poll_counter = 0

class CreatePollRequest(BaseModel):
    question: str
    options: List[str]
    expiresIn: Optional[int] = None  # seconds

class VoteRequest(BaseModel):
    optionId: str
    voterId: str

def generate_poll_id():
    global poll_counter
    poll_counter += 1
    return f"poll_{poll_counter}"

@app.get("/health")
def health():
    return {"ok": True}

# ==================== POLLS ====================

@app.post("/polls", status_code=status.HTTP_201_CREATED)
def create_poll(request: CreatePollRequest):
    # TODO: Validate question is not empty
    # TODO: Validate at least 2 options, max 10
    # TODO: Generate poll_id and option IDs (opt_1, opt_2, ...)
    # TODO: Calculate expiresAt if expiresIn provided
    # TODO: Store poll and return
    raise HTTPException(status_code=501, detail="Not implemented")

@app.get("/polls/{poll_id}")
def get_poll(poll_id: str):
    # TODO: Return poll if found
    # TODO: 404 if not found
    raise HTTPException(status_code=501, detail="Not implemented")

@app.post("/polls/{poll_id}/vote")
def vote_on_poll(poll_id: str, request: VoteRequest):
    # TODO: Check poll exists (404)
    # TODO: Check poll not expired (410)
    # TODO: Validate optionId exists in poll
    # TODO: Check voter hasn't already voted (400 "already voted")
    # TODO: Increment vote count for option
    # TODO: Add voterId to votes set
    # TODO: Return success response
    raise HTTPException(status_code=501, detail="Not implemented")

@app.get("/polls/{poll_id}/results")
def get_poll_results(poll_id: str):
    # TODO: Get poll (404 if not found)
    # TODO: Calculate percentages for each option
    # TODO: Determine if expired
    # TODO: Return results with percentages
    raise HTTPException(status_code=501, detail="Not implemented")
`,

    'README.md': `# Poll/Voting API

A polling and voting service built with FastAPI.

## Getting Started

\`\`\`bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3000
\`\`\`

## API Endpoints

- \`POST /polls\` - Create a poll
- \`GET /polls/{id}\` - Get a poll
- \`POST /polls/{id}/vote\` - Cast a vote
- \`GET /polls/{id}/results\` - Get results with percentages
- \`GET /health\` - Health check

## Your Task

Implement the TODO sections in \`main.py\`.

## Key Concepts

1. **Duplicate Vote Prevention**: Track voterId per poll
2. **Percentage Calculation**: votes / totalVotes * 100
3. **Expiration**: Check datetime and return 410 for voting
`
  },

  dependencies: {},
  nodeVersion: '20',

  runner: {
    mode: 'http',
    runtime: 'python',
    candidate: {
      image: 'python:3.11-slim',
      workdir: '/app',
      generatedFiles: {
        'requirements.txt': 'fastapi==0.115.5\nuvicorn==0.32.1\npydantic==2.10.2\n',
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
  },

  publicTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) throw new Error('BASE_URL is required');

describe('Poll/Voting API - Public Tests', () => {

  test('GET /health returns ok', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test('POST /polls creates a poll', async () => {
    const res = await request(BASE_URL)
      .post('/polls')
      .send({
        question: 'Favorite color?',
        options: ['Red', 'Blue', 'Green'],
      });
    
    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^poll_/),
      question: 'Favorite color?',
      totalVotes: 0,
    }));
    expect(res.body.options).toHaveLength(3);
    expect(res.body.options[0]).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^opt_/),
      text: 'Red',
      votes: 0,
    }));
  });

  test('POST /polls returns 400 for less than 2 options', async () => {
    // Prove endpoint works
    const okRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Valid?', options: ['A', 'B'] });
    expect(okRes.status).toBe(201);
    
    const res = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Invalid?', options: ['Only one'] });
    
    expect(res.status).toBe(400);
  });

  test('POST /polls returns 400 for more than 10 options', async () => {
    const options = Array.from({ length: 11 }, (_, i) => \`Option \${i + 1}\`);
    
    const res = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Too many?', options });
    
    expect(res.status).toBe(400);
  });

  test('GET /polls/{id} returns the poll', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Get test?', options: ['Yes', 'No'] });
    
    const res = await request(BASE_URL).get('/polls/' + createRes.body.id);
    
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createRes.body.id);
    expect(res.body.question).toBe('Get test?');
  });

  test('GET /polls/{id} returns 404 for non-existent poll', async () => {
    // Prove endpoint works
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Valid?', options: ['A', 'B'] });
    const validGet = await request(BASE_URL).get('/polls/' + createRes.body.id);
    expect(validGet.status).toBe(200);
    
    const res = await request(BASE_URL).get('/polls/poll_nonexistent');
    expect(res.status).toBe(404);
  });

  test('POST /polls/{id}/vote casts a vote', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Vote test?', options: ['A', 'B'] });
    
    const optionId = createRes.body.options[0].id;
    
    const res = await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId, voterId: 'user_123' });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.optionId).toBe(optionId);
    expect(res.body.totalVotes).toBe(1);
  });

  test('POST /polls/{id}/vote prevents duplicate voting', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Duplicate test?', options: ['X', 'Y'] });
    
    const optionId = createRes.body.options[0].id;
    const voterId = 'unique_voter_' + Date.now();
    
    // First vote succeeds
    const vote1 = await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId, voterId });
    expect(vote1.status).toBe(200);
    
    // Second vote fails
    const vote2 = await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[1].id, voterId });
    expect(vote2.status).toBe(400);
    expect(vote2.body.error).toMatch(/already voted/i);
  });

  test('GET /polls/{id}/results returns percentages', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Percentage test?', options: ['A', 'B'] });
    
    // Vote twice for A, once for B
    await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[0].id, voterId: 'v1' });
    await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[0].id, voterId: 'v2' });
    await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[1].id, voterId: 'v3' });
    
    const res = await request(BASE_URL).get('/polls/' + createRes.body.id + '/results');
    
    expect(res.status).toBe(200);
    expect(res.body.totalVotes).toBe(3);
    
    const optA = res.body.options.find(o => o.text === 'A');
    const optB = res.body.options.find(o => o.text === 'B');
    
    expect(optA.votes).toBe(2);
    expect(optA.percentage).toBeCloseTo(66.67, 0);
    expect(optB.votes).toBe(1);
    expect(optB.percentage).toBeCloseTo(33.33, 0);
  });

  test('POST /polls/{id}/vote returns 400 for invalid optionId', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Invalid option?', options: ['A', 'B'] });
    
    // Prove voting works
    const validVote = await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[0].id, voterId: 'valid_voter' });
    expect(validVote.status).toBe(200);
    
    const res = await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: 'opt_invalid', voterId: 'new_voter' });
    
    expect(res.status).toBe(400);
  });

  test('Expired polls reject voting with 410 but results still work', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Expire test?', options: ['A', 'B'], expiresIn: 1 });

    expect(createRes.status).toBe(201);
    expect(createRes.body.expiresAt).toBeDefined();

    const pollId = createRes.body.id;
    const optionId = createRes.body.options[0].id;

    // Vote before expiry
    const vote1 = await request(BASE_URL)
      .post('/polls/' + pollId + '/vote')
      .send({ optionId, voterId: 'pre_expire_voter' });
    expect(vote1.status).toBe(200);

    // Wait until after expiresAt (avoid boundary flake)
    const expiresAtMs = new Date(createRes.body.expiresAt).getTime();
    expect(Number.isFinite(expiresAtMs)).toBe(true);
    const waitMs = expiresAtMs - Date.now() + 200;
    expect(waitMs).toBeLessThanOrEqual(5000);
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

    const vote2 = await request(BASE_URL)
      .post('/polls/' + pollId + '/vote')
      .send({ optionId, voterId: 'post_expire_voter' });
    expect(vote2.status).toBe(410);

    const results = await request(BASE_URL).get('/polls/' + pollId + '/results');
    expect(results.status).toBe(200);
    expect(results.body.isExpired).toBe(true);
  });

});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) throw new Error('BASE_URL is required');

const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 8);

describe('Poll/Voting API - Hidden Tests (Anti-Hardcoding)', () => {

  test('POST /polls works with random questions and options', async () => {
    const question = 'Question_' + randomString();
    const options = [
      'Option_' + randomString(),
      'Option_' + randomString(),
      'Option_' + randomString(),
    ];
    
    const res = await request(BASE_URL)
      .post('/polls')
      .send({ question, options });
    
    expect(res.status).toBe(201);
    expect(res.body.question).toBe(question);
    expect(res.body.options.map(o => o.text)).toEqual(options);
  });

  test('GET /polls/{id} works with random polls', async () => {
    const question = 'RandomGet_' + randomString();
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question, options: ['A', 'B'] });
    
    const getRes = await request(BASE_URL).get('/polls/' + createRes.body.id);
    
    expect(getRes.status).toBe(200);
    expect(getRes.body.question).toBe(question);
  });

  test('GET /polls/{id} returns 404 for random non-existent IDs', async () => {
    // Prove endpoint works
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Valid', options: ['A', 'B'] });
    expect((await request(BASE_URL).get('/polls/' + createRes.body.id)).status).toBe(200);
    
    const randomIds = ['poll_' + randomString(), 'poll_999_' + Date.now()];
    for (const id of randomIds) {
      const res = await request(BASE_URL).get('/polls/' + id);
      expect(res.status).toBe(404);
    }
  });

  test('POST /polls/{id}/vote works with random voterIds', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'RandomVote_' + randomString(), options: ['X', 'Y'] });
    
    const voterId = 'voter_' + randomString();
    
    const res = await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[0].id, voterId });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Duplicate vote detection works with random voterIds', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'DupVote_' + randomString(), options: ['A', 'B'] });
    
    const voterId = 'dup_voter_' + randomString();
    
    await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[0].id, voterId });
    
    const dupRes = await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[1].id, voterId });
    
    expect(dupRes.status).toBe(400);
  });

  test('Multiple random voters can vote', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'MultiVoter_' + randomString(), options: ['P', 'Q'] });
    
    const voteCount = 3 + Math.floor(Math.random() * 3); // 3-5 votes
    
    for (let i = 0; i < voteCount; i++) {
      const res = await request(BASE_URL)
        .post('/polls/' + createRes.body.id + '/vote')
        .send({
          optionId: createRes.body.options[i % 2].id,
          voterId: 'voter_' + i + '_' + randomString(),
        });
      expect(res.status).toBe(200);
    }
    
    const resultsRes = await request(BASE_URL).get('/polls/' + createRes.body.id + '/results');
    expect(resultsRes.body.totalVotes).toBe(voteCount);
  });

  test('Results percentages are calculated correctly with random vote distribution', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Percent_' + randomString(), options: ['X', 'Y', 'Z'] });
    
    // Vote: 2 for X, 1 for Y, 1 for Z = total 4
    const voters = ['v1', 'v2', 'v3', 'v4'].map(v => v + '_' + randomString());
    
    await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[0].id, voterId: voters[0] });
    await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[0].id, voterId: voters[1] });
    await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[1].id, voterId: voters[2] });
    await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[2].id, voterId: voters[3] });
    
    const results = await request(BASE_URL).get('/polls/' + createRes.body.id + '/results');
    
    expect(results.body.totalVotes).toBe(4);
    
    const optX = results.body.options.find(o => o.text === 'X');
    expect(optX.votes).toBe(2);
    expect(optX.percentage).toBe(50);
  });

  test('Results show 0% when no votes', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'NoVotes_' + randomString(), options: ['A', 'B'] });
    
    const results = await request(BASE_URL).get('/polls/' + createRes.body.id + '/results');
    
    expect(results.body.totalVotes).toBe(0);
    for (const opt of results.body.options) {
      expect(opt.percentage).toBe(0);
    }
  });

  test('Option validation rejects random invalid option IDs', async () => {
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'InvalidOpt_' + randomString(), options: ['A', 'B'] });
    
    // Prove valid voting works
    const validVote = await request(BASE_URL)
      .post('/polls/' + createRes.body.id + '/vote')
      .send({ optionId: createRes.body.options[0].id, voterId: 'v_' + randomString() });
    expect(validVote.status).toBe(200);
    
    // Invalid option IDs
    const invalidIds = ['opt_invalid_' + randomString(), 'wrong_' + Date.now()];
    for (const optId of invalidIds) {
      const res = await request(BASE_URL)
        .post('/polls/' + createRes.body.id + '/vote')
        .send({ optionId: optId, voterId: 'new_' + randomString() });
      expect(res.status).toBe(400);
    }
  });

  test('Each poll tracks votes independently', async () => {
    const poll1 = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Poll1_' + randomString(), options: ['A', 'B'] });
    const poll2 = await request(BASE_URL)
      .post('/polls')
      .send({ question: 'Poll2_' + randomString(), options: ['X', 'Y'] });
    
    // Vote on poll1
    await request(BASE_URL)
      .post('/polls/' + poll1.body.id + '/vote')
      .send({ optionId: poll1.body.options[0].id, voterId: 'voter_1' });
    
    // Check poll2 has no votes
    const results2 = await request(BASE_URL).get('/polls/' + poll2.body.id + '/results');
    expect(results2.body.totalVotes).toBe(0);
  });

  test('Expired polls return 410 for voting (randomized)', async () => {
    const question = 'Expire_' + randomString();
    const createRes = await request(BASE_URL)
      .post('/polls')
      .send({ question, options: ['A', 'B'], expiresIn: 1 });

    expect(createRes.status).toBe(201);
    expect(createRes.body.expiresAt).toBeDefined();

    const pollId = createRes.body.id;
    const optionId = createRes.body.options[0].id;

    // Vote immediately (should work)
    const okVote = await request(BASE_URL)
      .post('/polls/' + pollId + '/vote')
      .send({ optionId, voterId: 'v_' + randomString() });
    expect(okVote.status).toBe(200);

    // Wait until after expiresAt (avoid boundary flake)
    const expiresAtMs = new Date(createRes.body.expiresAt).getTime();
    expect(Number.isFinite(expiresAtMs)).toBe(true);
    const waitMs = expiresAtMs - Date.now() + 200;
    expect(waitMs).toBeLessThanOrEqual(5000);
    if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));

    const expiredVote = await request(BASE_URL)
      .post('/polls/' + pollId + '/vote')
      .send({ optionId, voterId: 'v_' + randomString() });
    expect(expiredVote.status).toBe(410);

    const results = await request(BASE_URL).get('/polls/' + pollId + '/results');
    expect(results.status).toBe(200);
    expect(results.body.isExpired).toBe(true);
  });

});
`,
};

