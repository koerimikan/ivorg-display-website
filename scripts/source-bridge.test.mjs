// Filesystem/HTTP tests only: no browser or Computer Use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { analyzeSource, patchSource, revision, SourceError } from '../src/dev-studio/source-engine.js';
import { createSourceService, createRpcMiddleware } from '../src/dev-studio/server.js';
import integration, { createStudioPlugin } from '../src/dev-studio/integration.js';

const source = '---\r\nconst title = "DATA";\r\n---\r\n<section><strong class="copy">Hello 世界 😀</strong><p style="margin: 8px; color: #fff">Other</p></section>\r\n';
const relative = 'src/pages/index.astro';
const textRecord = (code = source) => analyzeSource(code, relative).records.find(record => record.tag === 'strong');
const textOperation = (record, value = 'Updated') => ({ kind: 'replaceStaticText', expectedOld: record.text.expectedOld, newValue: value });
const errorStatus = status => error => error instanceof SourceError && error.status === status;

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ivorg-source-bridge-'));
  const root = path.join(directory, 'project');
  await mkdir(path.join(root, 'src', 'pages'), { recursive: true });
  const filename = path.join(root, relative);
  await writeFile(filename, source, 'utf8');
  const service = createSourceService({ root });
  service.register(source, relative);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, root, filename, service, record: textRecord() };
}

test('AST IDs are unique, deterministic and injected without touching original bytes', () => {
  const result = analyzeSource(source, relative);
  assert.equal(new Set(result.records.map(r => r.sourceId)).size, result.records.length);
  assert.deepEqual(result.records, analyzeSource(source, relative).records);
  assert.equal(result.code.replace(/ data-ds-id="s_[a-f0-9]+"/g, ''), source);
  assert.equal(result.records[0].baseRevision, revision(source));
  assert.match(revision(source), /^sha256:[a-f0-9]{64}$/);
});

test('loops, expressions, scripts, spread and raw HTML do not receive writable mapping', () => {
  const code = '<div><b>Static</b>{items.map(x => <em>{x}</em>)}{ok && <i>Conditional</i>}<span {...props}>Spread</span><div set:html={html}/><script>let x=1;</script><style>b{color:red}</style></div>';
  const records = analyzeSource(code, relative).records;
  assert.deepEqual(records.map(r => r.tag), ['div', 'b']);
});

test('layout and component children remain mapped; decoder/clock text is read-only', () => {
  const code = '<html><body><Layout><strong>Static</strong></Layout><span data-decode="ABC">ABC</span><time id="system-clock">00</time></body></html>';
  const records = analyzeSource(code, relative).records;
  assert(records.some(r => r.tag === 'strong'));
  assert(!records.some(r => r.tag === 'Layout'));
  assert.equal(records.find(r => r.tag === 'time').capabilities.text, false);
  assert.equal(records.find(r => r.tag === 'span').capabilities.text, false);
});

test('Unicode and CRLF survive exact minimal text replacement', () => {
  const record = textRecord();
  const result = patchSource(source, record, textOperation(record, '你好 🚀'));
  assert.equal(result.code, source.replace('Hello 世界 😀', '你好 🚀'));
  assert.equal(result.patch.before, 'Hello 世界 😀');
  assert.equal(result.code.slice(0, result.patch.start), source.slice(0, result.patch.start));
  assert.equal(result.code.slice(result.patch.start + result.patch.after.length), source.slice(result.patch.end));
});

test('new text is escaped and cannot inject HTML or Astro expressions', () => {
  const record = textRecord();
  const result = patchSource(source, record, textOperation(record, '<script>{danger}</script> &'));
  assert(result.code.includes('&lt;script&gt;&#123;danger&#125;&lt;/script&gt; &amp;'));
  analyzeSource(result.code, relative);
});

test('expectedOld mismatch and stale source revision return 409', () => {
  const record = textRecord();
  assert.throws(() => patchSource(source, record, { ...textOperation(record), expectedOld: 'WRONG' }), errorStatus(409));
  assert.throws(() => patchSource(source + '\n', record, textOperation(record)), errorStatus(409));
});

test('existing inline CSS edits only its value slice', () => {
  const record = analyzeSource(source, relative).records.find(r => r.tag === 'p');
  const result = patchSource(source, record, { kind: 'replaceInlineStyle', property: 'margin', expectedOld: record.style.expectedOld, newValue: '12px' });
  assert.equal(result.code, source.replace('margin: 8px', 'margin: 12px'));
  assert.equal(result.patch.before, '8px'); assert.equal(result.patch.after, '12px');
});

