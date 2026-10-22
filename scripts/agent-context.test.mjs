import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { projectFixture } from './project-fixture.mjs';
import { specService } from '../packages/atelier/src/workbench-server/spec-service.js';
import { buildAgentContext } from '../packages/atelier/src/workbench-server/agent-context.js';
import { validateAgentResult } from '../packages/atelier/src/workbench-server/agent-service.js';

test('ContextBundle uses real bounded source evidence, all invariants and read-only transition implementation', async t => {
  const root = await projectFixture(t), current = await specService(root).read();
  for (const objectId of ['zone.news.reader','bnd.home.cta.discography','page.newsletter']) {
    const context = await buildAgentContext(root, current, { objectId });
    assert.equal(context.target.objectId, objectId); assert.equal(context.invariants.length, 9);
    assert.ok(context.siblings.length <= 8 && context.components.length <= 4);
    assert.ok(Buffer.byteLength(JSON.stringify(context)) <= 6000);
    for (const snippet of context.sourceSnippets) {
      assert.ok(snippet.endLine - snippet.startLine < 200);
      const source = await readFile(path.join(root, snippet.file), 'utf8');
      assert.ok(source.split('\n').slice(snippet.startLine - 1, snippet.endLine).join('\n').includes(snippet.code));
    }
    if (objectId.startsWith('bnd.')) { assert.equal(context.targets.length, 0); assert.ok(context.sourceSnippets[0].code.includes('function createWipeTimeline')); assert.ok(context.scope.readOnly.includes('src/scripts/motion.js')); }
  }
  await assert.rejects(buildAgentContext(root, current, { objectId: 'node.nonexistent' }), /OBJECT_NOT_FOUND/);
});

test('Pi proposals require scoped evidence and exact AST target; foreign paths and status injection are refused', async t => {
  const root = await projectFixture(t), context = await buildAgentContext(root, await specService(root).read(), { objectId: 'zone.news.reader' });
  const target = context.targets[0], good = { capability: 'modify', ops: [{ type: 'replaceAttrLiteral', file: target.file, anchor: target.anchor, expectedRevision: target.expectedRevision, name: 'class', value: 'editorial' }], clarifications: [], evidence: [target.evidence] };
  assert.equal(validateAgentResult(good, 'modify', context).status, 'completed');
  assert.throws(() => validateAgentResult({ ...good, evidence: [] }, 'modify', context), /AGENT_EVIDENCE_REQUIRED/);
  assert.throws(() => validateAgentResult({ ...good, status: 'completed' }, 'modify', context), /AGENT_RESULT_SCHEMA/);
  assert.throws(() => validateAgentResult({ ...good, ops: [{ ...good.ops[0], file: 'src/pages/index.astro' }] }, 'modify', context), /AGENT_TARGET_EVIDENCE/);
  assert.throws(() => validateAgentResult({ capability: 'explain', summary: 'invented', evidence: ['src/private.js:1'] }, 'explain', context), /AGENT_EVIDENCE_REQUIRED/);
});
