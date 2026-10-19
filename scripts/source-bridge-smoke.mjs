// Real Astro HTTP + filesystem round trip. No browser automation; always Undo our change.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeSource, revision } from '../src/dev-studio/source-engine.js';

const origin = process.argv[2] || 'http://127.0.0.1:4322';
const file = new URL('../src/pages/index.astro', import.meta.url);
const original = await readFile(file, 'utf8');
let token, transactionId;
async function request(route, body) {
  return fetch(`${origin}/__dev_studio_api/${route}`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...(token ? { 'x-dev-studio-token': token } : {}) }, body: JSON.stringify(body)
  });
}
async function post(route, body) {
  const response = await request(route, body), result = await response.json();
  assert.equal(response.status, 200, `${route}: ${JSON.stringify(result)}`);
  return result;
}
try {
  const page = await fetch(origin), html = await page.text();
  assert.equal(page.status, 200);
  const record = analyzeSource(original, 'src/pages/index.astro').records.find(r => r.tag === 'strong' && r.text?.expectedOld === 'Synthesize it, then sing it together.');
  assert(record, 'Expected real homepage static heading');
  assert(html.includes(`data-ds-id="${record.sourceId}"`), 'Astro returned instrumented real heading');
  console.log('PASS 1 - actual Astro response contains sourceId for the real homepage heading');
  ({ token } = await post('session', {}));
  const resolved = await post('resolve', { sourceId: record.sourceId });
  assert.equal(resolved.baseRevision, revision(original));
  const input = { sourceId: record.sourceId, baseRevision: record.baseRevision, operation: { kind: 'replaceStaticText', expectedOld: record.text.expectedOld, newValue: record.text.expectedOld + ' [BRIDGE SMOKE]' } };
  const committed = await post('commit', input); transactionId = committed.transactionId;
  assert.equal(await readFile(file, 'utf8'), original.replace(record.text.expectedOld, input.operation.newValue));
  console.log('PASS 2 - HTTP commit changes only the selected source text');
  const hmrPage = await fetch(origin), hmrHtml = await hmrPage.text();
  assert.equal(hmrPage.status, 200); assert(hmrHtml.includes('[BRIDGE SMOKE]'), 'Vite invalidated and recompiled changed source');
  console.log('PASS 3 - native Vite watcher recompiles changed page without server restart');
  assert.equal((await request('commit', input)).status, 409);
  console.log('PASS 4 - stale HTTP commit returns 409');
  await post('undo', { transactionId }); transactionId = null;
  assert.equal(await readFile(file, 'utf8'), original);
  const restored = await (await fetch(origin)).text();
  assert(!restored.includes('[BRIDGE SMOKE]'));
  console.log('PASS 5 - HTTP Undo restores exact original bytes and rendered source');
  console.log('5/5 PASS');
} finally {
  if (transactionId) await post('undo', { transactionId });
  assert.equal(await readFile(file, 'utf8'), original, 'Original real homepage must be restored');
}
