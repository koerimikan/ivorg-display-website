import {attachRegistry} from './registry-plan.js';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {compileChangePlan,createJournal,dryRun,safeTarget} from './journal.js';
import {hash} from '../workbench-core/objects/spec.js';
import {records,reject} from '../workbench-core/changes/structure.js';
import {analyzeSource} from '../dev-studio/source-engine.js';
import {verifyRemeasure} from '../workbench-core/geometry.js';
export async function body(req){let size=0,text='';for await(const chunk of req){size+=chunk.length;if(size>262144)reject('BODY_LIMIT');text+=chunk;}try{return JSON.parse(text);}catch{reject('INVALID_JSON');}}
export async function createChangeApi(root){const token=randomBytes(32).toString('hex'),actor={userId:'local-owner',role:'owner'},journal=createJournal({root,secret:randomBytes(32)}),plans=new Map();await journal.recover();
  function geometry(value){if(!value||!value.before||!value.after)reject('REMEASURE_REQUIRED');verifyRemeasure(value.before,value.after);}
  return async function handle(req,url,json){
    if(url.pathname==='/api/change/session'&&req.method==='GET')return json(200,{token,actor,phase:'P2',readOnly:false});
    if(!url.pathname.startsWith('/api/change/'))return false;
    if(req.method!=='POST')return json(405,{error:'METHOD'});
    if(req.headers['x-companion-token']!==token) return json(403,{error:'SESSION'});
    try{const input=await body(req);await journal.ensureWritable();
      if(url.pathname==='/api/change/resolve'){
        if(!/^s_[a-f0-9]{16}$/.test(input.sourceId))reject('ANCHOR_UNMAPPED');
        const files=['src/pages/index.astro','src/pages/discography.astro','src/pages/newsletter.astro','src/layouts/SiteLayout.astro','src/components/PageWipe.astro'];
        for(const file of files){const source=await readFile(path.join(root,file),'utf8'),record=analyzeSource(source,file).records.find(r=>r.sourceId===input.sourceId);if(record){const r=records(source).find(r=>r.start===record.range[0]);if(!r)reject('ANCHOR_UNMAPPED');return json(200,{file,anchor:{kind:'structural',path:r.path},revision:hash(source),objectId:`selection.${input.sourceId}`});}}reject('ANCHOR_UNMAPPED');
      }
      if(url.pathname==='/api/change/plan'){if(input.entry==='spatial')geometry(input.geometry);const sources={};for(const op of input.ops||[]){const target=await safeTarget(root,op.file);sources[op.file]=await readFile(target,'utf8');if(op.expectedRevision!==hash(sources[op.file]))reject('REVISION_STALE');}const plan=await attachRegistry(root,compileChangePlan(sources,input));plan.geometry=input.geometry;plans.set(plan.changeId,{plan,actorUserId:actor.userId});return json(200,plan);}
      const saved=plans.get(input.changeId);if(!saved||saved.actorUserId!==actor.userId)reject('PLAN_NOT_FOUND');const {plan}=saved;
      if(url.pathname==='/api/change/preview'){const preview=await dryRun(root,plan);saved.previewDigest=preview.patchDigest;return json(200,preview);}
      if(url.pathname==='/api/change/approve'){if(saved.previewDigest!==plan.patchDigest)reject('PREVIEW_REQUIRED');saved.approval=journal.approve(plan,actor);return json(200,saved.approval);}
      if(url.pathname==='/api/change/apply'){if(plan.entry==='spatial')geometry(input.geometry);const result=await journal.transact(plan,saved.approval,actor);saved.transactionId=result.id;return json(200,{transactionId:result.id,state:result.state});}
      if(url.pathname==='/api/change/undo'){if(plan.entry==='spatial')geometry(input.geometry);if(!saved.transactionId)reject('UNDO_NOT_AVAILABLE');return json(200,await journal.undo(saved.transactionId,actor));}
      return json(404,{error:'NOT_FOUND'});
    }catch(e){return json(e.status||500,{error:e.code||'CHANGE_FAILED',detail:e.message});}
  };
}
