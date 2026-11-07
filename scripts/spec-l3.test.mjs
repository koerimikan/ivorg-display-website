import {test} from 'node:test';import a from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {validateSpec} from '../packages/atelier/src/workbench-core/objects/l3.js';
const xml=await readFile(new URL('../apps/ivorg-website/workbench/specs/ivorg.spec.xml',import.meta.url),'utf8');
test('full authoritative XML passes L1/L2/L3 including root identity',()=>{const result=validateSpec(xml);a.equal(result.state.byId.get('spec.ivorg.workbench').type,'Spec');a.equal(result.graph.objects.length,99);});
test('L3 rejects observed/proposed mixing, unknown content nature, wrong SSR initial, enabled self transition',()=>{for(const bad of [xml.replace('origin="observed"','origin="proposed"'),xml.replace('contentNature="real"','contentNature="draft"'),xml.replace('renderState="ssrInitial"','renderState="clientSelectable"'),xml.replace('readonly="true"','readonly="false"')])a.throws(()=>validateSpec(bad));a.throws(()=>validateSpec(xml,{ssrIssueNumber:'04'}),/SSR_INITIAL/);});
test('L3 ties the visible label to content nature: real issues forbid a demo label, demo issues require one',()=>{
  a.doesNotThrow(()=>validateSpec(xml,{sourceDemoText:'Club writing by IVORG members.'}));
  a.throws(()=>validateSpec(xml,{sourceDemoText:'ILLUSTRATIVE DEMO ARCHIVE'}),/DEMO_LABEL_STALE/);
  const demo=xml.replace('contentNature="real"','contentNature="illustrativeDemo"');
  a.doesNotThrow(()=>validateSpec(demo,{sourceDemoText:'ILLUSTRATIVE DEMO ARCHIVE'}));
  a.throws(()=>validateSpec(demo,{sourceDemoText:'publication'}),/DEMO_LABEL/);
  const issue=/<Issue id="iss\.01"[\s\S]*?<\/Issue>/.exec(xml)[0];
  const sibling=issue.replace('id="iss.01"','id="iss.00"').replace('number="01"','number="00"').replace('contentNature="real"','contentNature="illustrativeDemo"').replace('renderState="ssrInitial"','renderState="clientSelectable"').replace('tbl.issue01','tbl.issue00');
  a.throws(()=>validateSpec(xml.replace(issue,issue+'\n'+sibling)),/CONTENT_NATURE_MIXED/);
});
