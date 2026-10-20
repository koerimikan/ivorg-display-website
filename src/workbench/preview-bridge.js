import { CONTROL_ORIGIN, isBridgeInit, isRemeasureRequest } from '../workbench-core/bridge.js';
import { measureSpatial } from '../workbench-core/spatial-measure.js';
import { captureContext } from '../dev-studio/context-capture.js';

// The preview never receives a write token. It measures its own DOM only.
const lifetime = new AbortController();
const routes = { '/': 'page.home', '/discography/': 'page.discography', '/newsletter/': 'page.newsletter' };
let context = null, revision = null, selectedParent = null, selectionId = null, raw = null, localRaw = null;
let spatialMode = false, lassoMode = false, drag = null, points = [], busy = false, reloadScheduled = false, lastFingerprint = null;
const overlay = document.createElementNS('http://www.w3.org/2000/svg','svg');
overlay.setAttribute('aria-hidden','true');
Object.assign(overlay.style,{position:'fixed',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'2147483646',overflow:'visible'});
const outline=document.createElementNS('http://www.w3.org/2000/svg','path');
outline.setAttribute('fill','#EAE6DF0D');outline.setAttribute('stroke','#E62E00');outline.setAttribute('stroke-width','1');outline.setAttribute('stroke-dasharray','5 4');overlay.append(outline);
const modeBadge=document.createElement('div');modeBadge.textContent='SPATIAL SELECTION / 拖拽空白区域 · Alt+S 退出';
Object.assign(modeBadge.style,{position:'fixed',left:'16px',bottom:'16px',padding:'8px 12px',background:'#050507',color:'#EAE6DF',font:'12px monospace',pointerEvents:'none',zIndex:'2147483647',display:'none'});
document.body.append(overlay,modeBadge);
function drawSelection(shape){
 if(!shape){outline.setAttribute('d','');return;}
 const vertices=shape.kind==='polygon'?shape.polygon:[{x:shape.rect.x,y:shape.rect.y},{x:shape.rect.x+shape.rect.width,y:shape.rect.y},{x:shape.rect.x+shape.rect.width,y:shape.rect.y+shape.rect.height},{x:shape.rect.x,y:shape.rect.y+shape.rect.height}];
 outline.setAttribute('d',vertices.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' ')+' Z');
}
const asRect = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
function send(kind, extra = {}) {
  if (!context || !revision) return;
  window.parent.postMessage({ schemaVersion: 1, kind, frameEpoch: context.frameEpoch, sessionNonce: context.sessionNonce, docRevision: revision, ...extra }, CONTROL_ORIGIN);
}
async function invalidate(code) {
  send('error', { code, detail: 'Preview DOM revision is stale; reload or reselect before modifying.' });
  context = null; selectedParent = null; raw = null;
  if (reloadScheduled) return;
  reloadScheduled = true;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { const state = await fetch('/__companion/preview-state', { cache: 'no-store' }).then(response => response.json()); if (!state.transactionPending) { location.reload(); return; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}
function currentRaw() {
  if (!selectedParent?.isConnected || !localRaw) return null;
  const r = asRect(selectedParent);
  const point = p => ({ x: r.x + p.x * r.width, y: r.y + p.y * r.height });
  if (localRaw.kind === 'polygon') return { kind: 'polygon', polygon: localRaw.polygon.map(point) };
  const start = point(localRaw.rect);
  return { kind: 'rect', rect: { ...start, width: localRaw.rect.width * r.width, height: localRaw.rect.height * r.height } };
}
async function sample(kind = 'measure', requestId) {
  if (!context || busy && !requestId && kind === 'measure') return;
  const active = context;
  busy = true;
  try {
    if (requestId && document.fonts) await document.fonts.ready;
    if (requestId) await new Promise(resolve => requestAnimationFrame(resolve));
    const response = await fetch('/__companion/preview-state', { cache: 'no-store', signal: lifetime.signal });
    if (!response.ok || context !== active) return;
    const state = await response.json();
    const renderedRevision = document.querySelector('meta[name="cw-preview-revision"]')?.content;
    revision = /^[a-f0-9]{64}$/.test(renderedRevision || '') ? renderedRevision : state.docRevision;
    if (!renderedRevision || renderedRevision !== state.docRevision) { await invalidate(renderedRevision ? 'STALE_DOM' : 'PREVIEW_REVISION_MISSING'); return; }
    if (state.transactionPending && requestId) { send('error', { code: 'RECOVERY_REQUIRED', detail: 'Source transaction is pending or requires recovery.', requestId }); return; }
    let selection, capture;
    raw = currentRaw();
    if (raw && selectedParent?.isConnected) {
      const measured = await measureSpatial(selectedParent, raw, {
        selectionId, frameEpoch: active.frameEpoch, docRevision: state.docRevision,
        scroll: { x: scrollX, y: scrollY }, frameZoom: visualViewport ? innerWidth / visualViewport.width : 1,
        dpr: devicePixelRatio, fontsReady: !document.fonts || document.fonts.status === 'loaded'
      });
      if (context !== active) return;
      selection = { selectionId, ...measured, parentSourceId: selectedParent.getAttribute('data-ds-id'), frameEpoch: active.frameEpoch, docRevision: state.docRevision, sampledAt: Date.now() };
      capture = captureContext([selectedParent]);
      if (lastFingerprint !== measured.spatial.geometryFingerprint) {
        lastFingerprint = measured.spatial.geometryFingerprint;
        send('geometry', { geometryFingerprint: lastFingerprint, breakpointKey: `${innerWidth}x${innerHeight}`, fontsReady: measured.layoutFacts.fontsReady });
      }
    } else { selectedParent = null; raw = null; }
    if (kind === 'hello' || kind === 'route') send(kind, { pathname: location.pathname, ...(kind === 'route' ? { navigationType: 'load' } : {}) });
    const nodes = [...document.querySelectorAll('main,[data-grid]')].filter(node => node.getBoundingClientRect().width > 0).slice(0, 80);
    send('measure', { pathname: location.pathname, rects: nodes.map(asRect), hitIds: [routes[location.pathname]].filter(Boolean), runtimeSourceIds: [...new Set(nodes.map(node => node.getAttribute('data-ds-id')).filter(Boolean))], ...(selection ? { selection, capture } : {}), ...(requestId ? { requestId } : {}) });
  } catch (error) {
    if (context === active && requestId) send('error', { code: 'MEASUREMENT_FAILED', detail: String(error.message).slice(0, 512), requestId });
  } finally { busy = false; }
}
window.addEventListener('keydown', event => {
  if (event.altKey && ['KeyS', 'KeyL'].includes(event.code)) {
    event.preventDefault(); spatialMode = !spatialMode || lassoMode !== (event.code === 'KeyL'); lassoMode = event.code === 'KeyL';
    document.documentElement.style.cursor = spatialMode ? 'crosshair' : '';
    modeBadge.style.display=spatialMode?'block':'none';modeBadge.textContent=lassoMode?'LASSO / 套索选区 · Alt+L 退出':'SPATIAL / 拖拽选区 · Alt+S 退出';
    if(!spatialMode){drag=null;drawSelection(null);}
  }
}, { signal: lifetime.signal });
document.addEventListener('pointerdown', event => {
  if (!spatialMode || event.button !== 0) return;
  event.preventDefault(); event.stopImmediatePropagation(); drag = { x: event.clientX, y: event.clientY }; points = [drag];
}, { capture: true, signal: lifetime.signal });
document.addEventListener('pointermove', event => {
 if(!spatialMode||!drag)return;
 if(lassoMode&&points.length<512)points.push({x:event.clientX,y:event.clientY});
 const x=Math.min(drag.x,event.clientX),y=Math.min(drag.y,event.clientY);
 drawSelection(lassoMode?{kind:'polygon',polygon:[...points,{x:event.clientX,y:event.clientY}]}:{kind:'rect',rect:{x,y,width:Math.abs(event.clientX-drag.x),height:Math.abs(event.clientY-drag.y)}});
}, { capture: true, signal: lifetime.signal });
document.addEventListener('click', event => { if (spatialMode) { event.preventDefault(); event.stopImmediatePropagation(); } }, { capture: true, signal: lifetime.signal });
document.addEventListener('pointerup', event => {
  if (!spatialMode || !drag) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const end = { x: event.clientX, y: event.clientY }, all = lassoMode ? [...points, end] : [drag, end];
  const x = Math.min(...all.map(p => p.x)), y = Math.min(...all.map(p => p.y)), width = Math.max(...all.map(p => p.x)) - x, height = Math.max(...all.map(p => p.y)) - y;
  raw = lassoMode && all.length >= 3 ? { kind: 'polygon', polygon: all } : { kind: 'rect', rect: { x, y, width, height } };
  drag = null;
  selectedParent = [...document.querySelectorAll('[data-ds-id]')].filter(node => {
    const r = asRect(node); return r.width > 0 && r.height > 0 && r.x <= x && r.y <= y && r.x + r.width >= x + width && r.y + r.height >= y + height && !['SCRIPT','STYLE','A','BUTTON','IMG','INPUT','HTML','HEAD','BODY','SLOT'].includes(node.tagName);
  }).sort((a,b) => { const ar = asRect(a), br = asRect(b); return ar.width * ar.height - br.width * br.height; })[0];
  if (!selectedParent) { raw = null; localRaw = null; drawSelection(null);modeBadge.textContent='这里没有可安全插入的容器，请重新选择';return; }
  drawSelection(raw);modeBadge.textContent='选区已捕获 / 在伴生 Agent 中描述目标 · Alt+S 退出';
  selectionId = crypto.randomUUID();
  const r = asRect(selectedParent), point = p => ({ x: (p.x - r.x) / r.width, y: (p.y - r.y) / r.height });
  localRaw = raw.kind === 'polygon' ? { kind: 'polygon', polygon: raw.polygon.map(point) } : { kind: 'rect', rect: { ...point(raw.rect), width: raw.rect.width / r.width, height: raw.rect.height / r.height } };
  void sample();
}, { capture: true, signal: lifetime.signal });
window.addEventListener('message', event => {
  if (isBridgeInit(event, window.parent)) { context = { frameEpoch: event.data.frameEpoch, sessionNonce: event.data.sessionNonce }; revision = null; void sample('hello'); }
  else if (isRemeasureRequest(event, window.parent, context)) void sample('measure', event.data.requestId);
}, { signal: lifetime.signal });
document.addEventListener('astro:page-load', () => { if(!overlay.isConnected)document.body.append(overlay,modeBadge);selectedParent = null; raw = null; drawSelection(null);void sample('route'); }, { signal: lifetime.signal });
let resizeTimer;
const remeasureTimer = setInterval(() => { if (raw) void sample(); }, 500);
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => void sample(), 100); }, { signal: lifetime.signal });
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => { void invalidate('STALE_DOM'); });
  import.meta.hot.dispose(() => { clearTimeout(resizeTimer); clearInterval(remeasureTimer); lifetime.abort(); context = null; overlay.remove();modeBadge.remove(); });
}
