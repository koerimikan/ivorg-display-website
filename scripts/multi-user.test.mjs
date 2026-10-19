import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authenticatedControl } from './control-fixture.mjs';
import { hash } from '../src/workbench-core/objects/spec.js';
import {createJournal} from '../src/workbench-server/journal.js';

test('HTTP authorization: real cookies/CSRF, roles, private drafts and explicit project submission', async t => {
  const h = await authenticatedControl(t);
  for (const [userId, role] of [['editor', 'editor'], ['reviewer', 'reviewer'], ['viewer', 'viewer']]) {
    assert.equal((await h.request(h.owner, '/api/auth/users', { userId, role, password: `${userId}-password-12345` })).status, 200);
  }
  const editor = await h.login('editor', 'editor-password-12345');
  const reviewer = await h.login('reviewer', 'reviewer-password-12345');
  const viewer = await h.login('viewer', 'viewer-password-12345');
  assert.equal((await h.request(null, '/api/project')).status, 401);
  assert.equal((await h.request(null, '/api/project', undefined, { Cookie: 'cw_session=' + 'f'.repeat(64) })).status, 401);
  assert.equal((await h.request(editor, '/api/change/plan', {}, { 'X-Companion-Token': 'bad' })).value.error, 'CSRF');
  assert.equal((await h.request(editor, '/api/change/plan', {}, { Origin: 'http://127.0.0.1:4321' })).value.error, 'ORIGIN');
  assert.equal((await h.request(viewer, '/api/change/apply', { actor: { role: 'owner' } })).value.error, 'ROLE_INSUFFICIENT');
  assert.equal((await h.request(reviewer, '/api/change/undo', {})).value.error, 'ROLE_INSUFFICIENT');
  assert.equal((await h.request(editor, '/api/auth/users', { userId: 'bad', role: 'owner', password: 'password-test-12345' })).value.error, 'ROLE_INSUFFICIENT');
  assert.equal((await h.request(editor, '/api/memory/slot', { scope: 'user', scopeId: 'reviewer', key: 'font.family', value: 'Other' })).value.error, 'USER_SCOPE');
  assert.equal((await h.request(h.owner, '/api/memory/slot', { scope: 'project', scopeId: 'foreign-project', key: 'font.family', value: 'Other' })).value.error, 'PROJECT_SCOPE');
  assert.equal((await h.request(editor, '/api/change/plan', { entry: 'object', ops: [{ file: 'src/../../secret.astro' }] })).value.error, 'PATH_OUT_OF_SCOPE');
  assert.equal((await h.login('reviewer', h.password)).value.error, 'INVALID_CREDENTIALS');
  const file = 'src/pages/newsletter.astro';
  const source = await readFile(path.join(h.root, file), 'utf8');
  const input = { entry: 'object', ops: [{ file, type: 'replaceAttrLiteral', anchor: { kind: 'attr', domId: 'editorial' }, expectedRevision: hash(source), name: 'class', value: 'editorial shared-proposal' }] };
  const proposed = await h.request(reviewer, '/api/change/plan', input);
  assert.equal(proposed.status, 200, JSON.stringify(proposed.value));
  const changeId = proposed.value.changeId;
  assert.equal((await h.request(editor, '/api/change/open', { changeId })).value.error, 'PLAN_NOT_FOUND');
  assert.equal((await h.request(editor, '/api/change/proposals', {})).value.length, 0);
  assert.equal((await h.request(reviewer, '/api/change/submit', { changeId })).status, 200);
  assert.equal((await h.request(viewer, '/api/change/open', { changeId })).status, 200);
  assert.equal((await h.request(editor, '/api/change/preview', { changeId })).status, 200);
  assert.equal((await h.request(editor, '/api/change/approve', { changeId })).value.error,'STATIC_PREVIEW_CONFIRMATION_REQUIRED');
  assert.equal((await h.request(editor, '/api/change/approve', { changeId, acknowledgeStatic: true })).status, 200);
  assert.equal((await h.request(h.owner, '/api/change/apply', { changeId })).value.error, 'ROLE_INSUFFICIENT');
  assert.equal((await h.request(editor, '/api/change/apply', { changeId })).value.state, 'COMMITTED');
  assert.match(await readFile(path.join(h.root, file), 'utf8'), /shared-proposal/);
  assert.equal((await h.request(editor, '/api/change/undo', { changeId })).value.state, 'COMMITTED');
  assert.equal(await readFile(path.join(h.root, file), 'utf8'), source);
  const events = await h.request(reviewer, '/api/memory/events');
  assert.ok(events.value.some(e => e.kind === 'feedback.apply'));
  assert.ok(!events.value.some(e => e.kind === 'auth.login' && e.userId === 'editor'));
  const denied = await h.request(viewer, '/api/memory/codeact', {});
  assert.equal(denied.value.error, 'ROLE_INSUFFICIENT');
});

