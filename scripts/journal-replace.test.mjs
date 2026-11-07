import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, open } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { replaceFile } from '../packages/atelier/src/workbench-server/journal.js';

test('replaceFile succeeds once a transient Windows sharing lock is released', { skip: process.platform !== 'win32' && 'Windows sharing semantics' }, async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'atelier-replace-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const target = path.join(dir, 'j.json'), tmp = target + '.tmp';
  await writeFile(target, 'old'); await writeFile(tmp, 'new');
  // Hold the target open without FILE_SHARE_DELETE semantics (Node opens r+ handles that block rename on Windows).
  const handle = await open(target, 'r+');
  setTimeout(() => handle.close(), 150);
  await replaceFile(tmp, target);
  assert.equal(await readFile(target, 'utf8'), 'new');
});

test('replaceFile does not swallow non-transient errors', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'atelier-replace-')); t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(() => replaceFile(path.join(dir, 'missing.tmp'), path.join(dir, 'x.json')), { code: 'ENOENT' });
});