test('missing inline style inserts a single attribute and dynamic style is denied', () => {
  const record = textRecord();
  const result = patchSource(source, record, { kind: 'replaceInlineStyle', property: 'font-size', expectedOld: '', newValue: '2rem' });
  assert.equal(result.code, source.replace('<strong ', '<strong style="font-size: 2rem" '));
  const dynamic = '<strong style={styles}>Text</strong>';
  const denied = textRecord(dynamic);
  assert.equal(denied.capabilities.style, false);
  assert.throws(() => patchSource(dynamic, denied, { kind: 'replaceInlineStyle', property: 'margin', expectedOld: '', newValue: '8px' }), errorStatus(422));
});

test('unsafe CSS, duplicate declarations, shorthand conflicts and invalid text are denied', () => {
  const record = textRecord();
  for (const newValue of ['8px;position:fixed', 'url(x)', 'expression(x)', '8px!important', '"bad"']) {
    assert.throws(() => patchSource(source, record, { kind: 'replaceInlineStyle', property: 'margin', expectedOld: '', newValue }), errorStatus(422));
  }
  for (const style of ['margin: 8px; margin: 9px', 'margin-left: 8px', 'all: initial']) {
    const code = `<strong style="${style}">Text</strong>`, r = textRecord(code);
    assert.throws(() => patchSource(code, r, { kind: 'replaceInlineStyle', property: 'margin', expectedOld: style, newValue: '4px' }), errorStatus(422));
  }
  assert.throws(() => patchSource(source, record, textOperation(record, 'x'.repeat(9000))), errorStatus(422));
});

test('case-insensitive CSS and logical/gap collisions cannot create conflicting properties', () => {
  const code = '<strong style="MARGIN: 8px; COLOR: #fff">Text</strong>', record = textRecord(code);
  const result = patchSource(code, record, { kind: 'replaceInlineStyle', property: 'margin', expectedOld: record.style.expectedOld, newValue: '9px' });
  assert.equal(result.code, code.replace('8px', '9px'));
  for (const [style, property] of [['MARGIN-TOP: 2px', 'margin'], ['row-gap: 2px', 'gap'], ['margin-inline: 2px', 'margin-left']]) {
    const input = `<strong style="${style}">Text</strong>`, r = textRecord(input);
    assert.throws(() => patchSource(input, r, { kind: 'replaceInlineStyle', property, expectedOld: style, newValue: '8px' }), errorStatus(422));
  }
  const lineHeight = patchSource(source, textRecord(), { kind: 'replaceInlineStyle', property: 'line-height', expectedOld: '', newValue: '1.5' });
  assert(lineHeight.code.includes('line-height: 1.5'));
});

test('raw entities and trimmed source whitespace remain bound to exact expectedOld', () => {
  const input = '<strong>\n  &nbsp;Hello&nbsp; &amp; 😀 \n</strong>';
  const record = textRecord(input);
  assert.equal(record.text.expectedOld, '&nbsp;Hello&nbsp; &amp; 😀');
  const result = patchSource(input, record, textOperation(record, '\u00a0Updated\u00a0 & 😀'));
  assert.equal(result.code, '<strong>\n  \u00a0Updated\u00a0 &amp; 😀 \n</strong>');
});

test('filesystem commit and Undo restore original bytes and revision', async t => {
  const { service, filename, record } = await fixture(t);
  const result = await service.commit({ sourceId: record.sourceId, baseRevision: record.baseRevision, operation: textOperation(record) });
  assert.equal(await readFile(filename, 'utf8'), source.replace('Hello 世界 😀', 'Updated'));
  assert.equal(result.newRevision, revision(await readFile(filename, 'utf8')));
  assert.equal(service.lastTransaction.transactionId, result.transactionId);
  const undo = await service.undo({ transactionId: result.transactionId });
  assert.equal(await readFile(filename, 'utf8'), source);
  assert.equal(undo.newRevision, record.baseRevision);
  await assert.rejects(service.undo({ transactionId: result.transactionId }), errorStatus(409));
});

test('inline attribute insertion and empty-text deletion can both Undo exactly', async t => {
  const { service, filename, record } = await fixture(t);
  for (const operation of [
    { kind: 'replaceInlineStyle', property: 'margin', expectedOld: '', newValue: '8px' },
    textOperation(record, '')
  ]) {
    const result = await service.commit({ sourceId: record.sourceId, baseRevision: record.baseRevision, operation });
    await service.undo({ transactionId: result.transactionId });
    assert.equal(await readFile(filename, 'utf8'), source);
  }
});

test('external edits cause commit 409 without overwriting user changes', async t => {
  const { service, filename, record } = await fixture(t);
  await writeFile(filename, source + '<!-- external -->');
  await assert.rejects(service.commit({ sourceId: record.sourceId, baseRevision: record.baseRevision, operation: textOperation(record) }), errorStatus(409));
  assert.equal(await readFile(filename, 'utf8'), source + '<!-- external -->');
});

