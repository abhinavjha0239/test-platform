const request = require('supertest');

// BASE_URL is set by the HTTP blackbox grader
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) throw new Error('Missing BASE_URL');

describe('API contract (example)', () => {
  test('health is up', async () => {
    const res = await request(BASE_URL).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ ok: true }));
  });

  test('404/400 trap-safe negative test pattern', async () => {
    // 1) Prove endpoint exists with a valid request
    const ok = await request(BASE_URL).post('/items').send({ name: 'x' });
    expect(ok.status).toBe(201);

    // 2) Prove read works
    const getOk = await request(BASE_URL).get(`/items/${ok.body.id}`);
    expect(getOk.status).toBe(200);

    // 3) NOW check 404
    const missing = await request(BASE_URL).get('/items/999999');
    expect(missing.status).toBe(404);
  });
});


