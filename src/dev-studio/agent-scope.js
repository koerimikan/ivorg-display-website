import { normalizeRect, selectSemanticRoots, captureContext } from './context-capture.js';
import { collectMotionContext } from './motion-context.js';
import { stopLiveEntrance, stopLiveWipe } from '../scripts/motion.js';

const UI_ATTR = 'data-dev-studio-ui';
const SCOPE_MODE = 'scope';
const ACCENT = '#E5FF00';
const MONO = "'JetBrains Mono', Consolas, monospace";
const MIN_DRAG = 16;
const MAX_BOXES = 8;
const DEBOUNCE = 300;

const PANEL_CSS = `
  *{box-sizing:border-box}
  .wrap{background:#090A0C;color:#E8E8E8;border:1px solid rgba(255,255,255,.12);font:11px/1.45 ${MONO};
    max-height:70vh;overflow:auto;padding:10px 10px 12px;letter-spacing:.02em;-webkit-font-smoothing:antialiased}
  .head{display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;
    border-bottom:1px solid rgba(255,255,255,.12);margin-bottom:8px}
  .title{font-size:11px;letter-spacing:.14em;color:${ACCENT}}
  .tag{font-size:9px;letter-spacing:.14em;color:#8A8F98;border:1px solid rgba(255,255,255,.12);padding:1px 5px}
  .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 10px;margin-bottom:6px}
  .cell{display:flex;justify-content:space-between;gap:6px;border-bottom:1px dotted rgba(255,255,255,.1);padding:2px 0}
  .k{color:#7C828C;font-size:9px;letter-spacing:.12em;text-transform:uppercase}
  .v{color:${ACCENT};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .label{font-size:9px;letter-spacing:.14em;color:#7C828C;margin:8px 0 4px;text-transform:uppercase}
  ul.files{list-style:none;margin:0;padding:0;max-height:92px;overflow:auto;border:1px solid rgba(255,255,255,.08)}
  ul.files li{font-size:10px;color:#B9BDC4;padding:2px 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    border-bottom:1px solid rgba(255,255,255,.05)}
  ul.files li.empty{color:#5C6169}
  textarea{width:100%;min-height:62px;resize:vertical;background:#0B0D10;color:#E8E8E8;
    border:1px solid rgba(255,255,255,.12);font:11px/1.4 ${MONO};padding:6px;outline:none}
  textarea:focus{border-color:${ACCENT}}
  .actions{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px}
  button{background:#101216;color:#E8E8E8;border:1px solid rgba(255,255,255,.16);font:10px/1 ${MONO};
    letter-spacing:.1em;padding:7px 4px;cursor:pointer;text-transform:uppercase}
  button:hover:not(:disabled){border-color:${ACCENT};color:${ACCENT}}
  button:disabled{opacity:.35;cursor:not-allowed}
  button.primary{grid-column:1 / -1;border-color:${ACCENT};color:${ACCENT};background:rgba(229,255,0,.06)}
  .status{margin-top:8px;font-size:9px;letter-spacing:.12em;color:#8A8F98;
    border-top:1px solid rgba(255,255,255,.12);padding-top:6px;word-break:break-word}
`;

