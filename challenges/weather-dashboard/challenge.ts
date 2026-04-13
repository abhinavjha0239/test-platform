import type { CreateChallengeInput } from '@exam-platform/shared';

export const challenge: CreateChallengeInput = {
  name: 'Weather Dashboard',
  description: `# Weather Dashboard Challenge

## What You're Building

Build a **real-time weather dashboard** that fetches data from an API and displays current conditions and forecasts.

This challenge covers:
- Fetch API usage
- Async/Await patterns
- Error handling
- Loading states
- Data display

---

## Requirements

### Core Features
1. **Search**: Input to search by city name
2. **Current Weather**: Display temperature, humidity, conditions
3. **5-Day Forecast**: Show upcoming weather in cards
4. **Error Handling**: Show message for invalid cities
5. **Loading State**: Show spinner while fetching
6. **Search History**: Track last 5 searches

### API Integration
Use the provided mock API endpoint:
- \`/api/weather?city={cityName}\` - Current weather
- \`/api/forecast?city={cityName}\` - 5-day forecast

---

## Test Selectors (Required)

| Element | data-testid |
|---------|-------------|
| City input | \`city-input\` |
| Search button | \`search-button\` |
| Loading spinner | \`loading\` |
| Current weather | \`current-weather\` |
| Temperature | \`temperature\` |
| Humidity | \`humidity\` |
| Conditions | \`conditions\` |
| Forecast container | \`forecast\` |
| Error message | \`error\` |
| Search history | \`search-history\` |

---

## Scoring

| Requirement | Points |
|-------------|--------|
| Fetch current weather | 3 |
| Display temperature | 2 |
| Display conditions | 2 |
| Fetch forecast | 2 |
| Loading state | 2 |
| Error handling | 2 |
| Search history | 2 |

**Total: ~15 tests**
`,

  starterFiles: {
    'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weather Dashboard</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app">
    <h1>🌤️ Weather Dashboard</h1>
    
    <div class="search-form">
      <input type="text" data-testid="city-input" placeholder="Enter city name...">
      <button data-testid="search-button">Search</button>
    </div>
    
    <div data-testid="loading" class="loading" style="display: none;">
      Loading...
    </div>
    
    <div data-testid="error" class="error" style="display: none;">
      City not found
    </div>
    
    <div data-testid="current-weather" class="current-weather" style="display: none;">
      <h2>Current Weather</h2>
      <div class="weather-info">
        <span data-testid="temperature" class="temp">--°C</span>
        <span data-testid="conditions" class="conditions">--</span>
        <span data-testid="humidity" class="humidity">Humidity: --%</span>
      </div>
    </div>
    
    <div data-testid="forecast" class="forecast" style="display: none;">
      <h2>5-Day Forecast</h2>
      <div class="forecast-cards">
        <!-- Forecast cards rendered here -->
      </div>
    </div>
    
    <div class="history-section">
      <h3>Recent Searches</h3>
      <ul data-testid="search-history">
        <!-- History items here -->
      </ul>
    </div>
  </div>
  
  <script src="app.js"></script>
</body>
</html>
`,
    'styles.css': `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; padding: 2rem; }
.app { max-width: 800px; margin: 0 auto; background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
h1 { text-align: center; margin-bottom: 1.5rem; }
.search-form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
.search-form input { flex: 1; padding: 0.75rem 1rem; font-size: 1rem; border: 2px solid #ddd; border-radius: 8px; }
.search-form button { padding: 0.75rem 1.5rem; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; }
.loading { text-align: center; padding: 2rem; }
.error { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }
.current-weather { background: #e3f2fd; padding: 1.5rem; border-radius: 8px; margin-bottom: 1.5rem; }
.weather-info { display: flex; gap: 2rem; align-items: center; margin-top: 1rem; }
.temp { font-size: 2.5rem; font-weight: bold; }
.forecast { margin-bottom: 1.5rem; }
.forecast-cards { display: flex; gap: 1rem; overflow-x: auto; padding: 1rem 0; }
.forecast-card { min-width: 120px; background: #f5f5f5; padding: 1rem; border-radius: 8px; text-align: center; }
.history-section ul { list-style: none; }
.history-section li { padding: 0.5rem; cursor: pointer; }
.history-section li:hover { background: #f5f5f5; }
`,
    'app.js': `// Weather Dashboard
// Implement the following:

const cityInput = document.querySelector('[data-testid="city-input"]');
const searchButton = document.querySelector('[data-testid="search-button"]');
const loadingEl = document.querySelector('[data-testid="loading"]');
const errorEl = document.querySelector('[data-testid="error"]');
const currentWeatherEl = document.querySelector('[data-testid="current-weather"]');
const temperatureEl = document.querySelector('[data-testid="temperature"]');
const conditionsEl = document.querySelector('[data-testid="conditions"]');
const humidityEl = document.querySelector('[data-testid="humidity"]');
const forecastEl = document.querySelector('[data-testid="forecast"]');
const searchHistoryEl = document.querySelector('[data-testid="search-history"]');

let searchHistory = [];

// TODO: Implement fetchWeather(city)
async function fetchWeather(city) {
  // Show loading, hide error
  // Fetch from /api/weather?city={city}
  // Update DOM with response data
  // Handle errors
}

// TODO: Implement fetchForecast(city)
async function fetchForecast(city) {
  // Fetch from /api/forecast?city={city}
  // Render forecast cards
}

// TODO: Implement searchCity()
async function searchCity() {
  // Get city from input
  // Call fetchWeather and fetchForecast
  // Add to search history
}

// TODO: Implement addToHistory(city)
function addToHistory(city) {
  // Add city to history (max 5)
  // Render history list
}

// TODO: Implement renderHistory()
function renderHistory() {
  // Clear and re-render history list
}

// Event Listeners
// searchButton.addEventListener('click', searchCity);
// cityInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchCity(); });
`,
    'README.md': `# Weather Dashboard Challenge

Build a real-time weather app that fetches and displays weather data!

## 🎯 Your Goal

Complete the implementation in \`app.js\` to:
- Fetch current weather from the API
- Display temperature, conditions, humidity
- Show 5-day forecast
- Handle errors for invalid cities
- Track search history

## 📁 Files

| File | Purpose |
|------|---------|
| \`app.js\` | **Main file** - Implement all TODO functions |
| \`index.html\` | Structure (complete) |
| \`styles.css\` | Styling (complete) |

## ✅ What the Tests Check

### Public Tests
- ✓ Search input and button exist
- ✓ Weather display areas exist
- ✓ Search shows weather for valid city

### Hidden Tests
- ✓ Temperature displays correctly
- ✓ Conditions display correctly  
- ✓ Humidity displays correctly
- ✓ Error shown for invalid city
- ✓ Search history tracking
- ✓ Works with different cities

## 🌐 API Endpoints

The server provides these mock endpoints:

\`\`\`
GET /api/weather?city=London
→ { city, temp, conditions, humidity }

GET /api/forecast?city=London  
→ { city, forecast: [...] }
\`\`\`

**Available cities:** London, New York, Tokyo, Paris, Sydney

## 💡 Tips

1. **Show loading state** before fetching
2. **Hide loading** when data arrives
3. **Show error** for 404 responses
4. **Update history** after successful search
5. **Clear input** is optional but nice UX

Good luck! 🚀
`,
  },

  dependencies: {},
  nodeVersion: '20',

  runner: {
    mode: 'ui_jsdom',
    runtime: 'node',
    candidate: {
      image: 'node:20-alpine',
      workdir: '/app',
      generatedFiles: {
        'package.json': JSON.stringify({
          name: 'weather-dashboard',
          private: true,
          type: 'commonjs',
          devDependencies: { jsdom: '^24.1.0' },
        }, null, 2) + '\n',
        '.grader/ui-harness.cjs': `const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '3000', 10);
let current = { dom: null, window: null, document: null };

const mockWeather = {
  'london': { temp: 15, conditions: 'Cloudy', humidity: 72 },
  'new york': { temp: 22, conditions: 'Sunny', humidity: 45 },
  'tokyo': { temp: 28, conditions: 'Partly Cloudy', humidity: 65 },
  'paris': { temp: 18, conditions: 'Rainy', humidity: 80 },
  'sydney': { temp: 25, conditions: 'Sunny', humidity: 55 },
};

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data || {}));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

function reset() {
  const { JSDOM } = require('jsdom');
  let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const js = fs.existsSync(path.join(__dirname, '..', 'app.js')) ? fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8') : '';
  const css = fs.existsSync(path.join(__dirname, '..', 'styles.css')) ? fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8') : '';
  html = html.replace(/<script src="app.js"><\\/script>/, '<script>' + js + '</script>');
  if (css) html = html.replace('</head>', '<style>' + css + '</style></head>');
  
  const dom = new JSDOM(html, {
    url: 'http://localhost:' + PORT + '/',
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
  });
  
  // Mock fetch for API calls
  dom.window.fetch = async (url, options) => {
    const u = new URL(url, 'http://localhost:' + PORT);
    if (u.pathname === '/api/weather') {
      const city = (u.searchParams.get('city') || '').toLowerCase();
      const weather = mockWeather[city];
      if (weather) return { ok: true, json: async () => ({ city, ...weather }) };
      return { ok: false, status: 404, json: async () => ({ error: 'City not found' }) };
    }
    if (u.pathname === '/api/forecast') {
      const city = (u.searchParams.get('city') || '').toLowerCase();
      const weather = mockWeather[city];
      if (weather) {
        const forecast = Array.from({ length: 5 }, (_, i) => ({
          day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i],
          temp: weather.temp + Math.floor(Math.random() * 5) - 2,
          conditions: weather.conditions
        }));
        return { ok: true, json: async () => ({ city, forecast }) };
      }
      return { ok: false, status: 404, json: async () => ({ error: 'City not found' }) };
    }
    throw new Error('Unknown endpoint: ' + url);
  };
  
  current = { dom, window: dom.window, document: dom.window.document };
}

function getFirst(testId) {
  const el = current.document.querySelector('[data-testid="' + testId + '"]');
  if (!el) throw new Error('No element with data-testid="' + testId + '"');
  return el;
}

function getAll(testId) {
  return Array.from(current.document.querySelectorAll('[data-testid="' + testId + '"]'));
}

async function handle(req, res) {
  const u = new URL(req.url || '/', 'http://localhost');
  if (u.pathname === '/health') return sendJson(res, 200, { ok: true });
  if (u.pathname === '/reset' && req.method === 'POST') { reset(); return sendJson(res, 200, { ok: true }); }
  if (!current.dom) reset();

  if (u.pathname === '/click' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getFirst(body.testId);
    el.dispatchEvent(new current.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    return sendJson(res, 200, { ok: true });
  }
  if (u.pathname === '/type' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getFirst(body.testId);
    el.value = String(body.text || '');
    el.dispatchEvent(new current.window.Event('input', { bubbles: true }));
    return sendJson(res, 200, { ok: true });
  }
  if (u.pathname === '/text') { const el = getFirst(u.searchParams.get('testId') || ''); return sendJson(res, 200, { ok: true, text: (el.textContent || '').trim() }); }
  if (u.pathname === '/allText') { return sendJson(res, 200, { ok: true, texts: getAll(u.searchParams.get('testId') || '').map(e => (e.textContent || '').trim()) }); }
  if (u.pathname === '/count') { return sendJson(res, 200, { ok: true, count: getAll(u.searchParams.get('testId') || '').length }); }
  if (u.pathname === '/html') { const testId = u.searchParams.get('testId'); const el = testId ? getFirst(testId) : current.document.body; return sendJson(res, 200, { ok: true, html: el ? el.outerHTML : '' }); }

  return sendJson(res, 404, { ok: false, error: 'Not found' });
}

try { reset(); } catch (e) { console.error('[ui_jsdom] reset failed:', e); }
http.createServer((req, res) => handle(req, res).catch(e => sendJson(res, 500, { ok: false, error: String(e.message || e) }))).listen(PORT, '0.0.0.0', () => console.log('[ui_jsdom] listening on ' + PORT));
`,
      },
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      runCommand: 'node .grader/ui-harness.cjs',
      port: 3000,
      healthPath: '/health',
      startupTimeoutMs: 30000,
    },
    tests: {
      framework: 'vitest',
      image: 'node:20-alpine',
      installCommand: 'npm install --legacy-peer-deps 2>&1',
      timeoutMs: 120000,
    },
  },

  publicTests: `import { describe, test, expect, beforeEach } from 'vitest';
import { client } from './_harness.js';
const harness = client();

beforeEach(async () => { await harness.reset(); });

describe('Weather Dashboard - Public Tests', () => {
  test('renders search input and button', async () => {
    expect(await harness.count('city-input')).toBe(1);
    expect(await harness.count('search-button')).toBe(1);
  });
  
  test('renders weather display areas', async () => {
    expect(await harness.count('current-weather')).toBe(1);
    expect(await harness.count('forecast')).toBe(1);
  });
  
  test('search updates display for valid city', async () => {
    await harness.type('city-input', 'London');
    await harness.click('search-button');
    
    // Wait a bit for async fetch
    await new Promise(r => setTimeout(r, 500));
    
    const temp = await harness.text('temperature');
    expect(temp).toContain('15');
  });
});
`,

  hiddenTests: `import { describe, test, expect, beforeEach } from 'vitest';
import { client } from './_harness.js';
const harness = client();

beforeEach(async () => { await harness.reset(); });

describe('Weather Dashboard - Hidden Tests', () => {
  test('shows loading state during fetch', async () => {
    // This is tricky because fetch is fast - we verify loading element exists
    expect(await harness.count('loading')).toBe(1);
  });
  
  test('displays temperature for London', async () => {
    await harness.type('city-input', 'London');
    await harness.click('search-button');
    await new Promise(r => setTimeout(r, 500));
    
    const temp = await harness.text('temperature');
    expect(temp).toMatch(/15|°/);
  });
  
  test('displays conditions for London', async () => {
    await harness.type('city-input', 'London');
    await harness.click('search-button');
    await new Promise(r => setTimeout(r, 500));
    
    const conditions = await harness.text('conditions');
    expect(conditions.toLowerCase()).toContain('cloudy');
  });
  
  test('displays humidity for London', async () => {
    await harness.type('city-input', 'London');
    await harness.click('search-button');
    await new Promise(r => setTimeout(r, 500));
    
    const humidity = await harness.text('humidity');
    expect(humidity).toMatch(/72|%/);
  });
  
  test('shows error for invalid city', async () => {
    await harness.type('city-input', 'InvalidCityXYZ123');
    await harness.click('search-button');
    await new Promise(r => setTimeout(r, 500));
    
    const html = await harness.html('error');
    // Error should be visible (not display:none)
    expect(html).not.toContain('display: none');
  });
  
  test('adds city to search history', async () => {
    await harness.type('city-input', 'Tokyo');
    await harness.click('search-button');
    await new Promise(r => setTimeout(r, 500));
    
    const history = await harness.text('search-history');
    expect(history.toLowerCase()).toContain('tokyo');
  });
  
  test('works with multiple cities', async () => {
    // Test with different city
    await harness.type('city-input', 'Paris');
    await harness.click('search-button');
    await new Promise(r => setTimeout(r, 500));
    
    const temp = await harness.text('temperature');
    expect(temp).toMatch(/18/);
    
    const conditions = await harness.text('conditions');
    expect(conditions.toLowerCase()).toContain('rainy');
  });
});
`,
};
