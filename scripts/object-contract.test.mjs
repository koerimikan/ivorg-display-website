import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateSpec } from '../src/workbench-core/objects/l3.js';
import { validateGraph } from '../src/workbench-core/objects/graph.js';
const xml = await readFile(new URL('../workbench/specs/ivorg.spec.xml', import.meta.url), 'utf8');
test('definition to binding to instance parameter overrides resolve and bounds/locks remain enforced', () => {
  const graph = validateSpec(xml).graph, binding = graph.objects.find(o => o.objectId === 'bnd.home.poster.feature'), instance = graph.objects.find(o => o.objectId === 'ti.wipe.0001');
  binding.overrides = [{ field: 'durationMs', strategy: 'replace', value: '600' }];
  instance.overrides = [{ field: 'durationMs', strategy: 'replace', value: '700' }];
  assert.equal(validateGraph(graph).resolved.get(instance.objectId).params.durationMs.value, 700);
  binding.overrides[0].value = '999999'; assert.throws(() => validateGraph(graph), /PARAM_RANGE/);
  binding.overrides[0] = { field: 'invented', strategy: 'replace', value: '1' }; assert.throws(() => validateGraph(graph), /OVERRIDE_UNKNOWN_FIELD/);
  binding.overrides[0] = { field: 'durationMs', strategy: 'replace', value: '600' };
  graph.objects.find(o => o.objectId === 'td.wipeCover').params.durationMs.locked = 'true'; assert.throws(() => validateGraph(graph), /OVERRIDE_LOCKED_FIELD/);
});
test('L3 enforces real adjacency/deck/self-link assertions, not a constant topology count', () => {
  assert.throws(() => validateSpec(xml.replaceAll('deckCursor="wipe-deck"','deckCursor="wrong"').replace('deckCursor="wrong"','deckCursor="different"')), /SHARED_DECK_CURSOR/);
  assert.throws(() => validateSpec(xml.replace('id="bnd.news.reader.next" fromPage="page.newsletter" toPage="page.newsletter" definitionRef="td.readerReplace" trigger="click" effect="inPlace" enabled="false"','id="bnd.news.reader.next" fromPage="page.newsletter" toPage="page.newsletter" definitionRef="td.readerReplace" trigger="click" effect="inPlace" enabled="true"')), /SELF_LINK_TRANSITION/);
  assert.throws(() => validateSpec(xml.replace('kind="sharedDeckCursor"','kind="invented"')), /ASSERTION_UNSUPPORTED/);
  let missing = xml;
  for (const id of ['bnd.nav.news.to.discography']) missing = missing.replace(new RegExp(`(<TransitionBinding id="${id}"[^>]+)enabled="true"`), '$1enabled="false"');
  assert.throws(() => validateSpec(missing), /ADJACENCY_COVERAGE/);
});
