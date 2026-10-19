import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gsap } from 'gsap';
import { validateSpec } from '../src/workbench-core/objects/l3.js';
import { createFixtureSession, compareNormalized } from '../src/workbench-core/motion/fixture.js';
const prior = globalThis.matchMedia;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
const { createWipeTimeline } = await import('../src/scripts/motion.js');
globalThis.matchMedia = prior;
after(() => gsap.ticker.sleep());
const graph = validateSpec(await readFile(new URL('../workbench/specs/ivorg.spec.xml',import.meta.url),'utf8')).graph;
const find = id => graph.objects.find(o => o.objectId === id);
const input = id => { const binding=find(id); return {binding,definition:find(binding.fields.definitionRef),seed:9,specHash:graph.specHash,sourceRevision:'a'.repeat(64),targetRevision:'b'.repeat(64)}; };
test('real production GSAP wipe factory matches normalized baked clip-path and xPercent at five fixed times within 1e-3',async()=>{
  for(const id of ['bnd.home.poster.feature','bnd.paging.disco.prev']){
    const session=createFixtureSession('sess.alignment'),artifact=await session.bake(input(id)),strips={xPercent:0},copy={yPercent:0,opacity:0};
    const element={clipPath:'',querySelector:selector=>selector==='.wipe-strips'?strips:copy};
    const live=createWipeTimeline(element,id==='bnd.home.poster.feature',{paused:true});
    for(const ratio of [0,.25,.5,.75,1]){
      const index=Math.round((artifact.frames.length-1)*ratio),frame=artifact.frames[index]; live.totalTime(frame.timeMs/1000,false);
      const values=element.clipPath.match(/-?\d+(?:\.\d+)?/g).map(Number);
      const state={clipLeft:values[0],clipRight:values[2],clipBottomRight:values[4],clipBottomLeft:values[6],stripX:strips.xPercent};
      assert.equal(compareNormalized(frame.state,state,{frameIndex:index,environment:artifact.environment}).status,'passed',JSON.stringify({id,index,state,baked:frame.state,environment:artifact.environment}));
      assert.equal(compareNormalized(frame.state,session.sampleLive(frame.timeMs).state,{frameIndex:index,environment:artifact.environment}).status,'passed');
    }
    live.kill();
  }
});
test('effective params affect rendered state, real generator revisions affect keys and environment mismatch is explicit',async()=>{
  const session=createFixtureSession('sess.params'),base=input('bnd.home.poster.feature'),a=await session.bake(base);
  const altered=structuredClone(base);altered.binding.params={...altered.definition.params,stripShiftPercent:{value:12},easing:{value:'none'}};
  const b=await session.bake(altered);assert.notEqual(a.checksum,b.checksum);assert.equal(b.frames[0].state.stripX,12);
  assert.notEqual((await session.bake({...base,fixtureRevision:'c'.repeat(64)})).bakeKey,a.bakeKey);
  assert.equal(compareNormalized(a.frames[0].state,a.frames[0].state,{environment:a.environment,liveEnvironment:{...a.environment,dpr:2}}).status,'environmentDifferent');
  const failure=compareNormalized(a.frames[0].state,{...a.frames[0].state,stripX:99},{frameIndex:0,environment:a.environment});assert.equal(failure.status,'failed');assert.equal(failure.differences[0].frameIndex,0);assert.equal(failure.differences[0].field,'stripX');
});