test('parallel stale commits serialize: only one succeeds', async t => {
  const { service, record } = await fixture(t);
  const request = { sourceId: record.sourceId, baseRevision: record.baseRevision, operation: textOperation(record) };
  const results = await Promise.allSettled([service.commit(request), service.commit(request)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
});

test('external edits cause Undo 409 and are preserved', async t => {
  const { service, filename, record } = await fixture(t);
  const result = await service.commit({ sourceId: record.sourceId, baseRevision: record.baseRevision, operation: textOperation(record) });
  const external = (await readFile(filename, 'utf8')) + '<!-- external -->';
  await writeFile(filename, external);
  await assert.rejects(service.undo({ transactionId: result.transactionId }), errorStatus(409));
  assert.equal(await readFile(filename, 'utf8'), external);
});

test('notification failure does not turn a successful disk commit into an RPC error', async t => {
  const { root, filename, record } = await fixture(t);
  const service = createSourceService({ root, onWrite() { throw new Error('observer failed'); } });
  service.register(source, relative);
  const result = await service.commit({ sourceId: record.sourceId, baseRevision: record.baseRevision, operation: textOperation(record) });
  assert.equal(result.ok, true);
  await service.undo({ transactionId: result.transactionId });
  assert.equal(await readFile(filename, 'utf8'), source);
  assert.equal(service.lastOutcome.kind, 'undo');
});

test('traversal records and escaping symlinks cannot write outside src', async t => {
  const { service, root, directory } = await fixture(t);
  const external = path.join(directory, 'external'); await mkdir(external);
  await writeFile(path.join(external, 'outside.astro'), '<strong>outside</strong>');
  const unsafe = service.register('<strong>outside</strong>', '../outside.astro').records[0];
  await assert.rejects(service.resolve(unsafe.sourceId), errorStatus(403));
  await symlink(external, path.join(root, 'src', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  const escaped = service.register('<strong>outside</strong>', 'src/escape/outside.astro').records[0];
  await assert.rejects(service.resolve(escaped.sourceId), errorStatus(403));
});

test('RPC enforces local Origin/token, returns HTTP 409, and supports Undo', async t => {
  const { service, filename, record } = await fixture(t);
  const middleware = createRpcMiddleware(service);
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (route, body, token, override = {}) => fetch(`${origin}/__dev_studio_api/${route}`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...(token ? { 'x-dev-studio-token': token } : {}), ...override }, body: JSON.stringify(body)
  });
  assert.equal((await post('session', {}, null, { origin: 'http://evil.invalid' })).status, 403);
  assert.equal((await post('resolve', { sourceId: record.sourceId })).status, 401);
  const { token } = await (await post('session', {})).json();
  const resolved = await (await post('resolve', { sourceId: record.sourceId }, token)).json();
  assert.equal(resolved.baseRevision, record.baseRevision);
  const request = { sourceId: record.sourceId, baseRevision: record.baseRevision, operation: textOperation(record) };
  const committed = await post('commit', request, token); assert.equal(committed.status, 200);
  const { transactionId } = await committed.json();
  assert.equal((await post('commit', request, token)).status, 409);
  assert.equal((await post('undo', { transactionId }, token)).status, 200);
  assert.equal(await readFile(filename, 'utf8'), source);
  assert.equal((await post('commit', {}, token, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await post('session', { data: 'x'.repeat(40000) })).status, 413);
  assert.equal((await post('resolve', {}, 'é'.repeat(64))).status, 401);
});

test('integration is dev-only and transform order precedes Astro compiler', async t => {
  for (const command of ['build', 'preview', 'sync']) {
    integration().hooks['astro:config:setup']({ command, updateConfig() { assert.fail('production plugin injected'); } });
  }
  const { service, root, filename } = await fixture(t);
  const plugin = createStudioPlugin(service, root);
  assert.equal(plugin.apply, 'serve'); assert.equal(plugin.transform.order, 'pre');
  assert.equal(await plugin.transform.handler('', `${filename}?astro&type=style`), null);
  const result = await plugin.transform.handler(source, filename);
  assert.match(result.code, /data-ds-id/);
  await assert.rejects(plugin.transform.handler('already compiled', filename), /before Astro/);
});

test('all generated production HTML/JS/CSS omit IDs, RPC, and editor runtime', async () => {
  let checked = 0;
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) await visit(url);
      else if (/\.(html|js|css)$/.test(entry.name)) {
        checked++;
        assert.doesNotMatch(await readFile(url, 'utf8'), /data-ds-id|__dev_studio_api|SELECT & EDIT|source-editor|MotionBaker|AGENT SCOPE|agent-scope|data-dev-studio-ui/);
      }
    }
  }
  await visit(new URL('../dist/', import.meta.url));
  assert(checked >= 3);
});
