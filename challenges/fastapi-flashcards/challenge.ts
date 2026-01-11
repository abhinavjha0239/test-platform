import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Flashcard API (FastAPI)',
  description: `# Flashcard API

## What You're Building

You're building a **flashcard study app backend** using FastAPI. Users can create decks of cards, add flashcards to decks, and track their study progress. Think of apps like Anki or Quizlet.

This is a great way to learn FastAPI's async capabilities and Pydantic validation.

---

## API Contract

### Decks

#### \`POST /decks\`
Create a new flashcard deck.

**Request:**
\`\`\`json
{ "name": "Spanish Vocabulary" }
\`\`\`

**Success (201 Created):**
\`\`\`json
{
  "id": "deck_1",
  "name": "Spanish Vocabulary",
  "cardCount": 0,
  "createdAt": "2024-01-15T10:00:00.000Z"
}
\`\`\`

**Errors:**
- \`400\` - \`{ "error": "name is required" }\`

---

#### \`GET /decks\`
List all decks.

**Success (200 OK):**
\`\`\`json
[
  { "id": "deck_1", "name": "Spanish Vocabulary", "cardCount": 25, "createdAt": "..." }
]
\`\`\`

---

#### \`GET /decks/{id}\`
Get a specific deck.

**Success (200 OK):** Returns the deck object
**Error:** \`404\` - \`{ "error": "deck not found" }\`

---

### Cards

#### \`POST /decks/{id}/cards\`
Add a flashcard to a deck.

**Request:**
\`\`\`json
{
  "front": "Hola",
  "back": "Hello"
}
\`\`\`

**Success (201 Created):**
\`\`\`json
{
  "id": "card_1",
  "deckId": "deck_1",
  "front": "Hola",
  "back": "Hello",
  "reviewCount": 0,
  "lastReviewed": null,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
\`\`\`

**Errors:**
- \`404\` - \`{ "error": "deck not found" }\`
- \`400\` - \`{ "error": "front is required" }\`
- \`400\` - \`{ "error": "back is required" }\`

---

#### \`GET /decks/{id}/cards\`
Get all cards in a deck.

**Success (200 OK):**
\`\`\`json
[
  { "id": "card_1", "deckId": "deck_1", "front": "Hola", "back": "Hello", ... }
]
\`\`\`

**Error:** \`404\` - deck not found

---

#### \`POST /cards/{id}/review\`
Mark a card as reviewed (increments review count).

**Success (200 OK):**
\`\`\`json
{
  "id": "card_1",
  "deckId": "deck_1",
  "front": "Hola",
  "back": "Hello",
  "reviewCount": 1,
  "lastReviewed": "2024-01-15T11:00:00.000Z",
  "createdAt": "..."
}
\`\`\`

**Error:** \`404\` - \`{ "error": "card not found" }\`

---

#### \`GET /decks/{id}/study\`
Get the next card to study (card with lowest review count, or oldest lastReviewed).

**Success (200 OK):** Returns a card object
**Success (204 No Content):** Deck has no cards
**Error:** \`404\` - deck not found

---

#### \`GET /health\`
Health check.

**Success (200 OK):** \`{ "ok": true }\`

---

## Examples

### Example 1: Create a Deck and Add Cards

\`\`\`bash
# Create a deck
curl -X POST http://localhost:3000/decks \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Spanish 101"}'
# Response: {"id":"deck_1","name":"Spanish 101","cardCount":0,...}

# Add a card
curl -X POST http://localhost:3000/decks/deck_1/cards \\
  -H "Content-Type: application/json" \\
  -d '{"front": "Gracias", "back": "Thank you"}'
# Response: {"id":"card_1","deckId":"deck_1","front":"Gracias",...}
\`\`\`

### Example 2: Study Flow

\`\`\`bash
# Get next card to study
curl http://localhost:3000/decks/deck_1/study
# Response: {"id":"card_1","front":"Gracias","back":"Thank you",...}

# Mark as reviewed
curl -X POST http://localhost:3000/cards/card_1/review
# Response: {"id":"card_1",...,"reviewCount":1,"lastReviewed":"..."}
\`\`\`

---

## Hints (Explore These)

1. **FastAPI Basics**: Use \`@app.post("/path")\` and \`@app.get("/path")\` decorators. Return dicts directly - FastAPI handles JSON conversion.

2. **Path Parameters**: Use \`/decks/{deck_id}\` syntax. FastAPI extracts \`deck_id\` from the URL.

3. **Pydantic Models**: Consider using Pydantic for request body validation:
   \`\`\`python
   from pydantic import BaseModel
   
   class CreateDeck(BaseModel):
       name: str
   \`\`\`

4. **HTTP Status Codes**: Use \`Response\` and \`status_code\` parameter:
   \`\`\`python
   from fastapi import Response, status
   
   @app.post("/items", status_code=status.HTTP_201_CREATED)
   def create_item():
       ...
   \`\`\`

5. **Study Algorithm**: The simplest approach is to find the card with the lowest \`reviewCount\`. If tied, pick the one with oldest \`lastReviewed\`.

---

## Constraints

- IDs should be prefixed (\`deck_\`, \`card_\`) followed by incrementing numbers
- \`cardCount\` in deck should update when cards are added
- All timestamps in ISO 8601 format
- \`lastReviewed\` starts as \`null\` and is set on first review

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Health endpoint | 1 |
| Create deck | 2 |
| List/Get decks | 2 |
| Add card to deck | 2 |
| Get cards from deck | 2 |
| Review card | 2 |
| Study endpoint | 2 |
| Validation errors | 2 |

**Total: ~15 tests**
`,

  starterFiles: {
    'main.py': `import os
from datetime import datetime
from fastapi import FastAPI, HTTPException, Response, status
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI()

# In-memory storage
decks = {}  # deck_id -> deck
cards = {}  # card_id -> card
deck_counter = 0
card_counter = 0

# Pydantic models for request validation
class CreateDeckRequest(BaseModel):
    name: str

class CreateCardRequest(BaseModel):
    front: str
    back: str

# Helper to generate IDs
def generate_deck_id():
    global deck_counter
    deck_counter += 1
    return f"deck_{deck_counter}"

def generate_card_id():
    global card_counter
    card_counter += 1
    return f"card_{card_counter}"

# Health check
@app.get("/health")
def health():
    return {"ok": True}

# ==================== DECKS ====================

@app.post("/decks", status_code=status.HTTP_201_CREATED)
def create_deck(request: CreateDeckRequest):
    # TODO: Validate name is not empty
    # TODO: Create deck with id, name, cardCount=0, createdAt
    # TODO: Store in decks dict and return
    raise HTTPException(status_code=501, detail="Not implemented")

@app.get("/decks")
def list_decks():
    # TODO: Return list of all decks
    # Hint: Use list(decks.values())
    return []

@app.get("/decks/{deck_id}")
def get_deck(deck_id: str):
    # TODO: Return deck if found
    # TODO: Raise 404 if not found
    raise HTTPException(status_code=501, detail="Not implemented")

# ==================== CARDS ====================

@app.post("/decks/{deck_id}/cards", status_code=status.HTTP_201_CREATED)
def create_card(deck_id: str, request: CreateCardRequest):
    # TODO: Check deck exists (404 if not)
    # TODO: Validate front and back are not empty
    # TODO: Create card with id, deckId, front, back, reviewCount=0, lastReviewed=None, createdAt
    # TODO: Increment deck's cardCount
    # TODO: Store in cards dict and return
    raise HTTPException(status_code=501, detail="Not implemented")

@app.get("/decks/{deck_id}/cards")
def get_deck_cards(deck_id: str):
    # TODO: Check deck exists (404 if not)
    # TODO: Return all cards in this deck
    # Hint: Filter cards where card["deckId"] == deck_id
    raise HTTPException(status_code=501, detail="Not implemented")

@app.post("/cards/{card_id}/review")
def review_card(card_id: str):
    # TODO: Find card (404 if not)
    # TODO: Increment reviewCount
    # TODO: Set lastReviewed to current timestamp
    # TODO: Return updated card
    raise HTTPException(status_code=501, detail="Not implemented")

@app.get("/decks/{deck_id}/study")
def get_study_card(deck_id: str, response: Response):
    # TODO: Check deck exists (404 if not)
    # TODO: Get all cards in deck
    # TODO: If no cards, return 204 No Content
    # TODO: Return card with lowest reviewCount (tie-breaker: oldest lastReviewed or null first)
    raise HTTPException(status_code=501, detail="Not implemented")

# Run with: uvicorn main:app --host 0.0.0.0 --port $PORT
`,

    'README.md': `# Flashcard API

A flashcard study app backend built with FastAPI.

## Getting Started

\`\`\`bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3000
\`\`\`

## API Endpoints

- \`POST /decks\` - Create a deck
- \`GET /decks\` - List all decks
- \`GET /decks/{id}\` - Get a deck
- \`POST /decks/{id}/cards\` - Add a card
- \`GET /decks/{id}/cards\` - Get cards in deck
- \`POST /cards/{id}/review\` - Mark card as reviewed
- \`GET /decks/{id}/study\` - Get next card to study
- \`GET /health\` - Health check

## Your Task

Implement all the TODO sections in \`main.py\`.

## Tips

1. Start with deck CRUD operations
2. Then implement card operations
3. Finally, add the study logic
4. Use Pydantic models for validation
5. Store data in the provided dicts
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

describe('Flashcard API - Public Tests', () => {

  // ==================== HEALTH ====================
  
  test('GET /health returns ok', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  // ==================== DECKS ====================

  test('POST /decks creates a deck', async () => {
    const res = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Test Deck' });
    
    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^deck_/),
      name: 'Test Deck',
      cardCount: 0,
      createdAt: expect.any(String),
    }));
  });

  test('POST /decks returns 400/422 for empty name', async () => {
    // Prove endpoint works
    const okRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Valid Deck' });
    expect(okRes.status).toBe(201);
    
    // Empty name (Pydantic may return 422 for validation)
    const res = await request(BASE_URL)
      .post('/decks')
      .send({ name: '' });
    
    expect([400, 422]).toContain(res.status);
  });

  test('GET /decks returns array of decks', async () => {
    await request(BASE_URL)
      .post('/decks')
      .send({ name: 'List Test Deck' });
    
    const res = await request(BASE_URL).get('/decks');
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /decks/{id} returns specific deck', async () => {
    const createRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Get By ID Deck' });
    expect(createRes.status).toBe(201);
    
    const res = await request(BASE_URL).get('/decks/' + createRes.body.id);
    
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createRes.body.id);
    expect(res.body.name).toBe('Get By ID Deck');
  });

  test('GET /decks/{id} returns 404 for non-existent deck', async () => {
    // Prove endpoint works first
    const createRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Valid Deck' });
    const validGet = await request(BASE_URL).get('/decks/' + createRes.body.id);
    expect(validGet.status).toBe(200);
    
    // Now test 404
    const res = await request(BASE_URL).get('/decks/deck_nonexistent');
    expect(res.status).toBe(404);
  });

  // ==================== CARDS ====================

  test('POST /decks/{id}/cards adds a card', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Card Test Deck' });
    expect(deckRes.status).toBe(201);
    
    const res = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'Hello', back: 'Hola' });
    
    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^card_/),
      deckId: deckRes.body.id,
      front: 'Hello',
      back: 'Hola',
      reviewCount: 0,
      createdAt: expect.any(String),
    }));
  });

  test('POST /decks/{id}/cards updates deck cardCount', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'CardCount Deck' });
    expect(deckRes.status).toBe(201);
    
    // Add a card
    await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'A', back: 'B' });
    
    // Check cardCount updated
    const getDeck = await request(BASE_URL).get('/decks/' + deckRes.body.id);
    expect(getDeck.body.cardCount).toBe(1);
  });

  test('GET /decks/{id}/cards returns cards in deck', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Get Cards Deck' });
    
    await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'Q1', back: 'A1' });
    
    const res = await request(BASE_URL).get('/decks/' + deckRes.body.id + '/cards');
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].front).toBe('Q1');
  });

  test('POST /decks/{id}/cards returns 400/422 when front/back missing', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Validation Deck' });
    expect(deckRes.status).toBe(201);

    // Prove endpoint works
    const ok = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'F', back: 'B' });
    expect(ok.status).toBe(201);

    // Missing front
    const missingFront = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ back: 'Only back' });
    expect([400, 422]).toContain(missingFront.status);

    // Missing back
    const missingBack = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'Only front' });
    expect([400, 422]).toContain(missingBack.status);
  });

  test('POST /decks/{id}/cards returns 404 for non-existent deck (after proving endpoint works)', async () => {
    // Prove cards endpoint works
    const deckRes = await request(BASE_URL).post('/decks').send({ name: 'Deck For 404' });
    expect(deckRes.status).toBe(201);
    const ok = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'X', back: 'Y' });
    expect(ok.status).toBe(201);

    // Now test 404
    const res = await request(BASE_URL)
      .post('/decks/deck_nonexistent/cards')
      .send({ front: 'A', back: 'B' });
    expect(res.status).toBe(404);
  });

  // ==================== REVIEW ====================

  test('POST /cards/{id}/review increments reviewCount', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Review Deck' });
    
    const cardRes = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'Review Q', back: 'Review A' });
    
    expect(cardRes.body.reviewCount).toBe(0);
    
    const reviewRes = await request(BASE_URL)
      .post('/cards/' + cardRes.body.id + '/review');
    
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.reviewCount).toBe(1);
    expect(reviewRes.body.lastReviewed).not.toBeNull();
  });

  test('POST /cards/{id}/review returns 404 for non-existent card (after proving endpoint works)', async () => {
    // Prove review works
    const deckRes = await request(BASE_URL).post('/decks').send({ name: 'Review 404 Deck' });
    const cardRes = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'Q', back: 'A' });
    const ok = await request(BASE_URL).post('/cards/' + cardRes.body.id + '/review');
    expect(ok.status).toBe(200);

    const res = await request(BASE_URL).post('/cards/card_nonexistent/review');
    expect(res.status).toBe(404);
  });

  // ==================== STUDY ====================

  test('GET /decks/{id}/study returns a card to study', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Study Deck' });
    
    await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'Study Q', back: 'Study A' });
    
    const res = await request(BASE_URL).get('/decks/' + deckRes.body.id + '/study');
    
    expect(res.status).toBe(200);
    expect(res.body.front).toBe('Study Q');
  });

  test('GET /decks/{id}/study returns 204 for empty deck', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Empty Study Deck' });
    
    const res = await request(BASE_URL).get('/decks/' + deckRes.body.id + '/study');
    
    expect(res.status).toBe(204);
  });

  test('GET /decks/{id}/study returns 404 for non-existent deck (after proving endpoint works)', async () => {
    const deckRes = await request(BASE_URL).post('/decks').send({ name: 'Study 404 Deck' });
    await request(BASE_URL).post('/decks/' + deckRes.body.id + '/cards').send({ front: 'Q', back: 'A' });
    const ok = await request(BASE_URL).get('/decks/' + deckRes.body.id + '/study');
    expect(ok.status).toBe(200);

    const res = await request(BASE_URL).get('/decks/deck_nonexistent/study');
    expect(res.status).toBe(404);
  });

});
`,

  hiddenTests: `const request = require('supertest');
const BASE_URL = process.env.BASE_URL;

if (!BASE_URL) throw new Error('BASE_URL is required');

// Randomization helpers
const randomString = () => Date.now() + '_' + Math.random().toString(36).slice(2, 8);

describe('Flashcard API - Hidden Tests (Anti-Hardcoding)', () => {

  // ==================== DECKS (RANDOMIZED) ====================

  test('POST /decks works with random deck names', async () => {
    const name = 'Deck_' + randomString();
    
    const res = await request(BASE_URL)
      .post('/decks')
      .send({ name });
    
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    expect(res.body.cardCount).toBe(0);
  });

  test('GET /decks/{id} works with random deck', async () => {
    const name = 'GetDeck_' + randomString();
    const createRes = await request(BASE_URL)
      .post('/decks')
      .send({ name });
    
    const getRes = await request(BASE_URL).get('/decks/' + createRes.body.id);
    
    expect(getRes.status).toBe(200);
    expect(getRes.body.name).toBe(name);
  });

  test('GET /decks/{id} returns 404 for random non-existent IDs', async () => {
    // Prove endpoint works
    const createRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Valid_' + randomString() });
    const validGet = await request(BASE_URL).get('/decks/' + createRes.body.id);
    expect(validGet.status).toBe(200);
    
    // Random non-existent IDs
    const ids = ['deck_' + randomString(), 'deck_999999_' + Date.now()];
    for (const id of ids) {
      const res = await request(BASE_URL).get('/decks/' + id);
      expect(res.status).toBe(404);
    }
  });

  // ==================== CARDS (RANDOMIZED) ====================

  test('POST /decks/{id}/cards works with random front/back', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'CardDeck_' + randomString() });
    
    const front = 'Front_' + randomString();
    const back = 'Back_' + randomString();
    
    const res = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front, back });
    
    expect(res.status).toBe(201);
    expect(res.body.front).toBe(front);
    expect(res.body.back).toBe(back);
    expect(res.body.deckId).toBe(deckRes.body.id);
  });

  test('POST /cards to non-existent deck returns 404', async () => {
    // Prove endpoint works
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'ValidCardDeck_' + randomString() });
    const validCard = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'X', back: 'Y' });
    expect(validCard.status).toBe(201);
    
    // Non-existent deck
    const res = await request(BASE_URL)
      .post('/decks/deck_nonexistent_' + randomString() + '/cards')
      .send({ front: 'A', back: 'B' });
    
    expect(res.status).toBe(404);
  });

  test('Multiple cards increment cardCount correctly', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'MultiCard_' + randomString() });
    
    const cardCount = 3 + Math.floor(Math.random() * 3); // 3-5 cards
    
    for (let i = 0; i < cardCount; i++) {
      await request(BASE_URL)
        .post('/decks/' + deckRes.body.id + '/cards')
        .send({ front: 'F' + i + '_' + randomString(), back: 'B' + i });
    }
    
    const getDeck = await request(BASE_URL).get('/decks/' + deckRes.body.id);
    expect(getDeck.body.cardCount).toBe(cardCount);
  });

  test('GET /decks/{id}/cards returns only cards from that deck', async () => {
    // Create two decks
    const deck1 = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Deck1_' + randomString() });
    const deck2 = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Deck2_' + randomString() });
    
    // Add card to each
    const card1 = await request(BASE_URL)
      .post('/decks/' + deck1.body.id + '/cards')
      .send({ front: 'Deck1Card_' + randomString(), back: 'B1' });
    const card2 = await request(BASE_URL)
      .post('/decks/' + deck2.body.id + '/cards')
      .send({ front: 'Deck2Card_' + randomString(), back: 'B2' });
    
    // Get cards from deck1
    const cards1 = await request(BASE_URL).get('/decks/' + deck1.body.id + '/cards');
    const ids = cards1.body.map(c => c.id);
    
    expect(ids).toContain(card1.body.id);
    expect(ids).not.toContain(card2.body.id);
  });

  // ==================== REVIEW (RANDOMIZED) ====================

  test('POST /cards/{id}/review works with random cards', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'ReviewDeck_' + randomString() });
    
    const cardRes = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'ReviewF_' + randomString(), back: 'ReviewB' });
    
    const review1 = await request(BASE_URL)
      .post('/cards/' + cardRes.body.id + '/review');
    expect(review1.status).toBe(200);
    expect(review1.body.reviewCount).toBe(1);
    
    const review2 = await request(BASE_URL)
      .post('/cards/' + cardRes.body.id + '/review');
    expect(review2.body.reviewCount).toBe(2);
  });

  test('POST /cards/{id}/review returns 404 for non-existent card', async () => {
    // Prove review works
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Review404Deck_' + randomString() });
    const cardRes = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'X', back: 'Y' });
    const validReview = await request(BASE_URL)
      .post('/cards/' + cardRes.body.id + '/review');
    expect(validReview.status).toBe(200);
    
    // Non-existent card
    const res = await request(BASE_URL)
      .post('/cards/card_nonexistent_' + randomString() + '/review');
    expect(res.status).toBe(404);
  });

  // ==================== STUDY (RANDOMIZED) ====================

  test('GET /decks/{id}/study prioritizes least reviewed card', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'StudyPriority_' + randomString() });
    
    // Add two cards
    const card1 = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'Card1_' + randomString(), back: 'B1' });
    const card2 = await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'Card2_' + randomString(), back: 'B2' });
    
    // Review card1 twice
    await request(BASE_URL).post('/cards/' + card1.body.id + '/review');
    await request(BASE_URL).post('/cards/' + card1.body.id + '/review');
    
    // Study should return card2 (0 reviews) not card1 (2 reviews)
    const studyRes = await request(BASE_URL).get('/decks/' + deckRes.body.id + '/study');
    expect(studyRes.status).toBe(200);
    expect(studyRes.body.id).toBe(card2.body.id);
  });

  test('GET /decks/{id}/study returns 404 for non-existent deck', async () => {
    // Prove study works
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Study404_' + randomString() });
    await request(BASE_URL)
      .post('/decks/' + deckRes.body.id + '/cards')
      .send({ front: 'X', back: 'Y' });
    const validStudy = await request(BASE_URL).get('/decks/' + deckRes.body.id + '/study');
    expect(validStudy.status).toBe(200);
    
    // Non-existent deck
    const res = await request(BASE_URL).get('/decks/deck_study_nonexistent_' + randomString() + '/study');
    expect(res.status).toBe(404);
  });

  test('GET /decks/{id}/study returns 204 for deck with only cards', async () => {
    const deckRes = await request(BASE_URL)
      .post('/decks')
      .send({ name: 'Empty204_' + randomString() });
    
    const res = await request(BASE_URL).get('/decks/' + deckRes.body.id + '/study');
    expect(res.status).toBe(204);
  });

});
`,
};

