import {buildAgentContext} from './agent-context.js';
import {attachRegistry} from './registry-plan.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {compileChangePlan,createJournal,dryRun,safeTarget} from './journal.js';
import {hash} from '../workbench-core/objects/spec.js';
import {records,reject} from '../workbench-core/changes/structure.js';
import {analyzeSource} from '../dev-studio/source-engine.js';
import {verifyRemeasure} from '../workbench-core/geometry.js';
import {specService} from './spec-service.js';
import {companionAgent} from './agent-service.js';
import {authorize} from './auth.js';
import {highRisk,checkLockedObjects} from './plan-policy.js';
import {ensureRecordIdentity} from './registry-identity.js';
import {sourceRevision} from './project-source.js';
export async function body(req){if(req.parsedBody!==undefined)return req.parsedBody;let size=0,text='';for await(const chunk of req){size+=chunk.length;if(size>262144)reject('BODY_LIMIT');text+=chunk;}try{const input=JSON.parse(text);if(!input||typeof input!=='object'||Array.isArray(input))throw Error();req.parsedBody=input;return input;}catch{reject('INVALID_JSON');}}
export async function createChangeApi(root,{security}={}){const token=randomBytes(32).toString('hex'),localActor={userId:'local-owner',role:'owner'},journal=createJournal({root,secret:randomBytes(32),policyRevision:security?security.slots.revision:undefined}),plans=new Map(),specs=specService(root),agent=companionAgent({root});await journal.recover();
  security?.setRecoveryProbe(async()=>{try{await journal.ensureWritable();return false;}catch{return true;}});
  async function geometry(value,baseline){if(!value||!value.before||!value.after)reject('REMEASURE_REQUIRED');verifyRemeasure(value.before,value.after);if(baseline){verifyRemeasure(baseline,value.after);if(baseline.selectionId!==value.after.selectionId||baseline.parentSourceId!==value.after.parentSourceId)reject('SELECTION_CHANGED');}if(!value.after.selectionId||!/^s_[a-f0-9]{16}$/.test(value.after.parentSourceId)||value.before.selectionId!==value.after.selectionId||value.before.parentSourceId!==value.after.parentSourceId)reject('SELECTION_CHANGED');if(!Number.isFinite(value.after.sampledAt)||Date.now()-value.after.sampledAt>10000||value.after.sampledAt>Date.now()+1000)reject('STALE_MEASUREMENT');if(value.after.layoutFacts?.fontsReady!==true)reject('FONTS_NOT_READY');if(value.after.sourceRevisions.project!==await sourceRevision(root))reject('REVISION_STALE');}
  async function keepPlan(plan,actor,refs){if(security){const parameters=await security.parameters(actor,refs);await checkLockedObjects(root,plan,parameters);plan.taskParameters=parameters;await security.log(actor,'plan.created',{changeId:plan.changeId,entry:plan.entry,patchDigest:plan.patchDigest,files:plan.changes.map(c=>c.file)});}plans.set(plan.changeId,{plan,actorUserId:actor.userId});return plan;}
  async function publishOutcome(actor,result,kind){let derivedStatePending=false;try{await specs.publishBase();if(security)await security.log(actor,kind,{transactionId:result.id,state:result.state,files:result.files.map(f=>f.file)},'project');}catch{derivedStatePending=true;}return {transactionId:result.id,state:result.state,derivedStatePending};}
  const handle=async function handle(req,url,json){
    const actor=req.actor||localActor;
    if(url.pathname==='/api/change/session'&&req.method==='GET'){let recoveryRequired=false;try{await journal.ensureWritable();}catch{recoveryRequired=true;}const candidates=['view','measure','analyze','explain','propose','preview','approve','apply','undo','memory.read','memory.write','slot.write','codeact.run'];const capabilities=security?candidates.filter(action=>{try{return authorize(actor,{projectId:actor.projectId,action,recoveryRequired});}catch{return false;}}):candidates;return json(200,{token:req.csrfToken||token,actor,phase:security?'P4':'P3',readOnly:recoveryRequired||!capabilities.includes('apply'),recoveryRequired,capabilities});}
    if(url.pathname==='/api/change/recovery'&&req.method==='GET')return json(200,await journal.recoveryReport());
    if(!url.pathname.startsWith('/api/change/'))return false;
    if(req.method!=='POST')return json(405,{error:'METHOD'});
    if(!req.companionAuthenticated&&req.headers['x-companion-token']!==token) return json(403,{error:'SESSION'});
    try{const input=await body(req);
      if(url.pathname==='/api/change/spec-read')return json(200,await specs.read());
      if(url.pathname==='/api/change/spec-observe')return json(200,await specs.observe());
      if(url.pathname==='/api/change/agent-cancel')return json(200,await agent.cancel(actor.userId));
      if(url.pathname==='/api/change/agent'){const current=await specs.read(),parameters=security?await security.parameters(actor,input.refs):undefined,context=await buildAgentContext(root,current,{objectId:input.objectId,selection:input.context?.selection,parameters});if(security)await security.log(actor,'dialogue',{capability:input.capability,intent:input.intent,context:input.context});const result=await agent.run({userId:actor.userId,capability:input.capability,intent:input.intent,context});if(security)await security.log(actor,'agent.result',{capability:input.capability,result});return json(200,result);}
      if(url.pathname==='/api/change/proposals')return json(200,[...plans.values()].filter(p=>p.visibility==='project'||p.actorUserId===actor.userId).map(p=>({changeId:p.plan.changeId,creator:p.actorUserId,visibility:p.visibility||'user',verdict:p.plan.verdict})));
      if(['/api/change/open'].includes(url.pathname)){const saved=plans.get(input.changeId);if(!saved||saved.actorUserId!==actor.userId&&saved.visibility!=='project')reject('PLAN_NOT_FOUND');return json(200,saved.plan);}
      if(!['/api/change/preview','/api/change/resolve'].includes(url.pathname))await journal.ensureWritable();
      if(url.pathname==='/api/change/spec-plan'){const result=await specs.plan(input.spec,{layoutFacts:input.layoutFacts,merges:input.merges});if(result.writePlan)await keepPlan(result.writePlan,actor,input.refs);return json(200,result);}
      if(url.pathname==='/api/change/resolve'){
        if(!/^s_[a-f0-9]{16}$/.test(input.sourceId))reject('ANCHOR_UNMAPPED');
        const files=['src/pages/index.astro','src/pages/discography.astro','src/pages/newsletter.astro','src/layouts/SiteLayout.astro','src/components/PageWipe.astro'];
        for(const file of files){const source=await readFile(path.join(root,file),'utf8'),record=analyzeSource(source,file).records.find(r=>r.sourceId===input.sourceId);if(record){const r=records(source).find(r=>r.start===record.range[0]);if(!r)reject('ANCHOR_UNMAPPED');const registry=JSON.parse(await readFile(path.join(root,'workbench/objects/ivorg.object.json'),'utf8')),objectId=ensureRecordIdentity(registry,source,file,r);return json(200,{file,anchor:{kind:'structural',path:r.path},revision:hash(source),objectId});}}reject('ANCHOR_UNMAPPED');
      }
      if(url.pathname==='/api/change/plan'){if(input.entry==='spatial'){await geometry(input.geometry);for(const op of input.ops||[])if(op.type==='insertSibling'){op.layoutFacts={...input.geometry.after.layoutFacts};op.gridPlacement=input.geometry.after.grid;}}const sources={};for(const op of input.ops||[]){const target=await safeTarget(root,op.file);sources[op.file]=await readFile(target,'utf8');if(op.expectedRevision!==hash(sources[op.file]))reject('REVISION_STALE');if(input.entry==='spatial'&&op.type==='insertSibling'){const all=records(sources[op.file]),target=all.find(r=>op.anchor?.kind==='attr'?r.attrs.id===op.anchor.domId:r.path===op.anchor?.path),parent=op.position==='append'?target:all.find(r=>r.start===target?.parentStart),selected=analyzeSource(sources[op.file],op.file).records.find(r=>r.sourceId===input.geometry.after.parentSourceId);if(!parent||!selected||parent.start!==selected.range[0])reject('ANCHOR_SELECTION_MISMATCH');}}const plan=await attachRegistry(root,compileChangePlan(sources,input));plan.geometry=input.geometry;await keepPlan(plan,actor,input.refs);return json(200,plan);}
      const saved=plans.get(input.changeId);if(!saved||saved.actorUserId!==actor.userId&&!(saved.visibility==='project'&&['editor','owner'].includes(actor.role)))reject('PLAN_NOT_FOUND');const {plan}=saved;
      if(url.pathname==='/api/change/submit'){saved.visibility='project';if(security)await security.log(actor,'plan.submitted',{changeId:plan.changeId},'project');return json(200,{changeId:plan.changeId,visibility:'project'});}
      if(security&&['/api/change/approve','/api/change/apply','/api/change/undo'].includes(url.pathname)){authorize(actor,{projectId:actor.projectId,action:url.pathname.split('/').at(-1),highRisk:highRisk(plan)});await checkLockedObjects(root,plan,await security.parameters(actor));}
      if(url.pathname==='/api/change/preview'){const preview=await dryRun(root,plan);saved.previewDigest=preview.patchDigest;saved.preview=preview;return json(200,preview);}
      if(url.pathname==='/api/change/approve'){if(saved.previewDigest!==plan.patchDigest)reject('PREVIEW_REQUIRED');if(saved.preview.requiresManualConfirmation&&input.acknowledgeStatic!==true)reject('STATIC_PREVIEW_CONFIRMATION_REQUIRED');saved.approval=journal.approve(plan,actor);if(security)await security.log(actor,'plan.approved',{changeId:plan.changeId,patchDigest:plan.patchDigest,approvalId:saved.approval.payload.approvalId,previewMode:saved.preview.mode,acknowledgeStatic:input.acknowledgeStatic===true});return json(200,saved.approval);}
      if(url.pathname==='/api/change/apply'){if(plan.entry==='spatial')await geometry(input.geometry,plan.geometry.before);const result=await journal.transact(plan,saved.approval,actor);saved.transactionId=result.id;return json(200,await publishOutcome(actor,result,'feedback.apply'));}
      if(url.pathname==='/api/change/undo'){if(plan.entry==='spatial')await geometry(input.geometry);if(!saved.transactionId)reject('UNDO_NOT_AVAILABLE');const result=await journal.undo(saved.transactionId,actor);return json(200,await publishOutcome(actor,result,'feedback.undo'));}
      return json(404,{error:'NOT_FOUND'});
    }catch(e){return json(e.status||500,{error:e.code||'CHANGE_FAILED',detail:e.message});}
  };
  handle.close=()=>agent.close();return handle;
}
