const fail=code=>{throw Object.assign(new Error(code),{code,status:409});};
export const quantize=v=>{if(!Number.isFinite(v))fail('INVALID_GEOMETRY');return 2*Math.round(v/2)||0;};
export function rect(r){if(!r||!['x','y','width','height'].every(k=>Number.isFinite(r[k])))fail('INVALID_GEOMETRY');return {x:r.x+Math.min(0,r.width),y:r.y+Math.min(0,r.height),width:Math.abs(r.width),height:Math.abs(r.height)};}
export function inversePoint(p,m){if(m.length!==6||!m.every(Number.isFinite)||m[1]!==0||m[2]!==0||m[0]===0||m[3]===0)fail('ANCESTOR_TRANSFORM_ROTATE');return {x:(p.x-m[4])/m[0],y:(p.y-m[5])/m[3]};}
export function spatialSelection({selectionId,raw,contentBox,matrix=[1,0,0,1,0,0],scroll={x:0,y:0},frameEpoch,sourceRevisions={},objectIds=[],runtimeSourceIds=[],frameZoom=1,dpr=1}){
  const points=raw.kind==='polygon'?raw.polygon:[{x:raw.rect.x,y:raw.rect.y},{x:raw.rect.x+raw.rect.width,y:raw.rect.y+raw.rect.height}];
  if(!Array.isArray(points)||points.length<2||points.length>1024||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))fail('INVALID_GEOMETRY');
  const r=rect({x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),width:Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),height:Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))});
  let local=null,normalized=null;try{const a=inversePoint(r,matrix),b=inversePoint({x:r.x+r.width,y:r.y+r.height},matrix);local=rect({...a,width:b.x-a.x,height:b.y-a.y});if(contentBox?.width>0&&contentBox?.height>0)normalized={x:(local.x-contentBox.x)/contentBox.width,y:(local.y-contentBox.y)/contentBox.height,width:local.width/contentBox.width,height:local.height/contentBox.height};}catch{}
  return {selectionId,raw,rects:{viewport:r,document:{...r,x:r.x+scroll.x,y:r.y+scroll.y},...(local?{container:local}:{})},normalized,nonInvertible:!local,frames:[{space:'container',matrix,denominator:'content-box',scroll,frameZoom,dpr}],frameEpoch,sourceRevisions,objectIds,runtimeSourceIds,mode:objectIds.length?'box':'empty'};
}
export async function geometryFingerprint(rectangles){const bytes=new TextEncoder().encode(JSON.stringify(rectangles.map(r=>Object.fromEntries(Object.entries(rect(r)).map(([k,v])=>[k,quantize(v)])))));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function verifyRemeasure(before,after){if(before.frameEpoch!==after.frameEpoch)fail('EPOCH');if(JSON.stringify(before.sourceRevisions)!==JSON.stringify(after.sourceRevisions))fail('REVISION_STALE');for(const k of ['x','y','width','height'])if(Math.abs(before.rects.viewport[k]-after.rects.viewport[k])>1)fail('GEOMETRY_STALE');return true;}
export function inferGrid({columns,rows,columnGap=0,rowGap=0,writingMode='horizontal-tb',dense=false}){
  if(writingMode!=='horizontal-tb')return {confidence:0,ambiguity:['writingMode'],columns:[],rows:[],reasons:['Vertical writing requires explicit placement']};
  const tracks=(text,gap)=>{let pos=0;return String(text).trim().split(/\s+/).map((v,i)=>{if(!/^\d+(?:\.\d+)?px$/.test(v))throw Error();const size=parseFloat(v),t={index:i+1,start:pos,end:pos+size,size};pos+=size+gap;return t;});};
  try{return {source:'computedStyle',columns:tracks(columns,columnGap),rows:tracks(rows,rowGap),gaps:{column:columnGap,row:rowGap},confidence:dense?.4:1,ambiguity:dense?['autoPlacement']:[],reasons:dense?['Dense placement requires explicit append']:['Resolved pixel tracks']};}catch{return {source:'none',columns:[],rows:[],confidence:0,ambiguity:['implicitTracks'],reasons:['Unresolved tracks; append only']};}
}
export function gridPlacement(r,grid){if(grid.confidence<.6)return {appendOnly:true,reasons:grid.reasons};const indices=(tracks,start,end)=>tracks.filter(t=>t.end>start&&t.start<end).map(t=>t.index);return {columns:indices(grid.columns,r.x,r.x+r.width),rows:indices(grid.rows,r.y,r.y+r.height),appendOnly:false};}
export function directionalNeighbors(r,siblings,{parentId,zoneId}){
  const center=a=>({x:a.x+a.width/2,y:a.y+a.height/2}),p=center(r),out={};
  for(const direction of ['up','down','left','right']){const horizontal=['left','right'].includes(direction),sign=['left','up'].includes(direction)?-1:1;
    const candidates=siblings.filter(s=>s.parentId===parentId&&s.zoneId===zoneId).map(s=>{const c=center(s.rect),axis=horizontal?c.x-p.x:c.y-p.y,other=Math.abs(horizontal?c.y-p.y:c.x-p.x);const overlap=horizontal?Math.max(0,Math.min(r.y+r.height,s.rect.y+s.rect.height)-Math.max(r.y,s.rect.y)):Math.max(0,Math.min(r.x+r.width,s.rect.x+s.rect.width)-Math.max(r.x,s.rect.x));return {...s,axis,score:.55/(1+Math.abs(axis)/100)+.30/(1+other/100)+.15*Math.min(1,overlap/Math.max(1,horizontal?r.height:r.width))-(s.occluded?.3:0)-(s.transformed?.2:0)};}).filter(s=>s.axis*sign>0).sort((a,b)=>b.score-a.score);
    out[direction]=candidates.length&&(!candidates[1]||candidates[0].score-candidates[1].score>=.05)?candidates[0].sourceId:null;
  }return out;
}
