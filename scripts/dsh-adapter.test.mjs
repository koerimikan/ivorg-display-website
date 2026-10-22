import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,symlink,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {DshAdapter,dshEnvironment,dshComposition,startDsh} from '../packages/atelier/src/workbench-server/dsh-adapter.js';
import {companionAgent} from '../packages/atelier/src/workbench-server/agent-service.js';
import {projectFixture} from './project-fixture.mjs';
const completed=text=>({finalResponse:text,events:[{type:'turn/end',data:{reason:{kind:'completed'}}}]});
function harness(run){let closes=0;return {run,close:async()=>{closes++;},get closes(){return closes;}};}

test('DeepSeek Harness environment excludes preloads, unrelated credentials and external composition overrides',()=>{
  assert.deepEqual(dshEnvironment({PATH:'bin',DEEPSEEK_API_KEY:'selected',DEEPSEEK_BASE_URL:'https://api.deepseek.com',NODE_OPTIONS:'--require bad.js',OPENAI_API_KEY:'unrelated',DSH_CORDIS_CONFIG:'unsafe.yml',AWS_SECRET_ACCESS_KEY:'other'}),{PATH:'bin',DEEPSEEK_API_KEY:'selected',DEEPSEEK_BASE_URL:'https://api.deepseek.com'});
});
test('trusted composition disables all model-facing shell, skills, jobs and file editor plugins',()=>{
  const c=dshComposition({server:'server',llm:'llm',spine:'spine',persistence:'log'},'/user/alice/sessions');
  assert.equal(c.length,4);assert.deepEqual(c.map(p=>p.name),['server','llm','spine','log']);
  assert.equal(c[2].config.toolBash,false);assert.equal(c[2].config.toolJobs,false);assert.equal(c[2].config.workspaceContext,false);assert.equal(c[2].config.skills.enabled,false);assert.equal(c[3].config.root,'/user/alice/sessions');
});
test('DSH returns committed Unicode response only after a completed root turn',async()=>{
  const c=new DshAdapter(harness(async()=>completed('甲\u2028乙😀')));
  const r=await c.prompt('explain');assert.equal(r.status,'completed');assert.equal(r.text,'甲\u2028乙😀');await c.close();
});
test('SDK idle without completed turn is not success and token truncation cannot form an accepted plan',async()=>{
  for(const reason of [undefined,{kind:'max-tokens'},{kind:'blocked'}]){
    const c=new DshAdapter(harness(async()=>({finalResponse:'{"ops":[]}',events:reason?[{type:'turn/end',data:{reason}}]:[]})));
    assert.equal((await c.prompt('modify')).status,'error');await c.close();
  }
});
test('DSH provider quota is retained with provider delay rather than reported as success',async()=>{
  const c=new DshAdapter(harness(async()=>({events:[{type:'turn/end',data:{reason:{kind:'error',error:{status:429,providerRetryAfterMs:120000,message:'rate limited'}}}}]})));
  const now=Date.now(),r=await c.prompt('analyze');assert.equal(r.status,'rateLimited');assert.ok(Date.parse(r.retryAtTimestamp)>=now+120000);await c.close();
});
test('pre-aborted task never enters the runtime',async()=>{
  let called=false;const c=new DshAdapter(harness(async()=>{called=true;})),a=new AbortController();a.abort();
  assert.equal((await c.prompt('x',{signal:a.signal})).status,'aborted');assert.equal(called,false);await c.close();
});
test('cancellation owns and closes its runtime exactly once; it does not invent a wire cancel method',async()=>{
  const h=harness(()=>new Promise(()=>{})),c=new DshAdapter(h),a=new AbortController(),result=c.prompt('x',{signal:a.signal});a.abort();
  assert.equal((await result).status,'aborted');await c.close();assert.equal(h.closes,1);await assert.rejects(c.prompt('again'),/DSH_CLOSED/);
});
test('DSH deadline closes runtime and fails explicitly',async()=>{
  const h=harness(()=>new Promise(()=>{})),c=new DshAdapter(h);await assert.rejects(c.prompt('x',{timeoutMs:15}),/DSH_TIMEOUT/);assert.equal(h.closes,1);
});
test('one owned interval cannot accept overlapping prompts',async()=>{
  let release;const h=harness(()=>new Promise(r=>{release=r;})),c=new DshAdapter(h),first=c.prompt('first');
  await assert.rejects(c.prompt('second'),/DSH_BUSY/);release(completed('first'));assert.equal((await first).text,'first');await c.close();
});
test('notification byte limit terminates producer instead of retaining an unbounded stream',async()=>{
  const h=harness(async(_,options)=>{options.onNotification({method:'session.event',params:{text:'x'.repeat(1000)}});return completed('x');}),c=new DshAdapter(h,{maxEventBytes:100});
  await assert.rejects(c.prompt('x'),/DSH_EVENT_LIMIT/);assert.equal(h.closes,1);
});
test('invalid user and parent-directory symlink are refused before runtime access',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'atelier-dsh-scope-')),outside=await mkdtemp(path.join(os.tmpdir(),'atelier-dsh-outside-'));t.after(()=>Promise.all([rm(root,{recursive:true,force:true}),rm(outside,{recursive:true,force:true})]));
  for(const userId of ['../bob','',undefined])await assert.rejects(startDsh({root,userId,environment:{}}),/USER_SCOPE/);
  await symlink(outside,path.join(root,'.companion'),process.platform==='win32'?'junction':'dir');await assert.rejects(startDsh({root,userId:'alice',environment:{}}),/USER_SCOPE/);
});
test('companion defaults to DSH with no silent fallback to installed Pi',async t=>{
  const root=await projectFixture(t),agent=companionAgent({root});t.after(()=>agent.close());
  const old=process.env.COMPANION_DSH_ROOT;delete process.env.COMPANION_DSH_ROOT;
  try {await assert.rejects(agent.run({userId:'alice',capability:'analyze',intent:'Explain',context:{evidence:['e'],baseRevisions:{}}}),/DSH_ROOT_REQUIRED/);}
  finally {if(old!==undefined)process.env.COMPANION_DSH_ROOT=old;}
});
test('shared companion service validates Harness proposals without writing real source',async t=>{
  const root=await projectFixture(t),file='src/pages/index.astro',before=await readFile(path.join(root,file),'utf8'),calls=[];
  const agent=companionAgent({root,startClient:async({userId})=>({prompt:async()=>{calls.push(userId);return {status:'completed',text:JSON.stringify({capability:'modify',ops:[],clarifications:['请选择插入容器'],evidence:['e']})};},close:async()=>{}})});t.after(()=>agent.close());
  const r=await agent.run({userId:'alice',capability:'modify',intent:'Add a module',context:{evidence:['e'],baseRevisions:{}}});assert.equal(r.status,'completed');assert.deepEqual(r.clarifications,['请选择插入容器']);assert.deepEqual(calls,['alice']);assert.equal(await readFile(path.join(root,file),'utf8'),before);
});
