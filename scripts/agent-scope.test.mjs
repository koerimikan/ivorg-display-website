// Pure geometry/data/filesystem/HTTP tests. Never launches or controls a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { normalizeRect,intersects,selectSemanticRoots,summarizeDOM,captureContext } from '../src/dev-studio/context-capture.js';
import { buildTaskProposal,estimateTokens,TaskError,sanitizeSnapshot } from '../src/dev-studio/task-proposal.js';
import { collectMotionContext } from '../src/dev-studio/motion-context.js';
import { createSourceService,createRpcMiddleware } from '../src/dev-studio/server.js';

const sourceId='s_1234567890abcdef';
const domDocument={styleSheets:[],defaultView:{innerWidth:1000,innerHeight:800,getComputedStyle:el=>el._style,matchMedia:()=>({matches:true})}};
function el(tag,{attrs={},text='',children=[],rect={left:100,top:100,width:500,height:300},style={}}={}) {
  const node={nodeType:1,tagName:tag.toUpperCase(),attrs,ownerDocument:domDocument,parentElement:null,children,childNodes:[],_style:{display:'block',visibility:'visible',opacity:'1',...style},
    getAttribute(key){return this.attrs[key]??null;},hasAttribute(key){return key in this.attrs;},
    getBoundingClientRect(){return {...rect,right:rect.left+rect.width,bottom:rect.top+rect.height};},
    matches(selector){return selector.split(',').some(s=>{s=s.trim();return s[0]==='.'?(attrs.class||'').split(' ').includes(s.slice(1)):s[0]==='#'?attrs.id===s.slice(1):s==='[data-decode]'?'data-decode' in attrs:s===tag;});},
    querySelector(selector){for(const child of this.children){if(child.matches(selector))return child;const nested=child.querySelector(selector);if(nested)return nested;}return null;},
    closest(selector){let current=this;while(current){if(current.matches(selector))return current;current=current.parentElement;}return null;}
  };
  if(text)node.childNodes.push({nodeType:3,nodeValue:text});
  for(const child of children){child.parentElement=node;node.childNodes.push(child);}
  Object.defineProperty(node,'textContent',{get(){return this.childNodes.map(child=>child.nodeType===3?child.nodeValue:child.textContent).join(' ');}});
  return node;
}
const flatten=roots=>roots.flatMap(node=>[node,...flatten(node.children||[])]);
function trackFixture(count=7) {
  const rows=Array.from({length:count},(_,i)=>el('tr',{attrs:{class:'track-row'},rect:{left:100,top:100+i*40,width:500,height:40},children:[el('td',{text:String(i+1),rect:{left:100,top:100+i*40,width:40,height:40}}),el('td',{text:`Track ${i+1} / Singer ${i+1} / 03:20`,rect:{left:140,top:100+i*40,width:460,height:40}})]}));
  return el('tbody',{attrs:{'data-ds-id':sourceId},children:rows,rect:{left:100,top:100,width:500,height:count*40}});
}
function packet(snapshot=captureContext([trackFixture()])) {
  return {snapshot,selection:{route:'/discography/',viewport:{width:1440,height:900}},scope:{editable:['src/pages/discography.astro'],readOnly:['src/lib/release.js']},constraints:[],sourceSnippets:[{file:'src/pages/discography.astro',range:[0,80],baseRevision:'sha256:abc',kind:'template',code:'<tbody>{TRACKS.map(track => <tr>{track.title}</tr>)}</tbody>',truncated:false}],motion:[]};
}
const errorStatus=status=>error=>error instanceof TaskError&&error.status===status;

test('rectangles normalize reverse drag and touching edges are not intersections',()=>{
  assert.deepEqual(normalizeRect({x:30,y:40},{x:10,y:20}),{left:10,top:20,right:30,bottom:40,width:20,height:20});
  assert.equal(intersects({left:0,top:0,width:10,height:10},{left:10,top:0,width:10,height:10}),false);
});

