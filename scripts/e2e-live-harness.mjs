// Disposable-host end-to-end acceptance for Atelier:
//   real headless browser Alt+S selection in the 4321 preview inside the 4323
//   workbench -> Bridge handshake (origin/source/epoch/nonce) -> Agent
//   Explain + Modify through the real DeepSeek Harness SDK -> spatial
//   ChangePlan -> isolated dry-run -> signed approval -> Apply (fresh
//   remeasure, <=1px) -> DOM/AST verification -> Journal Undo -> git zero diff
//   -> Fail-Closed checks (third-party edit before Apply, forged Bridge frames).
// Model: live DeepSeek when DEEPSEEK_API_KEY is set (and --fixture is not
// passed); otherwise the local context-derived fixture in e2e/model-fixture.mjs.
// Usage: node scripts/e2e-live-harness.mjs [--fixture] [--out <dir>]
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDisposableHost } from './e2e/disposable-host.mjs';
import { startServers } from './e2e/servers.mjs';
import { launchBrowser } from './e2e/cdp.mjs';
import { startModelFixture } from './e2e/model-fixture.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const outDir = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(repo, 'verification/release-readiness/e2e'));
const live = Boolean(process.env.DEEPSEEK_API_KEY) && !args.includes('--fixture');
const TARGET = '.matrix-heading', CLASS = 'e2e-verified';
const report = { startedAt: new Date().toISOString(), modelMode: live ? 'deepseek-live' : 'local-context-fixture', steps: [], result: 'FAIL' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function step(name, fn, { record = true } = {}) {
  const started = Date.now();
  try { const detail = await fn(); report.steps.push({ name, status: 'PASS', ms: Date.now() - started, ...(detail && record ? { detail } : {}) }); console.log('PASS ' + name); return detail; }
  catch (error) { report.steps.push({ name, status: 'FAIL', ms: Date.now() - started, error: String(error?.stack || error).slice(0, 2000) }); console.error('FAIL ' + name + ': ' + error.message); throw error; }
}

await mkdir(outDir, { recursive: true });
let host, servers, browser, fixture;
try {
  host = await step('disposable host (temp git checkout)', async () => { const h = await createDisposableHost(); assert.equal(h.status(), ''); return h; }, { record: false });
  report.hostBaseline = host.baseline;

  await step('configure DeepSeek Harness for host', async () => {
    const { configureDsh } = await import('../packages/atelier/src/workbench-server/dsh-adapter.js');
    let harnessRoot = process.env.DSH_HARNESS_PATH || process.env.COMPANION_DSH_ROOT;
    if (!harnessRoot) try { harnessRoot = JSON.parse(await readFile(path.join(repo, 'apps/ivorg-website/.companion/agent/runtime.json'), 'utf8')).harnessRoot; } catch {}
    if (!harnessRoot) throw new Error('DSH_ROOT_REQUIRED: set DSH_HARNESS_PATH');
    const config = await configureDsh({ root: host.root, harnessRoot: path.resolve(harnessRoot) });
    if (!live) { fixture = await startModelFixture(); process.env.DEEPSEEK_API_KEY = 'local-fixture-only'; process.env.DEEPSEEK_BASE_URL = fixture.url; }
    return { sdkVersion: config.sdkVersion, model: config.model, provider: live ? 'api.deepseek.com (env DEEPSEEK_BASE_URL or default)' : 'local fixture ' + fixture.url };
  });

  servers = await step('control 4323 + preview 4321 on disposable host', async () => startServers(host.root), { record: false });
  const origin = servers.controlOrigin;
  const { cookieName, cookieValue, token } = await step('login + change session', async () => {
    const login = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: servers.credentials.userId, password: servers.credentials.password }) });
    assert.equal(login.status, 200);
    const [cookieName, cookieValue] = login.headers.get('set-cookie').split(';')[0].split('=');
    const session = await fetch(origin + '/api/change/session', { headers: { Cookie: `${cookieName}=${cookieValue}` } }).then(r => r.json());
    assert.match(session.token, /^[a-f0-9]{64}$/);
    return { cookieName, cookieValue, token: session.token };
  }, { record: false });
  const call = async (action, data, { expectStatus = 200 } = {}) => {
    const response = await fetch(origin + '/api/change/' + action, { method: 'POST', headers: { Origin: origin, Cookie: `${cookieName}=${cookieValue}`, 'Content-Type': 'application/json', 'X-Companion-Token': token }, body: JSON.stringify(data) });
    const value = await response.json();
    if (expectStatus !== null) assert.equal(response.status, expectStatus, action + ' ' + JSON.stringify(value).slice(0, 600));
    return { status: response.status, value };
  };

  browser = await launchBrowser();
  const page = await browser.newPage();
  report.browser = browser.browserPath;
  await step('open workbench LIVE stage for /discography/', async () => {
    await page.setCookie({ name: cookieName, value: cookieValue, url: origin + '/api', httpOnly: true, sameSite: 'Strict' });
    await page.goto(origin + '/');
    await page.waitFor(`!!document.querySelector('[data-node-id="page.discography"]')`);
    await page.eval(`window.__e2e=[];window.addEventListener('message',e=>{const f=document.getElementById('preview');window.__e2e.push({origin:e.origin,fromPreview:!!f&&e.source===f.contentWindow,data:e.data,at:Date.now()});});true`);
    await page.eval(`document.querySelector('[data-node-id="page.discography"]').focus();true`);
    await page.key('keyDown', { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); await page.key('keyUp', { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await page.waitFor(`document.getElementById('preview')?.getBoundingClientRect().width>400`);
    await page.waitFor(`window.__e2e.some(m=>m.data?.kind==='hello'&&m.data.pathname==='/discography/')`, { timeoutMs: 30000 });
    await writeFile(path.join(outDir, '01-live-stage.png'), await page.screenshot());
  });

  const frameRect = () => page.eval(`JSON.stringify(document.getElementById('preview').getBoundingClientRect())`).then(JSON.parse);
  const frameCtx = () => page.frameContextOf('#preview');
  const targetRect = async () => { const ctx = await frameCtx(); return JSON.parse(await page.eval(`(()=>{const el=document.querySelector('${TARGET}');const r=el.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,width:r.width,height:r.height,iw:innerWidth,cls:el.className})})()`, ctx)); };

  async function altSelect(label) {
    const frame = await frameRect(), t = await targetRect(), scale = frame.width / t.iw;
    const toTop = (x, y) => [frame.x + x * scale, frame.y + y * scale];
    const [fx, fy] = toTop(t.x + 6, t.y + t.height - 6);
    await page.mouse('mousePressed', fx, fy); await page.mouse('mouseReleased', fx, fy);
    await page.key('keyDown', { key: 's', code: 'KeyS', modifiers: 1, windowsVirtualKeyCode: 83 }); await page.key('keyUp', { key: 's', code: 'KeyS', modifiers: 1, windowsVirtualKeyCode: 83 });
    const [x1, y1] = toTop(t.x + t.width * 0.25, t.y + t.height * 0.3), [x2, y2] = toTop(t.x + t.width * 0.8, t.y + t.height * 0.7);
    const before = await page.eval('window.__e2e.length');
    await page.mouse('mousePressed', x1, y1);
    for (let i = 1; i <= 6; i++) await page.mouse('mouseMoved', x1 + (x2 - x1) * i / 6, y1 + (y2 - y1) * i / 6);
    await page.mouse('mouseReleased', x2, y2);
    const message = JSON.parse(await page.waitFor(`(()=>{const m=window.__e2e.slice(${before}).find(m=>m.data?.kind==='measure'&&m.data.selection);return m&&JSON.stringify(m)})()`, { timeoutMs: 15000 }));
    await writeFile(path.join(outDir, `02-selection-${label}.png`), await page.screenshot());
    return { message, target: t, scale };
  }
  const freshSample = async selectionId => {
    const since = Date.now();
    const m = JSON.parse(await page.waitFor(`(()=>{const m=[...window.__e2e].reverse().find(m=>m.data?.kind==='measure'&&m.data.selection?.selectionId==='${selectionId}'&&m.at>${since});return m&&JSON.stringify(m)})()`, { timeoutMs: 8000 }));
    return m.data.selection;
  };
  // Same projection the workbench UI uses (shell/changes.js `measure`).
  const geometryOf = s => ({ ...s.spatial, selectionId: s.selectionId, parentSourceId: s.parentSourceId, sampledAt: s.sampledAt, layoutFacts: s.layoutFacts, grid: s.grid, frameEpoch: s.frameEpoch, sourceRevisions: { project: s.docRevision }, rects: s.spatial?.rects || { viewport: s.rect } });

  const first = await step('Alt+S box selection via real input crosses origins with valid handshake', async () => {
    const { message, target } = await altSelect('apply');
    const hello = await page.eval(`JSON.stringify(window.__e2e.find(m=>m.data?.kind==='hello'))`).then(JSON.parse);
    assert.equal(message.origin, 'http://127.0.0.1:4321'); assert.equal(message.fromPreview, true);
    assert.equal(message.data.frameEpoch, hello.data.frameEpoch); assert.equal(message.data.sessionNonce, hello.data.sessionNonce);
    assert.match(message.data.selection.parentSourceId, /^s_[a-f0-9]{16}$/);
    assert.equal(message.data.selection.layoutFacts?.fontsReady, true);
    return { message, target, handshake: { frameEpoch: hello.data.frameEpoch, nonceLength: hello.data.sessionNonce.length, docRevision: message.data.docRevision.slice(0, 12) } };
  });
  const selection = first.message.data.selection;
  report.selection = { selectionId: selection.selectionId, parentSourceId: selection.parentSourceId, viewportRect: selection.spatial?.rects?.viewport || selection.rect };

  await step('Bridge rejects forged/stale frames (captured real payload)', async () => {
    const { acceptBridgeMessage } = await import('../packages/atelier/src/workbench-core/bridge.js');
    const source = {}, d = first.message.data;
    const expect = { origin: 'http://127.0.0.1:4321', source, frameEpoch: d.frameEpoch, nonce: d.sessionNonce };
    const accepted = acceptBridgeMessage({ origin: expect.origin, source, data: d }, expect);
    assert.equal(accepted.reject, undefined, JSON.stringify(accepted).slice(0, 200));
    const cases = { ORIGIN: { origin: 'http://127.0.0.1:9999', source, data: d }, SOURCE: { origin: expect.origin, source: {}, data: d }, EPOCH: { origin: expect.origin, source, data: { ...d, frameEpoch: d.frameEpoch + 1 } }, NONCE: { origin: expect.origin, source, data: { ...d, sessionNonce: 'f'.repeat(d.sessionNonce.length) } } };
    for (const [code, event] of Object.entries(cases)) assert.equal(acceptBridgeMessage(event, expect).reject, code);
    return { acceptedGenuine: true, rejected: Object.keys(cases) };
  });

  const explain = await step('Agent Explain on the selection', async () => {
    const { value } = await call('agent', { capability: 'explain', intent: 'Explain what the selected region of the page is and which source element renders it.', context: { selection } });
    assert.equal(value.status, 'completed', JSON.stringify(value)); assert.ok(value.summary?.length > 10); assert.ok(value.evidence?.length);
    return { summary: value.summary.slice(0, 400), evidence: value.evidence };
  });

  await step('Agent boundary cases fail closed (no file touched)', async () => {
    const before = host.status(), outcomes = {};
    const expectRefusal = async (name, capability, marker, codes) => {
      const { status, value } = await call('agent', { capability, intent: `[boundary:${marker}] Add the CSS class "${CLASS}" to the selected element.`, context: { selection } }, { expectStatus: null });
      outcomes[name] = { httpStatus: status, error: value.error || value.code || value.status };
      if (live) return; // a real model decides its own output; only the fixture can force these shapes
      assert.notEqual(status, 200, name + ' must not succeed: ' + JSON.stringify(value).slice(0, 300));
      assert.ok(codes.includes(outcomes[name].error), name + ' -> ' + JSON.stringify(outcomes[name]));
    };
    await expectRefusal('malformedOutput', 'explain', 'malformed', ['AGENT_JSON_REQUIRED']);
    await expectRefusal('inventedEvidence', 'explain', 'evidence', ['AGENT_EVIDENCE_REQUIRED']);
    await expectRefusal('extraSchemaKey', 'modify', 'schema', ['AGENT_RESULT_SCHEMA']);
    await expectRefusal('staleTargetRevision', 'modify', 'stale', ['AGENT_TARGET_EVIDENCE']);
    if (!live) {
      const started = Date.now();
      const { value } = await call('agent', { capability: 'explain', intent: '[boundary:rate] Explain the selected region.', context: { selection } });
      assert.equal(value.status, 'completed', JSON.stringify(value).slice(0, 300));
      const checkpoint = JSON.parse(await readFile(path.join(host.root, '.companion/agent/users', servers.credentials.userId, 'checkpoint.json'), 'utf8'));
      assert.equal(checkpoint.waitingForRateLimitReset, false);
      outcomes.rateLimit429 = { recoveredAfterMs: Date.now() - started, checkpointCleared: true };
      assert.ok(outcomes.rateLimit429.recoveredAfterMs >= 1000, 'must honour Retry-After');
    }
    assert.equal(host.status(), before, 'boundary cases must not modify the host');
    return outcomes;
  });

  const proposal = await step('Agent Modify -> typed proposal', async () => {
    const { value } = await call('agent', { capability: 'modify', intent: `Add the CSS class "${CLASS}" to the selected element and keep its existing classes. Change nothing else.`, context: { selection } });
    assert.equal(value.status, 'completed', JSON.stringify(value)); assert.equal(value.ops?.length, 1, JSON.stringify(value));
    assert.equal(value.ops[0].type, 'replaceAttrLiteral'); assert.match(value.ops[0].value, new RegExp(`\\b${CLASS}\\b`));
    return { ops: value.ops, evidence: value.evidence };
  });

  const plan = await step('spatial ChangePlan with fresh remeasure', async () => {
    const after = await freshSample(selection.selectionId);
    const { value } = await call('plan', { entry: 'spatial', geometry: { before: geometryOf(selection), after: geometryOf(after) }, ops: proposal.ops });
    assert.ok(value.changeId); assert.ok(value.changes.some(c => c.file === 'src/pages/discography.astro'));
    return { changeId: value.changeId, files: value.changes.map(c => c.file), patchDigest: value.patchDigest };
  });

  const dry = await step('isolated dry-run preview', async () => {
    const { value } = await call('preview', { changeId: plan.changeId });
    assert.equal(value.patchDigest, plan.patchDigest); assert.equal(value.staticPassed, true);
    assert.equal(await readFile(path.join(host.root, 'src/pages/discography.astro'), 'utf8').then(s => s.includes(CLASS)), false, 'dry-run must not touch the host');
    return { mode: value.mode, ssrExecuted: value.ssrExecuted, buildPassed: value.buildPassed, requiresManualConfirmation: value.requiresManualConfirmation };
  });

  await step('approve (signed, digest-bound)', async () => { const { value } = await call('approve', { changeId: plan.changeId, acknowledgeStatic: true }); return { approved: true, keys: Object.keys(value) }; });

  const applied = await step('apply with fresh remeasure (<=1px vs plan baseline)', async () => {
    const after = await freshSample(selection.selectionId);
    const base = selection.spatial?.rects?.viewport || selection.rect, now = after.spatial?.rects?.viewport || after.rect;
    const drift = Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, Math.abs(now[k] - base[k])]));
    const { value } = await call('apply', { changeId: plan.changeId, geometry: { before: geometryOf(selection), after: geometryOf(after) } });
    assert.equal(value.state, 'COMMITTED', JSON.stringify(value).slice(0, 400));
    return { transactionId: value.id || value.transactionId, preApplyDriftPx: drift };
  });

  await step('post-apply: AST, registry identity and live DOM (<=1px)', async () => {
    const source = await readFile(path.join(host.root, 'src/pages/discography.astro'), 'utf8');
    assert.match(source, new RegExp(`class="[^"]*\\b${CLASS}\\b`));
    const { loadProject } = await import('../packages/atelier/src/workbench-server/server.js');
    const project = await loadProject(host.root);
    const unbound = project.anchors.filter(a => a.state !== 'bound').map(a => a.objectId);
    assert.deepEqual(unbound, []);
    let t;
    for (let i = 0; i < 60; i++) { try { t = await targetRect(); if (t.cls.includes(CLASS)) break; } catch {} await sleep(250); }
    assert.ok(t?.cls.includes(CLASS), 'HMR/reload did not deliver the applied class');
    const delta = Object.fromEntries(['x', 'y', 'width', 'height'].map(k => [k, Math.abs(t[k] - first.target[k])]));
    for (const [k, v] of Object.entries(delta)) assert.ok(v <= 1, `${k} drift ${v}px`);
    await writeFile(path.join(outDir, '03-after-apply.png'), await page.screenshot());
    return { domClass: t.cls, domDriftPx: delta, anchorsBound: project.anchors.length, gitStatus: host.status().trim() };
  });

  await step('Journal Undo (fresh selection) -> git diff == 0', async () => {
    await page.waitFor(`window.__e2e.some(m=>m.data?.kind==='hello'&&m.at>${Date.now() - 60000})`, { timeoutMs: 20000 }).catch(() => {});
    const second = await altSelect('undo');
    const s1 = second.message.data.selection, s2 = await freshSample(s1.selectionId);
    const { value } = await call('undo', { changeId: plan.changeId, geometry: { before: geometryOf(s1), after: geometryOf(s2) } });
    assert.equal(value.state, 'COMMITTED', JSON.stringify(value).slice(0, 400));
    const status = host.status();
    assert.equal(status, '', 'git status after Undo:\n' + status);
    return { undoTransaction: value.id, gitStatusPorcelain: status, gitDiffStat: host.diff() };
  });

  await step('Fail-Closed: third-party edit between approve and apply', async () => {
    const file = 'src/pages/discography.astro', absolute = path.join(host.root, file);
    const source = await readFile(absolute, 'utf8');
    const { hash } = await import('../packages/atelier/src/workbench-core/objects/spec.js');
    const { value: objectPlan } = await call('plan', { entry: 'object', ops: [{ file, type: 'replaceAttrLiteral', expectedRevision: hash(source), anchor: proposal.ops[0].anchor, name: 'class', value: proposal.ops[0].value }] });
    await call('preview', { changeId: objectPlan.changeId });
    await call('approve', { changeId: objectPlan.changeId, acknowledgeStatic: true });
    await appendFile(absolute, '\n<!-- third-party edit -->\n');
    const refused = await call('apply', { changeId: objectPlan.changeId }, { expectStatus: null });
    assert.notEqual(refused.status, 200, 'apply must refuse a stale base');
    const after = await readFile(absolute, 'utf8');
    assert.equal(after, source + '\n<!-- third-party edit -->\n', 'third-party bytes must be preserved, not overwritten');
    assert.equal(after.includes(CLASS), false);
    await writeFile(absolute, source);
    assert.equal(host.status(), '');
    return { httpStatus: refused.status, error: refused.value.error || refused.value.code, thirdPartyBytesPreserved: true };
  });

  report.result = 'PASS';
} catch (error) {
  report.fatal = String(error?.message || error);
} finally {
  if (fixture) { report.modelTranscript = 'model-transcript.jsonl'; await writeFile(path.join(outDir, 'model-transcript.jsonl'), fixture.transcript.map(t => JSON.stringify(t)).join('\n') + '\n'); await fixture.close(); }
  await browser?.close().catch(() => {});
  await servers?.stop().catch(() => {});
  report.finishedAt = new Date().toISOString();
  if (host) { report.finalGitStatus = host.status(); await host.dispose().catch(() => {}); }
  await writeFile(path.join(outDir, 'e2e-report.json'), JSON.stringify(report, null, 2));
  console.log(`E2E_LIVE_HARNESS ${report.result} model=${report.modelMode} steps=${report.steps.filter(s => s.status === 'PASS').length}/${report.steps.length}`);
  process.exit(report.result === 'PASS' ? 0 : 1);
}
