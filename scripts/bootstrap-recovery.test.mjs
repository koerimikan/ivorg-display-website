import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAuth, recoverBootstrapOwner } from '../packages/atelier/src/workbench-server/auth.js';

const credentials = async root => Object.fromEntries((await readFile(path.join(root, '.companion/auth/bootstrap-owner.txt'), 'utf8')).trim().split('\n').map(line => line.split('=')).map(([k, ...v]) => [k, v.join('=')]));

test('missing bootstrap file: first run is left to createAuth; later loss rotates owner and revokes sessions', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atelier-bootstrap-')); t.after(() => rm(root, { recursive: true, force: true }));
  const logs = [];
  assert.equal((await recoverBootstrapOwner({ root, log: m => logs.push(m) })).status, 'first-run');
  let auth = await createAuth({ root, projectId: 'p' });
  const original = await credentials(root);
  const session = await auth.login(original.userId, original.password);
  assert.equal((await recoverBootstrapOwner({ root, log: m => logs.push(m) })).status, 'present');

  await unlink(path.join(root, '.companion/auth/bootstrap-owner.txt'));
  assert.equal((await recoverBootstrapOwner({ root, log: m => logs.push(m) })).status, 'rotated');
  assert.match(logs.at(-1), /rotated/);
  const rotated = await credentials(root);
  assert.equal(rotated.userId, 'owner'); assert.notEqual(rotated.password, original.password);
  auth = await createAuth({ root, projectId: 'p' });
  await assert.rejects(() => auth.authenticate(session.token), /INVALID_SESSION|SESSION/);
  await assert.rejects(() => auth.login('owner', original.password));
  assert.ok((await auth.login('owner', rotated.password)).token);
});

test('no enabled owner account fails closed', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atelier-bootstrap-')); t.after(() => rm(root, { recursive: true, force: true }));
  await createAuth({ root, projectId: 'p' });
  const file = path.join(root, '.companion/auth/accounts.json'), data = JSON.parse(await readFile(file, 'utf8'));
  data.users[0].disabled = true; await writeFile(file, JSON.stringify(data));
  await unlink(path.join(root, '.companion/auth/bootstrap-owner.txt'));
  await assert.rejects(() => recoverBootstrapOwner({ root, log: () => {} }), /BOOTSTRAP_OWNER_UNAVAILABLE/);
});