test('seven rows collapse to one representative plus seven data summaries',()=>{
  const summary=summarizeDOM([trackFixture()]);
  assert.equal(summary.nodes.length,1);assert.equal(summary.nodes[0].children.length,1);
  const representative=summary.nodes[0].children[0];
  assert.equal(representative.tag,'tr');assert.equal(representative.repeat.count,7);
  assert.equal(representative.repeat.items.length,7);assert.match(representative.repeat.items[6],/Track 7/);
  assert.equal(summary.nodeCount,4);
});

test('no intersecting element or blank full-page wrapper yields empty selection',()=>{
  assert.deepEqual(selectSemanticRoots([trackFixture()],{left:900,top:700,width:10,height:10}),[]);
  const main=el('main',{rect:{left:0,top:0,width:1000,height:800}});
  assert.deepEqual(selectSemanticRoots([main],{left:900,top:700,width:10,height:10}),[]);
  assert.throws(()=>sanitizeSnapshot({domSummary:{nodes:[]}}),errorStatus(422));
});

test('semantic roots converge to tbody without selecting body/main',()=>{
  const tbody=trackFixture(), main=el('main',{rect:{left:0,top:0,width:1000,height:800},children:[tbody]});
  const roots=selectSemanticRoots(flatten([main]),{left:95,top:95,width:510,height:290});
  assert.deepEqual(roots,[tbody]);
});

test('parallel small semantic roots stay separate when their common ancestor is too large',()=>{
  const a=el('article',{rect:{left:0,top:0,width:100,height:100},children:[el('p',{text:'A',rect:{left:0,top:0,width:100,height:100}})]});
  const b=el('article',{rect:{left:150,top:0,width:100,height:100},children:[el('p',{text:'B',rect:{left:150,top:0,width:100,height:100}})]});
  const main=el('main',{rect:{left:0,top:0,width:5000,height:5000},children:[a,b]});
  const roots=selectSemanticRoots(flatten([main]),{left:0,top:0,width:250,height:100},{viewportArea:100000});
  assert.equal(roots.length,2);assert(!roots.includes(main));
});

test('80-node and six-level bounds hold even when larger limits are requested',()=>{
  const children=Array.from({length:120},(_,i)=>el('div',{text:`Child ${i}`,attrs:{class:`unique-${String.fromCharCode(65+i)}`}}));
  const summary=summarizeDOM([el('section',{children})],{maxNodes:1000,maxDepth:100});
  assert(summary.nodeCount<=80);assert.equal(summary.truncated,true);
  let deep=el('p',{text:'last'});for(let i=0;i<20;i++)deep=el('section',{children:[deep]});
  const depth=node=>1+Math.max(0,...(node.children||[]).map(depth));
  assert(depth(summarizeDOM([deep]).nodes[0])<=6);
});

test('hidden nodes, HUD and input values are excluded; data-ds-id is used instead of DOM id',()=>{
  const hidden=el('span',{text:'secret',attrs:{hidden:''}}),input=el('input',{attrs:{value:'private',type:'password'}});
  const hud=el('dev-studio-hud',{text:'HUD'}),visible=el('p',{text:'Visible',attrs:{id:'not-source','data-ds-id':sourceId}});
  const snapshot=captureContext([el('section',{children:[hidden,input,hud,visible]})]);
  assert(!JSON.stringify(snapshot).includes('secret'));assert(!JSON.stringify(snapshot).includes('private'));assert(!JSON.stringify(snapshot).includes('HUD'));
  assert.deepEqual(snapshot.sourceIds,[sourceId]);
});

test('computed styles whitelist preserves transforms and captures only referenced variables',()=>{
  const node=el('div',{attrs:{'data-ds-id':sourceId,style:'font-size: var(--size)'},style:{width:'500px',height:'300px',transform:'matrix(1,0,0,1,2,3)','clip-path':'polygon(0 0,100% 0,0 100%)','font-size':'16px','--size':'16px','--unused':'secret','cursor':'pointer'}});
  const snapshot=captureContext([node]);
  const styles=snapshot.styles.n0;
  assert.equal(styles.transform,'matrix(1,0,0,1,2,3)');assert(styles['clip-path']);
  assert.equal(styles.variables['--size'],'16px');assert.equal(styles.variables['--unused'],undefined);assert.equal(styles.cursor,undefined);
});

