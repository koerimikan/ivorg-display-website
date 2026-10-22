import path from 'node:path';
import { mkdir, readFile, writeFile, rename, lstat, realpath } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { retryTimestamp } from './quota-recovery.js';

const fail = (code, status = 503) => Object.assign(Error(code), { code, status });
const version = '0.1.0-rc.5';
const files = Object.freeze({
  sdk: 'packages/sdk/client/lib/index.js',
  bin: 'packages/examples/jsonrpc-demo/lib/bin.js',
  server: 'packages/sdk/server/lib/index.js',
  spine: 'packages/examples/agent-spine-demo/lib/index.js',
  llm: 'packages/llm/llm-deepseek/lib/index.js',
  persistence: 'packages/session/session-persistence-jsonl/lib/index.js'
});

async function scopedDirectory(root,parts) {
  const base=await realpath(root);let directory=base;
  for(const part of parts){
    directory=path.join(directory,part);await mkdir(directory,{recursive:true});
    if((await lstat(directory)).isSymbolicLink()||!(await realpath(directory)).startsWith(base+path.sep))throw fail('USER_SCOPE',403);
  }
  return directory;
}

export function dshEnvironment(source) {
  const allowed = new Set(['PATH','PATHEXT','SYSTEMROOT','WINDIR','COMSPEC','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','DEEPSEEK_API_KEY','DEEPSEEK_BASE_URL']);
  return Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toUpperCase())));
}

export async function inspectDsh(harnessRoot) {
  if (typeof harnessRoot !== 'string' || !path.isAbsolute(harnessRoot)) throw fail('DSH_ROOT_REQUIRED');
  const root = await realpath(harnessRoot), manifest = JSON.parse(await readFile(path.join(root,'packages/sdk/client/package.json'),'utf8'));
  if (manifest.name !== '@deepseek-ai/dsh-sdk-client' || manifest.version !== version) throw fail('DSH_VERSION_UNSUPPORTED');
  const paths = {}, hashes = {};
  for (const [key, relative] of Object.entries(files)) {
    const file = path.join(root,relative), actual = await realpath(file);
    if (!actual.startsWith(root + path.sep) || (await lstat(file)).isSymbolicLink()) throw fail('DSH_RUNTIME_PATH');
    paths[key] = actual;
    hashes[key] = createHash('sha256').update(await readFile(actual)).digest('hex');
  }
  return { root, version, paths, hashes };
}

export async function configureDsh({root,harnessRoot,model='deepseek-v4-flash',maxTokens=8192}) {
  const runtime = await inspectDsh(harnessRoot);
  if (typeof model !== 'string' || !/^[\w.-]{1,100}$/.test(model) || !Number.isSafeInteger(maxTokens) || maxTokens < 256 || maxTokens > 49152) throw fail('DSH_CONFIG_SCHEMA',400);
  const directory=await scopedDirectory(root,['.companion','agent']);
  const config={schemaVersion:1,backend:'deepseek-harness',harnessRoot:runtime.root,sdkVersion:runtime.version,hashes:runtime.hashes,model,maxTokens};
  const file=path.join(directory,'runtime.json'),temp=file+'.'+randomUUID()+'.tmp';
  await writeFile(temp,JSON.stringify(config,null,2)+'\n',{mode:0o600});await rename(temp,file);
  return {backend:config.backend,version:runtime.version,model,maxTokens,file};
}

async function configuration(root,environment) {
  let config;
  try {config=JSON.parse(await readFile(path.join(root,'.companion/agent/runtime.json'),'utf8'));}
  catch (error) {if(error.code!=='ENOENT')throw error;}
  const runtime=await inspectDsh(environment.COMPANION_DSH_ROOT || config?.harnessRoot);
  if(config){
    if(config.schemaVersion!==1||config.backend!=='deepseek-harness'||config.sdkVersion!==version)throw fail('DSH_CONFIG_SCHEMA');
    if(!environment.COMPANION_DSH_ROOT&&JSON.stringify(runtime.hashes)!==JSON.stringify(config.hashes))throw fail('DSH_RUNTIME_CHANGED',409);
  }
  const model=environment.COMPANION_DSH_MODEL||config?.model||'deepseek-v4-flash';
  const maxTokens=Number(environment.COMPANION_DSH_MAX_TOKENS||config?.maxTokens||8192);
  if(!/^[\w.-]{1,100}$/.test(model)||!Number.isSafeInteger(maxTokens)||maxTokens<256||maxTokens>49152)throw fail('DSH_CONFIG_SCHEMA');
  return {...runtime,model,maxTokens};
}

