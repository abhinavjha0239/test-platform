import { describe, it, expect, beforeEach } from 'vitest';
import { client } from './_harness.js';

const h = client();

// Tip: keep tests serial; platform runs vitest with threads disabled by default.
beforeEach(async () => {
  await h.reset();
});

describe('UI jsdom public tests', () => {
  it('shows initial count', async () => {
    expect(await h.text('count')).toBe('0');
  });

  it('increments on click', async () => {
    await h.click('inc');
    expect(await h.text('count')).toBe('1');
  });
});


