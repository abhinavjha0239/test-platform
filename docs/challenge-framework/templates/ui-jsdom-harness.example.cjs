// ui_jsdom harness server (candidate container)
//
// Goal: expose a tiny HTTP API so Vitest (in a separate container) can drive
// the React UI over a blackbox protocol (hidden tests stay secret).
//
// Requirements:
// - Candidate app is a Vite-style project (ESM/TSX/JSX/CSS imports).
// - The harness loads the app entry via Vite SSR loader, renders to jsdom using
//   @testing-library/react, and supports actions via data-testid selectors.
//
// Env:
// - PORT: server port
// - APP_ENTRY: module path for the App entry (default: /src/App.jsx)

const http = require('http');
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '3000', 10);
const APP_ENTRY = process.env.APP_ENTRY || '/src/App.jsx';

let vite = null;
let rtl = null;
let userEventMod = null;
let ReactMod = null;
let current = {
  dom: null,
  user: null,
  renderResult: null,
};

function interop(mod) {
  return mod && (mod.default || mod);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data || {});
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', Buffer.byteLength(body));
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function ensureVite() {
  if (vite) return;
  const vitePkg = await import('vite');
  const { createServer } = vitePkg;
  // Use project’s own vite.config.* so aliases/plugins match candidate’s setup.
  vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
}

async function ensureLibraries() {
  if (!rtl) rtl = await import('@testing-library/react');
  if (!userEventMod) userEventMod = await import('@testing-library/user-event');
  if (!ReactMod) ReactMod = await import('react');
}

async function reset() {
  await ensureVite();
  await ensureLibraries();

  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="root"></div></body></html>',
    { url: 'http://candidate/' }
  );

  // Install jsdom globals for RTL/user-event
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

  // Cleanup any previous render
  try {
    rtl.cleanup();
  } catch {}

  const mod = await vite.ssrLoadModule(APP_ENTRY);
  const App = interop(mod.default || mod.App || mod);
  const React = interop(ReactMod);

  const renderResult = rtl.render(React.createElement(App), {
    container: document.getElementById('root'),
  });

  // user-event is ESM; dynamic import returns a module namespace with `default`.
  // Our `interop()` already returns the default export, so DO NOT access `.default` again.
  const user = interop(userEventMod).setup({ document: global.document });

  current = { dom, user, renderResult };
}

function getByTestId(testId) {
  // Prefer RTL queries, fall back to a direct attribute query
  try {
    return rtl.screen.getByTestId(testId);
  } catch {
    const el = document.querySelector(`[data-testid="${testId}"]`);
    if (!el) throw new Error(`No element with data-testid="${testId}"`);
    return el;
  }
}

async function handle(req, res) {
  const u = new URL(req.url || '/', 'http://candidate');
  const path = u.pathname;

  if (path === '/health') {
    return sendJson(res, 200, { ok: true });
  }

  if (path === '/reset' && req.method === 'POST') {
    await reset();
    return sendJson(res, 200, { ok: true });
  }

  if (!current.dom || !current.user || !current.renderResult) {
    // Auto-initialize on first request
    await reset();
  }

  if (path === '/click' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getByTestId(body.testId);
    await current.user.click(el);
    return sendJson(res, 200, { ok: true });
  }

  if (path === '/type' && req.method === 'POST') {
    const body = await readJson(req);
    const el = getByTestId(body.testId);
    await current.user.clear(el);
    await current.user.type(el, String(body.text || ''));
    return sendJson(res, 200, { ok: true });
  }

  if (path === '/text' && req.method === 'GET') {
    const testId = u.searchParams.get('testId') || '';
    const el = getByTestId(testId);
    return sendJson(res, 200, { ok: true, text: (el.textContent || '').trim() });
  }

  if (path === '/allText' && req.method === 'GET') {
    const testId = u.searchParams.get('testId') || '';
    const els = Array.from(document.querySelectorAll(`[data-testid="${testId}"]`));
    return sendJson(res, 200, { ok: true, texts: els.map((e) => (e.textContent || '').trim()) });
  }

  if (path === '/count' && req.method === 'GET') {
    const testId = u.searchParams.get('testId') || '';
    const els = Array.from(document.querySelectorAll(`[data-testid="${testId}"]`));
    return sendJson(res, 200, { ok: true, count: els.length });
  }

  if (path === '/html' && req.method === 'GET') {
    const testId = u.searchParams.get('testId');
    const el = testId ? getByTestId(testId) : document.getElementById('root');
    return sendJson(res, 200, { ok: true, html: el ? el.outerHTML : '' });
  }

  return sendJson(res, 404, { ok: false, error: 'Not found' });
}

async function main() {
  // Start warm to surface errors early
  try {
    await reset();
  } catch (e) {
    // Still start the server so the grader can surface logs
    console.error('[ui_jsdom] reset failed:', e);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error('[ui_jsdom] handler error:', e);
      sendJson(res, 500, { ok: false, error: String(e && e.message ? e.message : e) });
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[ui_jsdom] harness listening on ${PORT} (APP_ENTRY=${APP_ENTRY})`);
  });
}

main().catch((e) => {
  console.error('[ui_jsdom] fatal:', e);
  process.exit(1);
});