// Trusted composition only: no bash, FS editor, subagent, skill, MCP or user patch loader.
export function dshComposition(paths,sessionRoot) {
  const plugin=file=>path.isAbsolute(file)?pathToFileURL(file).href:file;
  return [
    {id:'atelier-sdk',name:plugin(paths.server),config:{maxTokensAsSuccess:false}},
    {id:'atelier-llm',name:plugin(paths.llm),config:{apiKeyEnv:'DEEPSEEK_API_KEY',thinking:'enabled',reasoningEffort:'high',streamIdleTimeoutMs:60000,retryPolicy:{mode:'normal',maxRetries:0}}},
    {id:'atelier-spine',name:plugin(paths.spine),config:{includeHarnessIdentity:false,includeRuntimeContext:false,persona:'You are Atelier Companion. Analyze and explain source evidence; propose typed changes only. You have no filesystem or shell tools.',workspaceContext:false,skills:{enabled:false},toolBash:false,toolJobs:false,goals:false}},
    {id:'atelier-session-log',name:plugin(paths.persistence),config:{root:sessionRoot,compression:'none'}}
  ];
}

export class DshAdapter {
  constructor(harness,{maxEventBytes=8*1048576,maxEvents=50000}={}) {
    this.harness=harness;this.maxEventBytes=maxEventBytes;this.maxEvents=maxEvents;this.running=false;this.closed=false;
  }
  async prompt(message,{signal,timeoutMs=120000}={}) {
    if(this.closed)throw fail('DSH_CLOSED');if(this.running)throw fail('DSH_BUSY',409);
    if(signal?.aborted)return {status:'aborted',events:[]};
    if(typeof message!=='string'||!Number.isFinite(timeoutMs)||timeoutMs<=0)throw fail('DSH_REQUEST',400);
    this.running=true;let timer,abort,bytes=0,count=0;
    const stop=new Promise(resolve=>{
      timer=setTimeout(()=>resolve({status:'timeout'}),timeoutMs);
      abort=()=>resolve({status:'aborted'});signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted)abort();
    });
    const run=Promise.resolve().then(()=>this.harness.run(message,{sessionId:'atelier-'+randomUUID(),onNotification:notification=>{
      const size=Buffer.byteLength(JSON.stringify(notification));bytes+=size;count++;
      if(size>1048576||bytes>this.maxEventBytes||count>this.maxEvents)throw fail('DSH_EVENT_LIMIT');
    }})).then(result=>({result}),error=>({error}));
    try {
      const outcome=await Promise.race([run,stop]);
      if(outcome.status){await this.close();if(outcome.status==='timeout')throw fail('DSH_TIMEOUT',504);return {status:'aborted',events:[]};}
      if(outcome.error){await this.close();throw fail(outcome.error.code==='DSH_EVENT_LIMIT'?'DSH_EVENT_LIMIT':'DSH_TRANSPORT_ERROR');}
      const result=outcome.result,reason=result.events?.findLast(event=>event.type==='turn/end')?.data?.reason;
      if(reason?.kind==='error'){
        const provider=reason.error||{},message=provider.message||'';
        if(provider.status===429||/429|quota exceeded|rate limit|too many requests|quota exhausted/i.test(message))return {status:'rateLimited',retryAtTimestamp:provider.providerRetryAfterMs>0?new Date(Date.now()+provider.providerRetryAfterMs).toISOString():retryTimestamp(message),events:result.events};
        return {status:'error',error:provider.code||'DSH_PROVIDER_ERROR',events:result.events};
      }
      if(reason?.kind!=='completed'||typeof result.finalResponse!=='string'||!result.finalResponse.trim())return {status:'error',error:'DSH_INCOMPLETE_RESULT',events:result.events||[]};
      return {status:'completed',text:result.finalResponse,events:result.events};
    } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);this.running=false;}
  }
  async command(type) {if(type!=='abort')throw fail('DSH_COMMAND_UNSUPPORTED',400);await this.close();}
  async close() {if(!this.closing){this.closed=true;this.closing=Promise.resolve().then(()=>this.harness.close());}await this.closing;}
}

export async function startDsh({root,userId,environment=process.env}) {
  if(typeof userId!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(userId))throw fail('USER_SCOPE',403);
  const directory=await scopedDirectory(root,['.companion','agent','users',userId]);
  const config=await configuration(root,environment);
  const runDirectory=path.join(directory,'runs',randomUUID());await mkdir(runDirectory,{recursive:true});
  const configFile=path.join(runDirectory,'cordis.yml');
  await writeFile(configFile,JSON.stringify(dshComposition(config.paths,path.join(directory,'sessions')),null,2)+'\n',{mode:0o600});
  const {DeepSeekHarness}=await import(pathToFileURL(config.paths.sdk).href);
  const harness=new DeepSeekHarness({launch:{command:process.execPath,args:[config.paths.bin,configFile],cwd:runDirectory,env:dshEnvironment(environment),requestTimeoutMs:30000,shutdownTimeoutMs:1000,disposeEofGraceMs:1500,disposeGraceMs:1000},cwd:runDirectory,provider:'deepseek-official',model:config.model,maxTokens:config.maxTokens});
  return new DshAdapter(harness);
}
