import {createAuth,authorize,deny} from './auth.js';import {createEventLog} from './event-log.js';import {createSlots,createMemoryIndex} from './memory.js';import {createSandbox} from './sandbox.js';import {body} from './change-api.js';
import {readFile,mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';
import {randomUUID} from 'node:crypto';
export async function createSecurity({root,projectId,specDigest}){const auth=await createAuth({root,projectId}),eventLog=createEventLog(root),slots=await createSlots({root,eventLog}),memory=await createMemoryIndex({root,eventLog}),sandbox=createSandbox({root,eventLog});const attempts=new Map();
  const fixtureSessions=new Map();
  let recoveryProbe=async()=>false;
  const currentDigest=async()=>typeof specDigest==='function'?await specDigest():specDigest;
  const log=(actor,kind,payload,scope='user')=>eventLog.append({kind,scope,projectId,userId:actor.userId,sessionId:actor.sessionId,payload});
  async function parameters(actor,refs={}){const registry=JSON.parse(await readFile(path.join(root,'workbench/objects/ivorg.object.json'),'utf8'));for(const [scope,type]of [['definition','TransitionDefinition'],['binding','TransitionBinding']])if(refs[scope]&&!registry.graph.objects.some(o=>o.objectId===refs[scope]&&o.type===type))deny('SLOT_TARGET');if(refs.instance){const owned=[...fixtureSessions.values()].some(s=>s.userId===actor.userId&&s.projectId===projectId&&refs.instance.startsWith('ti.'+s.sessionId+'.')&&/^[1-9]\d*$/.test(refs.instance.slice(('ti.'+s.sessionId+'.').length)));if(!owned)deny('USER_SCOPE');}return slots.resolve(actor,refs);}
  async function handle(req,url,json,res){
    if(url.pathname==='/api/auth/session'&&req.method==='GET'){try{const actor=await auth.fromRequest(req);return json(200,{authenticated:true,actor,csrfToken:actor.csrfToken});}catch{return json(200,{authenticated:false});}}
    if(url.pathname==='/api/auth/login'&&req.method==='POST'){const address=req.socket.remoteAddress,now=Date.now(),prior=attempts.get(address)||{start:now,count:0};if(now-prior.start>60000){prior.start=now;prior.count=0;}attempts.set(address,prior);if(++prior.count>12)deny('LOGIN_RATE_LIMIT',429);const input=await body(req),login=await auth.login(input.userId,input.password);res.setHeader('Set-Cookie',`cw_session=${login.token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=28800`);await log(login.actor,'auth.login',{role:login.actor.role});return json(200,{actor:login.actor,csrfToken:login.csrfToken});}
    if(!url.pathname.startsWith('/api/'))return false;
    const actor=await auth.fromRequest(req);req.actor=actor;req.csrfToken=actor.csrfToken;req.companionAuthenticated=true;
    if(!['GET','HEAD'].includes(req.method))auth.csrf(req,actor);
    const input=req.method==='POST'?await body(req):{};
    const actions={'plan':'propose','spec-plan':'propose','submit':'propose','preview':'preview','approve':'approve','apply':'apply','undo':'undo','resolve':'measure','agent-cancel':'analyze'};
    const part=url.pathname.split('/').at(-1);const memoryActions={slot:'slot.write',remember:'memory.write',codeact:'codeact.run'};const action=part==='agent'?input.capability==='modify'?'propose':input.capability==='explain'?'explain':'analyze':url.pathname.startsWith('/api/change/')?actions[part]||'view':url.pathname.startsWith('/api/memory/')?memoryActions[part]||'memory.read':'view';try{authorize(actor,{projectId,action,recoveryRequired:await recoveryProbe()});}catch(error){await log(actor,'authorization.denied',{action,code:error.code,path:url.pathname});throw error;}
    if(url.pathname==='/api/fixture/session'&&req.method==='POST'){authorize(actor,{projectId,action:'measure'});const session={sessionId:'sess.'+randomUUID(),userId:actor.userId,projectId};fixtureSessions.set(session.sessionId,session);await log(actor,'fixture.session',session);return json(200,session);}
    if(url.pathname==='/api/auth/users'&&req.method==='POST'){const result=await auth.createUser(actor,input);await log(actor,'account.created',result,'project');return json(200,result);}
    if(url.pathname==='/api/auth/logout'&&req.method==='POST'){const token=/(?:^|;\s*)cw_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];await auth.revoke(token);res.setHeader('Set-Cookie','cw_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0');return json(200,{loggedOut:true});}
    if(url.pathname==='/api/memory/events'&&req.method==='GET')return json(200,await eventLog.scoped(actor));
    if(url.pathname==='/api/memory/slots'&&req.method==='GET')return json(200,await slots.resolve(actor));
    if(url.pathname==='/api/memory/slot'&&req.method==='POST'){if(['definition','binding','instance'].includes(input.scope))await parameters(actor,{[input.scope]:input.scopeId});if(input.key==='objects.locked'){const registry=JSON.parse(await readFile(path.join(root,'workbench/objects/ivorg.object.json'),'utf8'));if(!Array.isArray(input.value)||input.value.some(id=>![...registry.graph.objects,...(registry.structuralObjects||[])].some(o=>o.objectId===id)))deny('SLOT_TARGET');}return json(200,await slots.set(actor,input));}
    if(url.pathname==='/api/memory/search'&&req.method==='POST')return json(200,await memory.search(actor,input.query,{specDigest:await currentDigest(),includeStale:input.includeStale===true}));
    if(url.pathname==='/api/memory/remember'&&req.method==='POST')return json(200,await memory.remember(actor,{...input,specDigest:await currentDigest()}));
    if(url.pathname==='/api/memory/sandbox'&&req.method==='GET')return json(200,await sandbox.status());
    if(url.pathname==='/api/memory/codeact'&&req.method==='POST'){authorize(actor,{projectId,action:'codeact.run'});const directory=path.join(root,'.companion/memory/users',actor.userId);await mkdir(directory,{recursive:true});const snapshot={projectId,userId:actor.userId,parameters:await parameters(actor,input.refs||{}),memories:input.query?await memory.search(actor,input.query,{specDigest:await currentDigest()}):[]};await writeFile(path.join(directory,'context.json'),JSON.stringify(snapshot,null,2),{mode:0o600});return json(200,await sandbox.run(actor,{...input,policyRevision:slots.revision()}));}
    if(url.pathname==='/api/memory/event'&&req.method==='POST'){if(!['selection','dialogue','feedback.apply','feedback.undo'].includes(input.kind))deny('EVENT_SCHEMA',400);return json(200,await log(actor,input.kind,input.payload));}
    return false;
  }
  return {handle,auth,eventLog,slots,memory,sandbox,log,parameters,setRecoveryProbe:fn=>{recoveryProbe=fn;},close:()=>memory.close()};
}
