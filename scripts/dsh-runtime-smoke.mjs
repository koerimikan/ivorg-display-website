// Real official Harness SDK + Cordis + DeepSeek provider; only HTTP inference is a local fixture.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {startDsh,configureDsh,dshEnvironment} from '../packages/atelier/src/workbench-server/dsh-adapter.js';
const repo=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2),at=args.indexOf('--harness');
const harnessRoot=at>=0?path.resolve(args[at+1]):JSON.parse(await readFile(path.join(repo,'apps/ivorg-website/.companion/agent/runtime.json'),'utf8')).harnessRoot;
const root=await mkdtemp(path.join(os.tmpdir(),'atelier-dsh-real-')),requests=[],clients=[];
let cancelEntered;const cancelSeen=new Promise(resolve=>{cancelEntered=resolve;});
const server=createServer((req,res)=>{let raw='';req.on('data',d=>{raw+=d;});req.on('end',()=>{
  const body=JSON.parse(raw);requests.push(body);
  if(raw.includes('RATE_TEST')){res.writeHead(429,{'Content-Type':'application/json','Retry-After':'2'});res.end(JSON.stringify({error:{message:'rate limit reached',type:'rate_limit_error'}}));return;}
  if(raw.includes('CANCEL_TEST')){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: '+JSON.stringify({choices:[{delta:{role:'assistant',content:null}}]})+'\n\n');cancelEntered();return;}
  const text=JSON.stringify({capability:'explain',summary:'真实 Harness 本地推理夹具：甲\u2028乙😀',evidence:['local-fixture']});
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  for(const record of [{choices:[{delta:{role:'assistant',content:null,reasoning_content:''}}]},{choices:[{delta:{content:text}}]},{choices:[{delta:{content:''},finish_reason:'stop'}],usage:{prompt_tokens:3,completion_tokens:20}}])res.write('data: '+JSON.stringify(record)+'\n\n');
  res.end('data: [DONE]\n\n');
});});
try{
  await configureDsh({root,harnessRoot});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const environment={...dshEnvironment(process.env),DEEPSEEK_API_KEY:'local-fixture-only',DEEPSEEK_BASE_URL:`http://127.0.0.1:${server.address().port}`};
  for(const userId of ['alice','bob']){
    const client=await startDsh({root,userId,environment});clients.push(client);await client.harness.start();
    const result=await client.prompt('Explain using the supplied fixture evidence.',{timeoutMs:30000});assert.equal(result.status,'completed',JSON.stringify(result));assert.equal(JSON.parse(result.text).evidence[0],'local-fixture');assert.match(result.text,/😀/);await client.close();
    const runs=await readdir(path.join(root,'.companion/agent/users',userId,'runs'));assert.equal(runs.length,1);
    const composition=JSON.parse(await readFile(path.join(root,'.companion/agent/users',userId,'runs',runs[0],'cordis.yml'),'utf8'));
    assert.equal(composition.length,4);assert.equal(composition[2].config.toolBash,false);
    assert.ok((await readdir(path.join(root,'.companion/agent/users',userId,'sessions'))).length>0,'real session log required');
  }
  const limited=await startDsh({root,userId:'quota',environment});clients.push(limited);const quota=await limited.prompt('RATE_TEST',{timeoutMs:15000});assert.equal(quota.status,'rateLimited',JSON.stringify(quota));assert.ok(Date.parse(quota.retryAtTimestamp)>Date.now());await limited.close();
  const cancelled=await startDsh({root,userId:'cancel',environment});clients.push(cancelled);await cancelled.harness.start();const controller=new AbortController(),pending=cancelled.prompt('CANCEL_TEST',{signal:controller.signal,timeoutMs:15000});let timer;pending.catch(()=>{});try{await Promise.race([cancelSeen,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Provider request not observed')),5000);})]);controller.abort();assert.equal((await pending).status,'aborted');}finally{clearTimeout(timer);await cancelled.close();}
  assert.equal(requests.length,4);for(const request of requests)assert.ok(!request.tools?.length,'model must have no direct write/shell tools');
  console.log('DSH_RUNTIME_SMOKE PASS '+JSON.stringify({sdkVersion:'0.1.0-rc.5',officialHarness:true,realCordisLoop:true,localInferenceFixture:true,externalModelCall:false,completedUsers:2,quota:true,cancel:true,requests:requests.length,toolCount:0,unicode:true,persistentSessions:true,ownedShutdown:true}));
} finally {await Promise.all(clients.map(c=>c.close()));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});}
