import { sanitizeSnapshot } from '../dev-studio/task-proposal.js';
export const CONTROL_ORIGIN = 'http://127.0.0.1:4323';
export const PREVIEW_ORIGIN = 'http://127.0.0.1:4321';
const noncePattern = /^[a-f0-9-]{32,64}$/i;
const digestPattern = /^[a-f0-9]{64}$/;
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));
const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e7;
const routeOK = value => typeof value === 'string' && /^\/(?!\/)[^\s?#]*$/.test(value) && value.length <= 256;
const idsOK = value => Array.isArray(value) && value.length <= 80 && value.every(id => typeof id === 'string' && id.length <= 160);
const rectOK = value => keys(value,['x','y','width','height']) && ['x','y','width','height'].every(key=>finite(value[key])) && value.width >= 0 && value.height >= 0;
const pointOK = value => keys(value,['x','y']) && finite(value.x) && finite(value.y);
const headerOK = (ev,parent) => ev.origin === CONTROL_ORIGIN && ev.source === parent && ev.data?.schemaVersion === 1 && Number.isSafeInteger(ev.data.frameEpoch) && ev.data.frameEpoch > 0 && noncePattern.test(ev.data.sessionNonce);
export function isBridgeInit(ev,parent) { return headerOK(ev,parent) && ev.data.kind === 'init' && keys(ev.data,['schemaVersion','kind','frameEpoch','sessionNonce']); }
export function isRemeasureRequest(ev,parent,context) { return headerOK(ev,parent) && ev.data.kind === 'remeasure' && keys(ev.data,['schemaVersion','kind','frameEpoch','sessionNonce','requestId']) && ev.data.frameEpoch === context?.frameEpoch && ev.data.sessionNonce === context?.sessionNonce && noncePattern.test(ev.data.requestId); }
function spatialOK(s,selection,message) {
  if(!keys(s,['selectionId','raw','rects','normalized','nonInvertible','frames','frameEpoch','sourceRevisions','objectIds','runtimeSourceIds','mode','geometryFingerprint']) || s.selectionId!==selection.selectionId || s.frameEpoch!==message.frameEpoch || !digestPattern.test(s.geometryFingerprint) || !keys(s.sourceRevisions,['project']) || s.sourceRevisions.project!==message.docRevision || typeof s.nonInvertible!=='boolean' || !idsOK(s.objectIds) || !idsOK(s.runtimeSourceIds) || !['pick','box','lasso','empty'].includes(s.mode))return false;
  if(!keys(s.rects,['viewport','document','container','canvas']) || !['viewport','document','canvas'].every(key=>rectOK(s.rects[key])) || s.rects.container!==undefined&&!rectOK(s.rects.container))return false;
  if(s.normalized!==null&&!rectOK(s.normalized))return false;
  if(!keys(s.raw,['kind','rect','polygon']) || !(s.raw.kind==='rect'?rectOK(s.raw.rect):s.raw.kind==='polygon'&&Array.isArray(s.raw.polygon)&&s.raw.polygon.length>=3&&s.raw.polygon.length<=1024&&s.raw.polygon.every(pointOK)))return false;
  if(!Array.isArray(s.frames)||s.frames.length!==4)return false;
  const spaces=new Set();for(const frame of s.frames){if(!keys(frame,['space','matrix','denominator','scroll','frameZoom','dpr'])||!['viewport','document','container','canvas'].includes(frame.space)||spaces.has(frame.space)||!Array.isArray(frame.matrix)||frame.matrix.length!==6||!frame.matrix.every(finite)||!['content-box','canvas-px'].includes(frame.denominator)||!pointOK(frame.scroll)||!finite(frame.frameZoom)||frame.frameZoom<=0||!finite(frame.dpr)||frame.dpr<=0)return false;spaces.add(frame.space);}
  return ['x','y','width','height'].every(key=>s.rects.viewport[key]===selection.rect[key]);
}
function selectionOK(s,message) {
  if(!keys(s,['selectionId','rect','parentSourceId','frameEpoch','docRevision','layoutFacts','normalized','grid','neighbors','spatial','sampledAt'])||typeof s.selectionId!=='string'||!s.selectionId.length||s.selectionId.length>64||typeof s.parentSourceId!=='string'||s.parentSourceId.length>160||s.frameEpoch!==message.frameEpoch||s.docRevision!==message.docRevision||!rectOK(s.rect))return false;
  if(!keys(s.layoutFacts,['writingMode','ancestorRotate','animationInFlight','dense','overflowClip','fontsReady'])||typeof s.layoutFacts.writingMode!=='string'||s.layoutFacts.writingMode.length>32||['ancestorRotate','animationInFlight','dense','overflowClip'].some(key=>typeof s.layoutFacts[key]!=='boolean')||s.layoutFacts.fontsReady!==undefined&&typeof s.layoutFacts.fontsReady!=='boolean')return false;
  if(s.normalized!==undefined&&s.normalized!==null&&!rectOK(s.normalized))return false;
  if(s.grid&&(!keys(s.grid,['columns','rows','confidence','appendOnly','reasons'])||!finite(s.grid.confidence)||s.grid.confidence<0||s.grid.confidence>1||!['columns','rows'].every(key=>Array.isArray(s.grid[key])&&s.grid[key].length<=80&&s.grid[key].every(value=>Number.isSafeInteger(value)&&value>0))||s.grid.appendOnly!==undefined&&typeof s.grid.appendOnly!=='boolean'||s.grid.reasons!==undefined&&(!Array.isArray(s.grid.reasons)||s.grid.reasons.length>8||s.grid.reasons.some(reason=>typeof reason!=='string'||reason.length>240))))return false;
  if(s.neighbors&&(!keys(s.neighbors,['up','down','left','right'])||Object.values(s.neighbors).some(value=>value!==null&&(typeof value!=='string'||value.length>160))))return false;
  if(s.sampledAt!==undefined&&(!Number.isFinite(s.sampledAt)||s.sampledAt<0))return false;
  return s.spatial===undefined||spatialOK(s.spatial,s,message);
}
export function acceptBridgeMessage(ev,expect) {
  if(ev.origin!==expect.origin)return {reject:'ORIGIN'};
  if(ev.source!==expect.source)return {reject:'SOURCE'};
  const d=ev.data;
  if(!object(d)||d.schemaVersion!==1)return {reject:'SCHEMA'};
  if(!Number.isSafeInteger(d.frameEpoch)||d.frameEpoch!==expect.frameEpoch)return {reject:'EPOCH'};
  if(!noncePattern.test(d.sessionNonce)||d.sessionNonce!==expect.nonce)return {reject:'NONCE'};
  if(!digestPattern.test(d.docRevision))return {reject:'SHAPE'};
  if(expect.docRevision&&d.docRevision!==expect.docRevision)return {reject:'STALE_DOC'};
  const extra={hello:['pathname'],measure:['pathname','rects','hitIds','runtimeSourceIds','selection','capture','requestId'],route:['pathname','navigationType'],geometry:['geometryFingerprint','breakpointKey','fontsReady'],error:['code','detail','requestId']}[d.kind];
  if(!extra||!keys(d,['schemaVersion','kind','frameEpoch','sessionNonce','docRevision',...extra]))return {reject:'SHAPE'};
  if(!['error','geometry'].includes(d.kind)&&!routeOK(d.pathname))return {reject:'SHAPE'};
  if(d.requestId!==undefined&&!noncePattern.test(d.requestId))return {reject:'SHAPE'};
  if(d.kind==='measure'){
    if(!Array.isArray(d.rects)||d.rects.length>80||!d.rects.every(rectOK)||!idsOK(d.hitIds)||!idsOK(d.runtimeSourceIds)||d.selection!==undefined&&!selectionOK(d.selection,d))return {reject:'SHAPE'};
    if(d.capture!==undefined){try{return {...d,capture:sanitizeSnapshot(d.capture)};}catch{return {reject:'SHAPE'};}}
  }
  if(d.kind==='geometry'&&(!digestPattern.test(d.geometryFingerprint)||typeof d.breakpointKey!=='string'||d.breakpointKey.length>64||typeof d.fontsReady!=='boolean'))return {reject:'SHAPE'};
  if(d.kind==='route'&&d.navigationType!==undefined&&!['push','replace','traverse','load'].includes(d.navigationType))return {reject:'SHAPE'};
  if(d.kind==='error'&&(typeof d.code!=='string'||d.code.length>64||typeof d.detail!=='string'||d.detail.length>512))return {reject:'SHAPE'};
  return d;
}