test('HTTP current policy invalidates approval; locked objects cannot be changed by omitting objectId', async t => {
  const h = await authenticatedControl(t), file = 'src/pages/newsletter.astro';
  const source = await readFile(path.join(h.root, file), 'utf8');
  const input = { entry: 'object', ops: [{ file, type: 'replaceAttrLiteral', anchor: { kind: 'attr', domId: 'editorial' }, expectedRevision: hash(source), name: 'class', value: 'editorial policy-check' }] };
  const proposed = await h.request(h.owner, '/api/change/plan', input), changeId = proposed.value.changeId;
  assert.equal(proposed.status, 200);
  assert.equal((await h.request(h.owner, '/api/change/preview', { changeId })).status, 200);
  assert.equal((await h.request(h.owner, '/api/change/approve', { changeId, acknowledgeStatic: true })).status, 200);
  assert.equal((await h.request(h.owner, '/api/memory/slot', { scope: 'user', scopeId: 'owner', key: 'font.family', value: 'Inter' })).status, 200);
  assert.equal((await h.request(h.owner, '/api/change/apply', { changeId })).value.error, 'POLICY_CHANGED');
  assert.equal(await readFile(path.join(h.root, file), 'utf8'), source);
  assert.equal((await h.request(h.owner, '/api/memory/slot', { scope: 'project', scopeId: h.owner.actor.projectId, key: 'objects.locked', value: ['zone.news.reader'] })).status, 200);
  assert.equal((await h.request(h.owner, '/api/change/plan', input)).value.error, 'IMMUTABLE_OBJECT');
  const fixture = await h.request(h.owner, '/api/fixture/session', {});
  assert.match(fixture.value.sessionId, /^sess\./);
  assert.equal((await h.request(h.owner, '/api/memory/slot', { scope: 'instance', scopeId: 'ti.sess.foreign.1', key: 'motion.duration', value: 500 })).value.error, 'USER_SCOPE');
  const sessionsFile = path.join(h.root, '.companion/auth/sessions.json');
  const sessions = JSON.parse(await readFile(sessionsFile, 'utf8')); sessions[0].expiresAt = 0;
  await writeFile(sessionsFile, JSON.stringify(sessions));
  assert.equal((await h.request(h.owner, '/api/project')).value.error, 'SESSION_EXPIRED');
});

