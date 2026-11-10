import {test} from 'node:test';import a from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {projectFixture} from './project-fixture.mjs';import {specService} from '../packages/atelier/src/workbench-server/spec-service.js';import {createJournal} from '../packages/atelier/src/workbench-server/journal.js';import {readCanonicalRegistry} from '../packages/atelier/src/workbench-server/canonical-registry.js';

const SPEC='workbench/specs/ivorg.spec.xml',REGISTRY='workbench/objects/ivorg.object.json';
const actor={userId:'test',role:'owner'};
async function applySpecEdit(root,from,to){const service=specService(root),current=await service.read();a.ok(current.spec.includes(from),from);const result=await service.plan(current.spec.replace(from,to));a.equal(result.proposal.verdict,'specOnly');const journal=createJournal({root,secret:'test'});await journal.transact(result.writePlan,journal.approve(result.writePlan,actor),actor);return result.writePlan;}
function git(root,...args){const run=spawnSync('git',['-c','user.name=test','-c','user.email=test@example.invalid','-c','core.autocrlf=false',...args],{cwd:root,encoding:'utf8',windowsHide:true});return {code:run.status,out:(run.stdout||'')+(run.stderr||'')};}
function ok(root,...args){const r=git(root,...args);a.equal(r.code,0,r.out);return r.out;}

test('a Spec-only edit changes zero registry bytes',async t=>{const root=await projectFixture(t),before=await readFile(path.join(root,REGISTRY),'utf8');
  const plan=await applySpecEdit(root,'Abstract home card.','Abstract home card (edited).');
  a.deepEqual(plan.changes.map(c=>c.file),[SPEC]);a.equal(await readFile(path.join(root,REGISTRY),'utf8'),before);});

test('two branches editing different Spec objects merge without conflict and still load',async t=>{const root=await projectFixture(t);
  await writeFile(path.join(root,'.gitignore'),'.companion/\nnode_modules\n');
  ok(root,'init','-q','-b','main');ok(root,'add','-A');ok(root,'commit','-qm','base');
  ok(root,'checkout','-qb','member-a');await applySpecEdit(root,'Abstract home card.','Abstract home card, edited by A.');ok(root,'commit','-qam','a');
  ok(root,'checkout','-q','main');ok(root,'checkout','-qb','member-b');await applySpecEdit(root,'Shared navigation rendered','Shared navigation (edited by B) rendered');ok(root,'commit','-qam','b');
  for(const branch of ['member-a','member-b'])a.equal(ok(root,'diff','--name-only','main',branch).trim(),SPEC);
  const merge=git(root,'merge','-q','--no-edit','member-a');a.equal(merge.code,0,merge.out);
  const {spec,registry}=await readCanonicalRegistry(root);a.match(spec,/edited by A/);a.match(spec,/edited by B/);a.equal(registry.graph.objects.length,99);
  a.equal(registry.graph.objects.find(o=>o.objectId==='cmp.baseCard').description.includes('edited by A'),true);});