test('matched stylesheet variables are captured without enumerating unused theme values',()=>{
  const node=el('p',{attrs:{class:'copy'},style:{'--size':'18px','--unused':'secret'}});
  const snapshot=captureContext([node],{styleSheets:[{cssRules:[{selectorText:'.copy',style:{cssText:'font-size:var(--size)'}}]}]});
  assert.deepEqual(snapshot.styles.n0.variables,{'--size':'18px'});
});

test('duplicate DOM IDs reject ambiguous style association',()=>{
  const snapshot=captureContext([trackFixture()]);snapshot.domSummary.nodes[0].children[0].id='n0';
  assert.throws(()=>sanitizeSnapshot(snapshot),errorStatus(422));
});

test('small drag does not expand to a viewport-sized semantic ancestor',()=>{
  const child=el('p',{text:'small',rect:{left:10,top:10,width:20,height:20}});
  const article=el('article',{children:[child],rect:{left:0,top:0,width:600,height:600}});
  const roots=selectSemanticRoots([article,child],{left:10,top:10,width:20,height:20},{viewportArea:1000000});
  assert.deepEqual(roots,[child]);
});

test('unmapped loop row falls back to mapped template ancestor',()=>{
  const root=trackFixture();
  const snapshot=captureContext([root.children[0]]);
  assert.deepEqual(snapshot.sourceIds,[sourceId]);assert.equal(snapshot.unmapped,false);
});

test('motion constraints come from registered selectors',()=>{
  const roots=[trackFixture()];
  const bindings=collectMotionContext(roots);
  assert(bindings.some(binding=>binding.id==='entrance'));
  assert(bindings.some(binding=>binding.constraints.some(value=>value.includes('createEntranceTimeline'))));
});

test('task JSON and Markdown stay within budget including large intent and source',()=>{
  const input=packet();
  input.sourceSnippets[0].code='模板内容'.repeat(1000);
  input.snapshot.styles=Object.fromEntries(flatten(input.snapshot.domSummary.nodes).map(node=>[node.id,{'font-family':'x'.repeat(150),width:'500px',transform:'matrix(1,0,0,1,2,3)'}]));
  const result=buildTaskProposal(input,'将曲目矩阵改成横向跑马灯抽屉');
  assert(estimateTokens(JSON.stringify(result.task,null,2)+'\n')<=6000);
  assert(estimateTokens(result.markdown)<=6000);assert(result.task.context.truncated);
  assert.equal(result.task.kind,'dev-studio.task');assert.equal(result.task.version,1);
});

test('oversized intent is rejected and DOM-only scope never guesses editable files',()=>{
  assert.throws(()=>buildTaskProposal(packet(),'中'.repeat(1000)),errorStatus(422));
  const snapshot=captureContext([el('article',{text:'Unmapped'})]);
  const result=buildTaskProposal(packet(snapshot),'Refine layout');
  assert.deepEqual(result.task.scope.editable,[]);assert(result.task.context.limitations.length);
});

async function fixture(t){
  const directory=await mkdtemp(path.join(tmpdir(),'ivorg-task-scope-')),root=path.join(directory,'project');
  await mkdir(path.join(root,'src/pages'),{recursive:true});await mkdir(path.join(root,'src/styles'));await mkdir(path.join(root,'src/lib'));
  const source='---\nimport "../styles/page.css";\nimport { TRACKS } from "../lib/release.js";\n---\n<section><tbody>{TRACKS.map(track=><tr>{track.title}</tr>)}</tbody></section>';
  await writeFile(path.join(root,'src/pages/index.astro'),source);await writeFile(path.join(root,'src/styles/page.css'),'.track-row {display:grid}');await writeFile(path.join(root,'src/lib/release.js'),'export const TRACKS = [{ title: "One" }];');
  const service=createSourceService({root});const record=service.register(source,'src/pages/index.astro').records.find(record=>record.tag==='tbody');
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const snapshot=captureContext([trackFixture()]);snapshot.sourceIds=[record.sourceId];
  snapshot.domSummary.nodes[0].sourceId=record.sourceId;
  return{directory,root,source,service,record,body:{snapshot,selection:{route:'/discography/',viewport:{width:1440,height:900}},motionIds:[]}};
}