test('parallel user facts and fixture sessions stay isolated; missing sandbox and recovery state are visible and audited', async t => {
  const h=await authenticatedControl(t);
  for(const userId of ['alice','bob'])assert.equal((await h.request(h.owner,'/api/auth/users',{userId,role:'editor',password:userId+'-password-12345'})).status,200);
  const alice=await h.login('alice','alice-password-12345'),bob=await h.login('bob','bob-password-12345');
  await Promise.all([h.request(alice,'/api/memory/event',{kind:'selection',userId:'bob',payload:{marker:'alice-only-rectangle',rect:{x:10,y:20,width:30,height:40}}}),h.request(bob,'/api/memory/event',{kind:'selection',payload:{marker:'bob-only-rectangle'}})]);
  const ownEvents=(await h.request(alice,'/api/memory/events')).value;
  assert.ok(ownEvents.some(e=>e.payload?.marker==='alice-only-rectangle'&&e.userId==='alice'));
  assert.ok(!ownEvents.some(e=>e.payload?.marker==='bob-only-rectangle'));
  for(const [session,name,font]of [[alice,'alice','Inter'],[bob,'bob','Georgia']]){
    assert.equal((await h.request(session,'/api/memory/remember',{id:'preference',content:name+' pulse preference'})).status,200);
    assert.equal((await h.request(session,'/api/memory/slot',{scope:'user',scopeId:name,key:'font.family',value:font})).status,200);
    assert.equal((await h.request(session,'/api/memory/slots')).value.values['font.family'],font);
    const results=(await h.request(session,'/api/memory/search',{query:'pulse'})).value;
    assert.equal(results.length,1);assert.match(results[0].content,new RegExp(name));assert.equal(results[0].authoritative,false);
  }
  const first=(await h.request(alice,'/api/fixture/session',{})).value,second=(await h.request(alice,'/api/fixture/session',{})).value;
  assert.notEqual(first.sessionId,second.sessionId);
  assert.equal((await h.request(bob,'/api/memory/slot',{scope:'instance',scopeId:`ti.${first.sessionId}.1`,key:'motion.duration',value:300})).value.error,'USER_SCOPE');
  const sentinel=path.join(h.root,'host-must-not-run.txt'),script=`import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(sentinel)},'unsafe');`;
  const sandbox=await h.request(alice,'/api/memory/codeact',{script,scriptSha256:hash(script),language:'node',taskScope:{network:false,secrets:false,sourceWrite:false},timeoutMs:1000,maxOutputBytes:4096,inputFiles:[]});
  assert.equal(sandbox.status,503);assert.equal(sandbox.value.error,'SANDBOX_UNAVAILABLE');await assert.rejects(readFile(sentinel),{code:'ENOENT'});
  assert.ok((await h.request(alice,'/api/memory/events')).value.some(e=>e.kind==='sandbox.execution'&&e.payload.code==='SANDBOX_UNAVAILABLE'));
  const files=['src/pages/index.astro','src/pages/newsletter.astro'],changes=[];
  for(const file of files){const before=await readFile(path.join(h.root,file),'utf8'),after='<!-- recovery test -->\n'+before;changes.push({file,before,after,beforeHash:hash(before),afterHash:hash(after)});}
  const plan={changes,baseRevisions:Object.fromEntries(changes.map(c=>[c.file,c.beforeHash])),patchDigest:hash(JSON.stringify(changes.map(c=>[c.file,c.afterHash])))};
  const journal=createJournal({root:h.root,secret:'test-recovery',crashAt(stage,j,i){if(stage==='afterRename'&&i===0)throw Error('simulated crash');}});
  await assert.rejects(journal.transact(plan,journal.approve(plan,h.owner.actor),h.owner.actor),/simulated crash/);
  const foreign='<!-- foreign bytes -->\n'+changes[1].before;await writeFile(path.join(h.root,files[1]),foreign);
  assert.equal((await journal.recover())[0].state,'RECOVERY_REQUIRED');
  const session=(await h.request(alice,'/api/change/session')).value;assert.equal(session.readOnly,true);assert.equal(session.capabilities.includes('apply'),false);
  assert.equal((await h.request(alice,'/api/change/plan',{entry:'object',ops:[]})).value.error,'RECOVERY_REQUIRED');
  assert.equal((await h.request(alice,'/api/memory/slot',{scope:'user',scopeId:'alice',key:'font.family',value:'Other'})).value.error,'RECOVERY_REQUIRED');
  const report=(await h.request(alice,'/api/change/recovery')).value;assert.equal(report.readOnly,true);assert.equal(report.reports[0].files[1].live,foreign);
  assert.equal(await readFile(path.join(h.root,files[1]),'utf8'),foreign);
});
