import { CONTROL_ORIGIN, isBridgeInit } from '../workbench-core/bridge.js';
import {spatialSelection,inferGrid,gridPlacement,directionalNeighbors} from '../workbench-core/geometry.js';

// Executed inside the preview; the parent receives data only, never a DOM handle.
const lifetime = new AbortController(); let context = null, revision = null, reading = 0;
const routes = { '/': 'page.home', '/discography/': 'page.discography', '/newsletter/': 'page.newsletter' };
let spatialMode=false,drag=null,selection=null,selectedParent=null,localSelection=null;
window.addEventListener('keydown',e=>{if(e.altKey&&e.code==='KeyS'){spatialMode=!spatialMode;document.documentElement.style.cursor=spatialMode?'crosshair':'';}},{signal:lifetime.signal});
document.addEventListener('pointerdown',e=>{if(!spatialMode)return;e.preventDefault();e.stopImmediatePropagation();drag={x:e.clientX,y:e.clientY};},{capture:true,signal:lifetime.signal});
document.addEventListener('click',e=>{if(spatialMode){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,signal:lifetime.signal});
document.addEventListener('pointerup',e=>{if(!spatialMode||!drag)return;e.preventDefault();e.stopImmediatePropagation();const x=Math.min(drag.x,e.clientX),y=Math.min(drag.y,e.clientY),width=Math.abs(e.clientX-drag.x),height=Math.abs(e.clientY-drag.y);drag=null;
  const candidates=[...document.querySelectorAll('[data-ds-id]')].filter(n=>{const r=n.getBoundingClientRect();return r.x<=x&&r.y<=y&&r.right>=x+width&&r.bottom>=y+height&&!['SCRIPT','STYLE','A','BUTTON','IMG','INPUT'].includes(n.tagName);}).sort((a,b)=>{const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();return ar.width*ar.height-br.width*br.height;});selectedParent=candidates[0];if(!selectedParent)return;
  const style=getComputedStyle(selectedParent),transforms=[];for(let n=selectedParent;n;n=n.parentElement)transforms.push(getComputedStyle(n).transform);
  const parentRect=selectedParent.getBoundingClientRect();localSelection={x:(x-parentRect.x)/parentRect.width,y:(y-parentRect.y)/parentRect.height,width:width/parentRect.width,height:height/parentRect.height};
  selection={selectionId:crypto.randomUUID(),rect:{x,y,width,height},parentSourceId:selectedParent.getAttribute('data-ds-id'),layoutFacts:{writingMode:style.writingMode,ancestorRotate:transforms.some(t=>t!=='none'&&!/^matrix\([^,]+, 0, 0, [^,]+, [^,]+, [^)]+\)$/.test(t)),animationInFlight:document.getAnimations().some(a=>a.playState==='running'),dense:style.gridAutoFlow.includes('dense'),overflowClip:['hidden','clip'].includes(style.overflow)}};void sample();
},{capture:true,signal:lifetime.signal});
function send(kind, extra) {
  if (!context || !revision) return;
  window.parent.postMessage({ schemaVersion: 1, kind, frameEpoch: context.frameEpoch, sessionNonce: context.sessionNonce, docRevision: revision, ...extra }, CONTROL_ORIGIN);
}
async function sample(kind = 'measure') {
  if (!context) return;
  const epoch = context.frameEpoch, nonce = context.sessionNonce, sequence = ++reading;
  try {
    const response = await fetch('/__companion/preview-state', { cache: 'no-store', signal: lifetime.signal });
    if (!response.ok) return;
    const data = await response.json();
    if (sequence !== reading || context?.frameEpoch !== epoch || context?.sessionNonce !== nonce) return;
    revision = data.docRevision;
    if(selection&&selectedParent?.isConnected){const r=selectedParent.getBoundingClientRect(),style=getComputedStyle(selectedParent);selection.rect={x:r.x+localSelection.x*r.width,y:r.y+localSelection.y*r.height,width:localSelection.width*r.width,height:localSelection.height*r.height};
      const insetX=parseFloat(style.borderLeftWidth)+parseFloat(style.paddingLeft),insetY=parseFloat(style.borderTopWidth)+parseFloat(style.paddingTop),contentBox={x:r.x+insetX,y:r.y+insetY,width:r.width-insetX-parseFloat(style.borderRightWidth)-parseFloat(style.paddingRight),height:r.height-insetY-parseFloat(style.borderBottomWidth)-parseFloat(style.paddingBottom)};
      const spatial=spatialSelection({selectionId:selection.selectionId,raw:{kind:'rect',rect:selection.rect},contentBox,frameEpoch:epoch});selection.normalized=spatial.normalized;
      const grid=inferGrid({columns:style.gridTemplateColumns,rows:style.gridTemplateRows,columnGap:parseFloat(style.columnGap)||0,rowGap:parseFloat(style.rowGap)||0,writingMode:style.writingMode,dense:selection.layoutFacts.dense});const placement=gridPlacement({x:selection.rect.x-contentBox.x,y:selection.rect.y-contentBox.y,width:selection.rect.width,height:selection.rect.height},grid);selection.grid={columns:placement.columns||[],rows:placement.rows||[],confidence:grid.confidence};
      selection.neighbors=directionalNeighbors(selection.rect,[...selectedParent.children].slice(0,80).map(n=>{const q=n.getBoundingClientRect();return {sourceId:n.getAttribute('data-ds-id'),parentId:'same',zoneId:'same',rect:{x:q.x,y:q.y,width:q.width,height:q.height}};}).filter(n=>n.sourceId),{parentId:'same',zoneId:'same'});
    }else{selection=null;}
    if (kind === 'hello' || kind === 'route') send(kind, { pathname: location.pathname });
    const nodes = [...document.querySelectorAll('main,[data-grid]')].filter(n => n.getBoundingClientRect().width > 0).slice(0, 80);
    send('measure', { pathname: location.pathname, rects: nodes.map(node => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; }),
      hitIds: [routes[location.pathname]].filter(Boolean), runtimeSourceIds: [...new Set(nodes.map(n => n.getAttribute('data-ds-id')).filter(Boolean))],...(selection?{selection:{...selection,frameEpoch:epoch,docRevision:revision}}:{}) });
  } catch { /* disconnected preview is reflected by the control-plane handshake timeout */ }
}
window.addEventListener('message', ev => {
  if (!isBridgeInit(ev, window.parent)) return;
  context = { frameEpoch: ev.data.frameEpoch, sessionNonce: ev.data.sessionNonce }; revision = null;
  void sample('hello');
}, { signal: lifetime.signal });
document.addEventListener('astro:page-load', () => { void sample('route'); }, { signal: lifetime.signal });
let resizeTimer;
const remeasureTimer=setInterval(()=>{if(selection)void sample();},500);
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { void sample(); }, 100); }, { signal: lifetime.signal });
if (import.meta.hot) {
  import.meta.hot.on('vite:afterUpdate', () => { void sample('route'); });
  import.meta.hot.dispose(() => { clearTimeout(resizeTimer); clearInterval(remeasureTimer); lifetime.abort(); context = null; });
}
