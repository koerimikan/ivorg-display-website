// Backend smoke only: actual page/source IDs + synthetic DOM summary. No browser, no writes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {analyzeSource} from '../src/dev-studio/source-engine.js';
const origin=process.argv[2]||'http://127.0.0.1:4322';
const html=await(await fetch(origin+'/discography/')).text();
const source=await readFile(new URL('../src/pages/discography.astro',import.meta.url),'utf8');
const record=analyzeSource(source,'src/pages/discography.astro').records.find(record=>source.slice(...record.range).startsWith('<div class="track-matrix"'));
assert(record&&html.includes(record.sourceId));
console.log('PASS 1 - real discography response contains source mapping');
let token;
async function post(route,body){
  const response=await fetch(origin+'/__dev_studio_api/'+route,{method:'POST',headers:{origin,'content-type':'application/json',...(token?{'x-dev-studio-token':token}:{})},body:JSON.stringify(body)});
  const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result;
}
({token}=await post('session',{}));
const snapshot={domSummary:{nodes:[{id:'n0',tag:'div',classes:['track-matrix'],sourceId:record.sourceId,text:'Track matrix'}],nodeCount:1,truncated:false},styles:{},sourceIds:[record.sourceId]};
const context=await post('context',{snapshot,motionIds:['entrance'],selection:{route:'/discography/',viewport:{width:1440,height:900}}});
assert(context.scope.editable.includes('src/pages/discography.astro'));
assert(context.scope.editable.includes('src/styles/discography.css'));
console.log('PASS 2 - live context resolves real template and associated CSS');
const result=await post('proposal',{contextId:context.contextId,intent:'将曲目矩阵改成横向跑马灯抽屉'});
assert.equal(result.task.kind,'dev-studio.task');assert(result.budget.estimatedTokens<=6000);
console.log(`PASS 3 - canonical proposal fits budget (${result.budget.estimatedTokens}/6000)`);
for(const file of ['/src/dev-studio/agent-scope.js','/src/dev-studio/context-capture.js'])assert.equal((await fetch(origin+file)).status,200);
console.log('PASS 4 - Vite compiles both development client modules');
console.log('4/4 PASS (no source or task files written)');