export function mountAgentScope(controller) {
  const API='/__dev_studio_api';
  const getMode = () => controller.getState().mode;

  const subscribe = (cb) => {
    if (typeof controller?.subscribe === 'function') {
      const off = controller.subscribe(cb);
      return typeof off === 'function' ? off : () => {};
    }
    if (typeof controller?.addEventListener === 'function') {
      const h = (e) => cb(e?.detail ?? e);
      controller.addEventListener('modechange', h);
      return () => controller.removeEventListener('modechange', h);
    }
    return () => {};
  };

  const isUiEvent = (e) => {
    const path = typeof e?.composedPath === 'function' ? e.composedPath() : [];
    for (const node of path) {
      if (!node || node.nodeType !== 1) continue;
      if (node.hasAttribute?.(UI_ATTR)) return true;
      const tag = (node.tagName || '').toLowerCase();
      if (tag === 'dev-studio-hud') return true;
    }
    return false;
  };

  const isUiNode = (el) =>
    !el || el.nodeType !== 1 || el.hasAttribute?.(UI_ATTR) || !!el.closest?.(`[${UI_ATTR}]`);

  // ---- HUD entry button ----------------------------------------------------
  const hud = document.querySelector('dev-studio-hud');
  const hudRoot = hud?.shadowRoot || null;
  let hudButton = null;
  if (hudRoot) {
    const panel = hudRoot.querySelector('[aria-label="HUD mode"]') || hudRoot;
    hudButton = document.createElement('button');
    hudButton.type = 'button';
    hudButton.textContent = '04 // AGENT SCOPE';
    hudButton.setAttribute(UI_ATTR, '');
    hudButton.style.cssText =
      `font:10px/1 ${MONO};letter-spacing:.1em;background:transparent;color:#E8E8E8;` +
      'border:1px solid rgba(255,255,255,.16);padding:6px 8px;margin:2px 0;cursor:pointer;';
    hudButton.addEventListener('click', () => {
      if (typeof controller?.setMode === 'function') controller.setMode(SCOPE_MODE);
      else if (typeof controller?.set === 'function') controller.set(SCOPE_MODE);
    });
    panel.appendChild(hudButton);
  }

  // ---- panel ---------------------------------------------------------------
  const panelHost = document.createElement('div');
  panelHost.setAttribute(UI_ATTR, '');
  panelHost.setAttribute('popover','manual');
  panelHost.style.cssText =
    'position:fixed;right:14px;top:90px;width:min(360px,calc(100vw - 28px));max-height:70vh;' +
    'z-index:2147483000;display:none;margin:0;padding:0;border:0;background:transparent;inset:90px 14px auto auto;';
  const panelRoot = panelHost.attachShadow({ mode: 'open' });
  panelRoot.innerHTML = `<style>${PANEL_CSS}</style>
<div class="wrap">
  <div class="head"><span class="title">AGENT SCOPE</span><span class="tag">SCOPE</span></div>
  <div class="grid">
    <div class="cell"><span class="k">roots</span><span class="v" data-k="roots">0</span></div>
    <div class="cell"><span class="k">nodes</span><span class="v" data-k="nodes">0</span></div>
    <div class="cell"><span class="k">motion</span><span class="v" data-k="motion">0</span></div>
    <div class="cell"><span class="k">tokens</span><span class="v" data-k="tokens">—</span></div>
    <div class="cell"><span class="k">budget</span><span class="v" data-k="budget">—</span></div>
    <div class="cell"><span class="k">context</span><span class="v" data-k="ctx">—</span></div>
  </div>
  <div class="label">source files</div>
  <ul class="files" data-k="files"><li class="empty">— empty scope —</li></ul>
  <div class="label">intent</div>
  <textarea data-k="intent" rows="4" spellcheck="false" placeholder="Describe the intended change…"></textarea>
  <div class="actions">
    <button class="primary" data-act="export" disabled>EXPORT TASK</button>
    <button data-act="copy-json">COPY JSON</button>
    <button data-act="copy-md">COPY MARKDOWN</button>
    <button data-act="dl-json" disabled>DOWNLOAD JSON</button>
    <button data-act="dl-md" disabled>DOWNLOAD MD</button>
  </div>
  <div class="status" data-k="status">IDLE</div>
</div>`;
  document.body.appendChild(panelHost);

  const qk = (k) => panelRoot.querySelector(`[data-k="${k}"]`);
  const act = (a) => panelRoot.querySelector(`[data-act="${a}"]`);
  const refs = {
    roots: qk('roots'), nodes: qk('nodes'), motion: qk('motion'), tokens: qk('tokens'),
    budget: qk('budget'), ctx: qk('ctx'), files: qk('files'), intent: qk('intent'), status: qk('status'),
  };

  // ---- overlay -------------------------------------------------------------
  const overlayHost = document.createElement('div');
  overlayHost.setAttribute(UI_ATTR, '');
  overlayHost.setAttribute('popover','manual');
  overlayHost.style.cssText =
    'position:fixed;left:0;top:0;right:0;bottom:0;margin:0;border:0;pointer-events:none;' +
    'z-index:2147482999;display:none;padding:0;width:100vw;height:100vh;background:transparent;';
  const overlayRoot = overlayHost.attachShadow({ mode: 'open' });
  overlayRoot.innerHTML = `<style>
  .layer{position:fixed;left:0;top:0;right:0;bottom:0;margin:0;border:0;padding:0;
    background:transparent;pointer-events:none}
  .drag{position:fixed;display:none;box-sizing:border-box;border:1px dashed ${ACCENT};
    background:rgba(229,255,0,.06)}
  .root{position:fixed;box-sizing:border-box;border:1px solid ${ACCENT};
    background:rgba(229,255,0,.05);pointer-events:none}
</style><div class="layer"><div class="drag" data-o="drag"></div><div data-o="boxes"></div></div>`;
  document.body.appendChild(overlayHost);
  const dragEl = overlayRoot.querySelector('[data-o="drag"]');
  const boxesEl = overlayRoot.querySelector('[data-o="boxes"]');

  // ---- state ---------------------------------------------------------------
  let mode = getMode();
  let packet = null;
  let proposal = null;
  let latestExport = null;
  let lastCapture = null;
  let lastMotion = [];
  let currentRoots = [];
  let busy = false;
  let dragging = null;
  let selectionAbort = null;
  let proposalAbort = null;
  let seq = 0;
  let propSeq = 0;
  let debounceTimer = 0;
  let sessionToken = null;
  const lifetime = new AbortController();
  const timers = new Set();
  const objectUrls=new Set();

  const setStatus = (t) => { refs.status.textContent = t || 'IDLE'; };

  function updateButtons() {
    const intent = refs.intent.value.trim();
    act('export').disabled = !packet || !intent || busy;
    act('copy-json').disabled = !packet || !intent || busy;
    act('copy-md').disabled = !packet || !intent || busy;
    act('dl-json').disabled = !latestExport;
    act('dl-md').disabled = !latestExport;
  }

  // ---- transport -----------------------------------------------------------
  async function session(signal) {
    if (sessionToken) return sessionToken;
    const res = await fetch(API+'/session', {
      method: 'POST', credentials: 'same-origin', signal,
      headers: { 'content-type': 'application/json' }, body: '{}',
    });
    if (!res.ok) throw new Error('session ' + res.status);
    const data = await res.json().catch(() => ({}));
    sessionToken = data.token || data.session || data.sessionToken || data.access_token || '';
    return sessionToken;
  }

  async function send(path, payload, opts = {}) {
    const sig = opts.signal || lifetime.signal;
    const body = JSON.stringify(payload || {});
    const call = async () => {
      const token = await session(sig);
      const headers = { 'content-type': 'application/json' };
      if (token) headers['x-dev-studio-token'] = token;
      return fetch(API+path, { method: 'POST', headers, body, credentials: 'same-origin', signal: sig });
    };
    let res = await call();
    if (res.status === 401 && opts.retry) {
      sessionToken = null;
      res = await call();
    }
    if (!res.ok) {const detail=await res.json().catch(()=>({}));throw new Error(path+' '+res.status+' '+(detail.error||''));}
    return res.json();
  }

  // ---- rendering -----------------------------------------------------------
  const num = (v) => (typeof v === 'number' && isFinite(v) ? String(v) : null);

  function listFiles(scope) {
    if (!scope) return [];
    if(scope.editable||scope.readOnly)return [...new Set([...(scope.editable||[]),...(scope.readOnly||[])])];
    let src = scope;
    if (!Array.isArray(src) && typeof src === 'object') {
      src = src.files || src.paths || src.sources || src.sourcePaths || src.filesByPath || null;
    }
    if (Array.isArray(src)) {
      return src.map((f) => (typeof f === 'string' ? f : (f?.path || f?.file || f?.source || ''))).filter(Boolean);
    }
    if (src && typeof src === 'object') return Object.keys(src);
    return [];
  }

  function renderBudget(budget) {
    if (budget == null) return;
    if (typeof budget === 'number' || typeof budget === 'string') {
      refs.budget.textContent = String(budget);
      return;
    }
    const tok = budget.tokens ?? budget.estimatedTokens ?? budget.used ?? null;
    if (tok != null) refs.tokens.textContent = String(tok);
    const lim = budget.limit ?? budget.max ?? null;
    if (lim != null) refs.budget.textContent = String(lim);
  }

  function renderPacket() {
    const sel = packet?.selection || {};
    const rootsCount = currentRoots.length;
    const nodeCount =
      lastCapture?.domSummary?.nodeCount ?? lastCapture?.nodes?.length ?? lastCapture?.nodeIds?.length ??
      lastCapture?.nodeCount ?? (Array.isArray(lastCapture) ? lastCapture.length : rootsCount);
    const motionCount = Array.isArray(lastMotion) ? lastMotion.length
      : (Array.isArray(packet?.motion) ? packet.motion.length : 0);
    refs.roots.textContent = num(rootsCount) ?? '0';
    refs.nodes.textContent = num(nodeCount) ?? '0';
    refs.motion.textContent = num(motionCount) ?? '0';
    refs.ctx.textContent = packet?.contextId ? String(packet.contextId).slice(0, 10) : '—';
    renderBudget(packet?.budget);
    const files = listFiles(packet?.scope);
    refs.files.textContent = '';
    if (!files.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '— empty scope —';
      refs.files.appendChild(li);
    } else {
      files.slice(0, 60).forEach((f) => {
        const li = document.createElement('li');
        li.textContent = f;
        li.title = f;
        refs.files.appendChild(li);
      });
    }
    updateButtons();
  }

  function drawBoxes(roots) {
    boxesEl.textContent = '';
    roots.slice(0, MAX_BOXES).forEach((el) => {
      if (!el || typeof el.getBoundingClientRect !== 'function') return;
      const b = el.getBoundingClientRect();
      const box = document.createElement('div');
      box.className = 'root';
      box.style.left = b.left + 'px';
      box.style.top = b.top + 'px';
      box.style.width = Math.max(0, b.width) + 'px';
      box.style.height = Math.max(0, b.height) + 'px';
      boxesEl.appendChild(box);
    });
  }

  const clearBoxes = () => { boxesEl.textContent = ''; };
  function paintDrag() {
    if (!dragging) return;
    const x = Math.min(dragging.x0, dragging.x1);
    const y = Math.min(dragging.y0, dragging.y1);
    dragEl.style.display = 'block';
    dragEl.style.left = x + 'px';
    dragEl.style.top = y + 'px';
    dragEl.style.width = Math.abs(dragging.x1 - dragging.x0) + 'px';
    dragEl.style.height = Math.abs(dragging.y1 - dragging.y0) + 'px';
  }
  const hideDrag = () => { dragEl.style.display = 'none'; };

  function makeRect(d) {
    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    const width = Math.abs(d.x1 - d.x0);
    const height = Math.abs(d.y1 - d.y0);
    let rect = { x, y, left: x, top: y, width, height, right: x + width, bottom: y + height };
    try {
      const n = normalizeRect(rect);
      if (n && isFinite(n.width) && isFinite(n.height)) rect = { ...rect, ...n };
    } catch { /* keep raw rect */ }
    return rect;
  }

  // ---- context submission --------------------------------------------------
  async function commit(roots) {
    if (!Array.isArray(roots) || !roots.length) { setStatus('EMPTY SELECTION'); return; }
    if (selectionAbort) selectionAbort.abort();
    const ac = new AbortController();
    selectionAbort = ac;
    const my = ++seq;
    proposalAbort?.abort();propSeq++;proposal=null;latestExport=null;packet=null;
    busy = true;
    updateButtons();
    setStatus('CAPTURING…');
    drawBoxes(roots);
    try {
      const captured = await captureContext(roots);
      if (ac.signal.aborted || my !== seq) return;
      const motion = (await collectMotionContext(roots)) || [];
      if (ac.signal.aborted || my !== seq) return;
      const res = await send('/context', {
        snapshot: captured,
        motionIds: (Array.isArray(motion) ? motion : []).map((x) => (x && x.id != null ? x.id : x)),
        selection: {
          sourceIds: (captured && captured.sourceIds) || [],
          route: location.pathname,
          viewport: { width: innerWidth, height: innerHeight },
        },
      }, { signal: ac.signal, retry: true });
      if (ac.signal.aborted || my !== seq) return;
      packet = res;
      proposal = null;
      latestExport = null;
      lastCapture = captured;
      lastMotion = motion;
      currentRoots = roots;
      renderPacket();
      setStatus('CONTEXT ' + (packet?.contextId ? String(packet.contextId).slice(0, 12) : 'READY'));
    } catch (err) {
      if (err && (err.name === 'AbortError' || ac.signal.aborted)) return;
      if (my === seq) setStatus('ERROR · ' + (err?.message || 'CONTEXT'));
    } finally {
      if (my === seq) { busy = false; updateButtons(); }
    }
  }

  // ---- pointer capture -----------------------------------------------------
  function onPointerDown(e) {
    if (mode !== SCOPE_MODE || e.button !== 0) return;
    if (isUiEvent(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    cancelReads();packet=null;proposal=null;latestExport=null;currentRoots=[];lastCapture=null;lastMotion=[];renderPacket();
    dragging = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
    paintDrag();
    setStatus('DRAGGING');
  }

  function onPointerMove(e) {
    if (!dragging) return;
    e.preventDefault?.();
    e.stopImmediatePropagation?.();
    dragging.x1 = e.clientX;
    dragging.y1 = e.clientY;
    paintDrag();
  }

  function onPointerUp(e) {
    if (!dragging) return;
    const d = dragging;
    d.x1=e.clientX;d.y1=e.clientY;
    dragging = null;
    hideDrag();
    e.stopImmediatePropagation?.();
    if (mode !== SCOPE_MODE) return;
    const rect = makeRect(d);
    if (rect.width < MIN_DRAG || rect.height < MIN_DRAG) { setStatus('DRAG TOO SMALL'); return; }
    const pool = [];
    for (const el of document.body.querySelectorAll('*')) if (!isUiNode(el)) pool.push(el);
    let roots = [];
    try { roots = selectSemanticRoots(pool, rect) || []; } catch { roots = []; }
    if (!roots.length) { currentRoots = []; clearBoxes(); setStatus('EMPTY SELECTION'); return; }
    commit(roots);
  }

  // ---- keyboard ------------------------------------------------------------
  function bigAncestor(el) {
    if (!el) return true;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'body' || tag === 'html') return true;
    const b = el.getBoundingClientRect();
    return b.width * b.height > innerWidth * innerHeight * 0.85;
  }

  function expandRoots() {
    const out = [];
    for (const el of currentRoots) {
      const p = el?.parentElement;
      if (p && !bigAncestor(p) && !isUiNode(p) && !out.includes(p)) out.push(p);
    }
    return out;
  }

  function shrinkRoots() {
    const out = [];
    for (const el of currentRoots) {
      if (!el || !el.children) continue;
      let pick = null;
      for (const child of el.children) {
        if (isUiNode(child)) continue;
        const b = child.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) { pick = child; break; }
      }
      if (pick && !out.includes(pick)) out.push(pick);
    }
    return out;
  }

  function onKeyDown(e) {
    if (mode !== SCOPE_MODE) return;
    if (e.key === 'Escape') {
      if (dragging) { dragging = null; hideDrag(); setStatus('CANCELLED'); e.preventDefault(); }
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const t = typeof e.composedPath === 'function' ? e.composedPath()[0] : e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
    e.preventDefault();
    if (!currentRoots.length) { setStatus('EMPTY SELECTION'); return; }
    const next = e.key === 'ArrowUp' ? expandRoots() : shrinkRoots();
    if (!next.length) { setStatus('EMPTY SELECTION'); return; }
    commit(next);
  }

  // ---- proposal / export ---------------------------------------------------
  async function requestProposal() {
    const intent = refs.intent.value.trim();
    if (!packet || !intent) return;
    if (proposalAbort) proposalAbort.abort();
    const ac = new AbortController();
    proposalAbort = ac;
    const my = ++propSeq;
    const contextId=packet.contextId;
    setStatus('PROPOSING…');
    try {
      const res = await send('/proposal', { contextId: packet.contextId, intent }, { signal: ac.signal, retry: true });
      if (ac.signal.aborted || my !== propSeq || packet?.contextId!==contextId || refs.intent.value.trim()!==intent) return;
      proposal = res;
      renderBudget(res?.budget || packet?.budget);
      setStatus('PROPOSAL READY');
    } catch (err) {
      if (err && (err.name === 'AbortError' || ac.signal.aborted)) return;
      if (my === propSeq) setStatus('PROPOSAL FAILED · '+err.message);
    }
  }

  function onIntentInput() {
    propSeq++;proposalAbort?.abort();proposal=null;latestExport=null;
    updateButtons();
    clearTimeout(debounceTimer);
    if (!packet) return;
    if (!refs.intent.value.trim()) { setStatus('IDLE'); return; }
    debounceTimer = setTimeout(() => { void requestProposal(); }, DEBOUNCE);
  }

  async function ensureProposal() {
    if (!proposal) await requestProposal();
    return proposal;
  }

  function fallbackMarkdown() {
    const files = listFiles(packet?.scope);
    const lines = [
      '# Agent scope', '',
      `context: ${packet?.contextId ?? '—'}`,
      `route: ${location.pathname}`, '',
      '## files', ...(files.length ? files.map((f) => `- ${f}`) : ['- —']), '',
    ];
    const intent = refs.intent.value.trim();
    if (intent) lines.push('## intent', '', intent, '');
    return lines.join('\n');
  }

  function copyPayload() {
    const intent = refs.intent.value.trim();
    if (proposal) {
      return {
        contextId: packet?.contextId, intent,
        task: proposal.task, markdown: proposal.markdown,
        files: proposal.files, budget: proposal.budget,
      };
    }
    return {
      contextId: packet?.contextId, intent,
      context: packet?.context, scope: packet?.scope,
      selection: packet?.selection, motion: packet?.motion, budget: packet?.budget,
    };
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
    } catch { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute(UI_ATTR, '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }

  async function onCopyJson() {
    if (!packet) return;
    setStatus('COPYING…');
    await ensureProposal();
    if(!proposal?.task){setStatus('NO CURRENT PROPOSAL // CHECK INTENT OR RESELECT');return;}
    const ok = await copyText(JSON.stringify(proposal.task, null, 2));
    setStatus(ok ? 'JSON COPIED' : 'COPY BLOCKED');
  }

  async function onCopyMd() {
    if (!packet) return;
    setStatus('COPYING…');
    await ensureProposal();
    if(!proposal?.markdown){setStatus('NO CURRENT PROPOSAL // CHECK INTENT OR RESELECT');return;}
    const ok = await copyText(proposal.markdown);
    setStatus(ok ? 'MARKDOWN COPIED' : 'COPY BLOCKED');
  }

  async function onExport() {
    const intent = refs.intent.value.trim();
    if (!packet || !intent || busy) return;
    latestExport=null;
    busy = true;
    updateButtons();
    setStatus('EXPORTING…');
    try {
      const res = await send('/export-task', { contextId: packet.contextId, intent }, { retry: false });
      latestExport = res;
      proposal=res;
      const paths = res?.paths || res?.saved || res?.files || null;
      const shown = Array.isArray(paths) ? paths.join(' · ') : (typeof paths === 'string' ? paths : '');
      setStatus(shown ? 'SAVED · ' + shown : 'EXPORTED');
      renderBudget(res?.budget || packet?.budget);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setStatus('EXPORT FAILED · ' + (err?.message || ''));
    } finally {
      busy = false;
      updateButtons();
    }
  }

  function download(name, text, type) {
    try {
      const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      objectUrls.add(url);
      const a = document.createElement('a');
      a.setAttribute(UI_ATTR, '');
      a.href = url;
      a.download = name;
      a.style.cssText = 'display:none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      const id = setTimeout(() => { URL.revokeObjectURL(url); objectUrls.delete(url); timers.delete(id); }, 2000);
      timers.add(id);
    } catch { setStatus('DOWNLOAD BLOCKED'); }
  }

  act('export').addEventListener('click', onExport);
  act('copy-json').addEventListener('click', onCopyJson);
  act('copy-md').addEventListener('click', onCopyMd);
  act('dl-json').addEventListener('click', () => {
    if (!latestExport) return;
    download('dev-studio.task.json', JSON.stringify(latestExport.task, null, 2), 'application/json');
  });
  act('dl-md').addEventListener('click', () => {
    if (!latestExport) return;
    download('task.md', latestExport.markdown, 'text/markdown');
  });
  refs.intent.addEventListener('input', onIntentInput);

  // ---- lifecycle -----------------------------------------------------------
  const show = () => { for(const host of [overlayHost,panelHost]){host.style.display='block';try{host.showPopover?.();}catch{host.removeAttribute('popover');}} };
  const hide = () => { for(const host of [panelHost,overlayHost]){try{host.hidePopover?.();}catch{}host.style.display='none';} };

  function cancelReads() {
    seq++;
    propSeq++;
    if (selectionAbort) { selectionAbort.abort(); selectionAbort = null; }
    if (proposalAbort) { proposalAbort.abort(); proposalAbort = null; }
    clearTimeout(debounceTimer);
    debounceTimer = 0;
    dragging = null;
    hideDrag();
    clearBoxes();
    busy = false;
    updateButtons();
  }

  async function boot() {
    if (mode !== SCOPE_MODE) return;
    stopLiveEntrance();stopLiveWipe();
    try { await session(lifetime.signal); } catch { /* offline tolerated */ }
    if (mode !== SCOPE_MODE) return;
    if (currentRoots.length) await commit(currentRoots);
    else setStatus('DRAG TO SELECT');
  }

  const unsubscribe = subscribe((payload) => {
    const next = typeof payload === 'string' ? payload : (payload?.mode ?? getMode());
    if (!next || next === mode) return;
    mode = next;
    hudButton?.setAttribute('aria-pressed',String(mode===SCOPE_MODE));
    if (mode === SCOPE_MODE) { show(); void boot(); }
    else { cancelReads(); hide(); setStatus('IDLE'); }
  });

  if (mode === SCOPE_MODE) { show(); void boot(); } else { hide(); }

  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('keydown', onKeyDown, true);
  const cancelPointer=()=>{dragging=null;hideDrag();};
  const redraw=()=>{if(mode===SCOPE_MODE)drawBoxes(currentRoots);};
  const resized=()=>{if(mode!==SCOPE_MODE)return;cancelReads();packet=null;proposal=null;latestExport=null;currentRoots=[];lastCapture=null;renderPacket();setStatus('VIEWPORT CHANGED // DRAG AGAIN');};
  window.addEventListener('pointercancel',cancelPointer,{signal:lifetime.signal});
  window.addEventListener('blur',cancelPointer,{signal:lifetime.signal});
  window.addEventListener('scroll',redraw,{capture:true,passive:true,signal:lifetime.signal});
  window.addEventListener('resize',resized,{signal:lifetime.signal});

  return function dispose() {
    try { unsubscribe(); } catch { /* ignore */ }
    lifetime.abort();
    cancelReads();
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('keydown', onKeyDown, true);
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    objectUrls.forEach(url=>URL.revokeObjectURL(url));objectUrls.clear();
    if (hudButton) hudButton.remove();
    panelHost.remove();
    overlayHost.remove();
  };
}