test('server reads exact template ranges and derives CSS editable/data read-only scope',async t=>{
  const {service,body}=await fixture(t);const context=await service.context(body);
  assert(context.scope.editable.includes('src/pages/index.astro'));assert(context.scope.editable.includes('src/styles/page.css'));assert(context.scope.readOnly.includes('src/lib/release.js'));
  const snippet=context.context.sourceSnippets.find(snippet=>snippet.kind==='template');
  assert(snippet.code.startsWith('<tbody>'));assert(!snippet.code.includes('<section>'));
});

test('export writes standard JSON/Markdown and latest alias without modifying source',async t=>{
  const {service,body,root,source}=await fixture(t);const context=await service.context(body);
  const exported=await service.exportTask({contextId:context.contextId,intent:'Make a horizontal drawer'});
  const json=await readFile(path.join(root,'.dev-studio/tasks/latest.json'),'utf8');
  assert.equal(await readFile(path.join(root,'.dev-studio/tasks/dev-studio.task.json'),'utf8'),json);
  assert.equal(JSON.parse(json).intent,'Make a horizontal drawer');assert.equal(await readFile(path.join(root,'.dev-studio/tasks/task.md'),'utf8'),exported.markdown);
  assert.equal(await readFile(path.join(root,'src/pages/index.astro'),'utf8'),source);
});

test('stale context source is rejected before export',async t=>{
  const {service,body,root}=await fixture(t);const context=await service.context(body);
  await writeFile(path.join(root,'src/styles/page.css'),'/* externally changed */');
  await assert.rejects(service.exportTask({contextId:context.contextId,intent:'Refactor'}),errorStatus(409));
});

test('task export cannot escape through a symlinked output directory',async t=>{
  const {service,body,root,directory}=await fixture(t);const context=await service.context(body);
  const outside=path.join(directory,'outside');await mkdir(outside);
  await symlink(outside,path.join(root,'.dev-studio'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(service.exportTask({contextId:context.contextId,intent:'Refactor'}),errorStatus(403));
});

test('a symlinked artifact is rejected before any fixed artifact is overwritten',async t=>{
  const {service,body,root,directory}=await fixture(t);const context=await service.context(body);
  const output=path.join(root,'.dev-studio/tasks');await mkdir(output,{recursive:true});
  const external=path.join(directory,'external.md');await writeFile(external,'DO NOT CHANGE');
  // File links need Windows developer mode; a directory junction is sufficient to test rejection.
  const target=path.join(directory,'external-dir');await mkdir(target);
  await symlink(target,path.join(output,'task.md'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(service.exportTask({contextId:context.contextId,intent:'Refactor'}),errorStatus(403));
  await assert.rejects(readFile(path.join(output,'latest.json')),{code:'ENOENT'});
  assert.equal(await readFile(external,'utf8'),'DO NOT CHANGE');
});

test('HTTP context/proposal/export uses authenticated RPC and returns canonical task',async t=>{
  const {service,body,root}=await fixture(t);const middleware=createRpcMiddleware(service);
  const server=createServer((req,res)=>middleware(req,res,()=>{res.statusCode=404;res.end();}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;let token;
  const post=async(route,input)=>{const response=await fetch(`${origin}/__dev_studio_api/${route}`,{method:'POST',headers:{origin,'content-type':'application/json',...(token?{'x-dev-studio-token':token}:{})},body:JSON.stringify(input)});return{status:response.status,body:await response.json()};};
  assert.equal((await post('context',body)).status,401);token=(await post('session',{})).body.token;
  const context=await post('context',body);assert.equal(context.status,200);
  const input={contextId:context.body.contextId,intent:'将曲目矩阵改成横向跑马灯抽屉'};
  const proposal=await post('proposal',input);assert.equal(proposal.status,200);assert.equal(proposal.body.task.kind,'dev-studio.task');
  const exported=await post('export-task',input);assert.equal(exported.status,200);
  assert.equal(JSON.parse(await readFile(path.join(root,'.dev-studio/tasks/latest.json'),'utf8')).intent,input.intent);
  assert.equal((await post('export-task',{contextId:'invalid',intent:'x'})).status,409);
});
