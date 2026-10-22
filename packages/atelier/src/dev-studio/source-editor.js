import { stopLiveEntrance, stopLiveWipe } from './host-motion.js';

export function mountSourceEditor(controller) {
  const hud = document.querySelector('dev-studio-hud'), root = hud?.shadowRoot;
  if (!root) return () => {};
  const panel = root.querySelector('.panel'), modes = root.querySelector('[aria-label="HUD mode"]');
  if (!panel || !modes) return () => {};
  const API = '/__dev_studio_api', KEY = 'dev-studio:last-transaction', RESTORE = 'dev-studio:restore-edit';
  const ac = new AbortController(), signal = ac.signal;
  let token = null, tokenPromise = null, record = null, selected = null, original = null;
  let overlayHost = null, overlayBox = null, overlayLabel = null, raf = 0;
  let pending = false, seq = 0, resolveAbort = null, off = () => {};

  const modeBtn = document.createElement('button');
  modeBtn.type = 'button'; modeBtn.textContent = '03 // SELECT & EDIT'; modeBtn.className = 'ds-source-mode';
  modes.append(modeBtn);
  modeBtn.addEventListener('click', () => controller.setMode('edit'), { signal });

  const section = document.createElement('section');
  section.className = 'ds-source'; section.hidden = true;
  section.innerHTML = `<style>
.ds-source{margin-top:10px;padding:10px;background:#090A0C;color:#E5FF00;border:1px solid rgba(255,255,255,.12);font:11px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace;display:grid;gap:7px}
.ds-source[hidden]{display:none!important}.ds-source .ds-head{display:flex;justify-content:space-between;gap:8px;color:#b7bdc7}
.ds-source output{color:#E5FF00;overflow-wrap:anywhere}.ds-source label{display:grid;gap:3px;color:#b7bdc7;text-transform:uppercase;letter-spacing:.06em}
.ds-source textarea,.ds-source select,.ds-source input{width:100%;box-sizing:border-box;padding:5px 6px;font:inherit;color:#e8e8e8;background:#111317;border:1px solid rgba(255,255,255,.12);border-radius:0;outline:none}
.ds-source textarea{min-height:58px;resize:vertical}.ds-source textarea:focus,.ds-source select:focus,.ds-source input:focus{border-color:#E5FF00}
.ds-source .ds-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.ds-source .ds-actions{display:flex;gap:7px}
.ds-source button{padding:6px 9px;font:inherit;font-weight:700;letter-spacing:.08em;color:#E5FF00;background:#111317;border:1px solid rgba(255,255,255,.12);cursor:pointer}
.ds-source button:hover:not(:disabled){background:#171a1f;border-color:#E5FF00}.ds-source button:disabled{opacity:.38;cursor:not-allowed}
.ds-source .ds-status{min-height:1.4em;color:#E5FF00;white-space:pre-wrap;overflow-wrap:anywhere}.ds-source .ds-undo{margin-left:auto}
</style>
<div class="ds-head"><span>SOURCE EDIT</span><output class="ds-target">NO TARGET · ALT+CLICK</output></div>
<label>STATIC TEXT<textarea class="ds-text" spellcheck="false"></textarea></label>
<div class="ds-row"><label>EDIT TYPE<select class="ds-kind"><option value="text">Text</option><option value="style">Inline CSS</option></select></label>
<label>CSS PROPERTY<select class="ds-prop"><option>margin</option><option>padding</option><option>font-size</option><option>gap</option><option>width</option><option>height</option><option>opacity</option><option>color</option><option>background-color</option><option>line-height</option><option>border-radius</option></select></label></div>
<label>VALUE<input class="ds-value" type="text" spellcheck="false"></label>
<div class="ds-actions"><button class="ds-apply" type="button" disabled>APPLY // 提交修改</button><button class="ds-undo" type="button">↩ UNDO // 撤销</button></div>
<output class="ds-status" role="status"></output>`;
  panel.append(section);
  const $ = (s) => section.querySelector(s);
  const targetOut = $('.ds-target'), textarea = $('.ds-text'), kind = $('.ds-kind'), prop = $('.ds-prop');
  const value = $('.ds-value'), apply = $('.ds-apply'), undo = $('.ds-undo'), status = $('.ds-status');

  function savedTransaction() {
    try { const raw = sessionStorage.getItem(KEY); if (!raw) return null; const data = JSON.parse(raw); return typeof data === 'string' ? { transactionId: data } : data; } catch { return null; }
  }
  const saved = savedTransaction();
  if (saved) status.textContent = saved.message || `COMMIT SUCCESS(${saved.newRevision ?? '?'})`;
  const errText = (e) => e?.name === 'AbortError' ? '' : String(e?.message || e);
  function showError(e) { if (e?.name !== 'AbortError') status.textContent = errText(e); }
  function displayText(raw) {
    const decoder = document.createElement('textarea');
    // Escape delimiters first: this parses entities only, never network-provided markup.
    decoder.innerHTML = raw.replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    return decoder.value;
  }

  async function ensureToken() {
    if (token) return token;
    if (!tokenPromise) tokenPromise = (async () => {
      const res = await fetch(`${API}/session`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal });
      if (!res.ok) { let detail = ''; try { detail = await res.text(); } catch {} throw new Error(`SESSION ${res.status}${detail ? ` ${detail}` : ''}`); }
      const session = await res.json();
      token = session.token;
      if (session.transactionId) {
        const current = savedTransaction();
        if (current?.transactionId !== session.transactionId) {
          const recovered = { transactionId: session.transactionId, newRevision: session.newRevision, message: `COMMIT SUCCESS (${session.newRevision})` };
          try { sessionStorage.setItem(KEY, JSON.stringify(recovered)); } catch {}
          status.textContent = recovered.message;
        }
      } else if (session.outcome?.kind === 'undo') {
        try { sessionStorage.removeItem(KEY); } catch {}
        status.textContent = `UNDO SUCCESS (${session.outcome.newRevision})`;
      } else if (savedTransaction()) {
        try { sessionStorage.removeItem(KEY); } catch {}
        status.textContent = 'UNDO HISTORY EXPIRED // DEV SERVER RESTARTED';
      }
      return token;
    })().finally(() => { tokenPromise = null; });
    return tokenPromise;
  }
  async function post(path, body, { read = false, reqSignal = signal } = {}) {
    let retried = false;
    for (;;) {
      await ensureToken();
      const res = await fetch(API + path, { method: 'POST', signal: reqSignal, headers: { 'content-type': 'application/json', 'x-dev-studio-token': token || '' }, body: JSON.stringify(body) });
      if (res.status === 401 && read && !retried) { retried = true; token = null; continue; }
      if (!res.ok) { let detail = ''; try { detail = await res.text(); } catch {} throw new Error(`${path.slice(1)} ${res.status}${detail ? ` ${detail}` : ''}`); }
      return res.json();
    }
  }

  function destroyOverlay() {
    if (raf) cancelAnimationFrame(raf); raf = 0;
    try { overlayHost?.hidePopover?.(); } catch {}
    overlayHost?.remove(); overlayHost = overlayBox = overlayLabel = null;
  }
  function positionOverlay() {
    raf = 0; if (!overlayBox || !selected) return;
    const r = selected.getBoundingClientRect();
    Object.assign(overlayBox.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    overlayLabel.textContent = `${record?.tag || selected.tagName} ${Math.round(r.width)}×${Math.round(r.height)}`;
    Object.assign(overlayLabel.style, { left: `${Math.max(0, r.left)}px`, top: `${Math.max(0, r.top - 22)}px` });
  }
  function scheduleOverlay() { if (!raf) raf = requestAnimationFrame(positionOverlay); }
  function makeOverlay() {
    if (overlayHost?.isConnected) { scheduleOverlay(); return; }
    overlayHost = document.createElement('div'); overlayHost.setAttribute('popover', 'manual');
    Object.assign(overlayHost.style, { position: 'fixed', inset: '0', margin: '0', width: '100vw', height: '100vh', border: '0', padding: '0', background: 'transparent', pointerEvents: 'none', zIndex: '2147483647' });
    const sr = overlayHost.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>.box{position:absolute;box-sizing:border-box;border:2px dashed #E5FF00;background:transparent;pointer-events:none}.label{position:absolute;padding:2px 5px;background:#090A0C;color:#E5FF00;border:1px solid rgba(255,255,255,.12);font:11px/1.4 ui-monospace,monospace;white-space:nowrap;pointer-events:none}</style><div class="box"></div><div class="label"></div>`;
    overlayBox = sr.querySelector('.box'); overlayLabel = sr.querySelector('.label');
    document.documentElement.append(overlayHost);
    if (overlayHost.showPopover) { try { overlayHost.showPopover(); } catch { overlayHost.removeAttribute('popover'); } } else overlayHost.removeAttribute('popover');
    scheduleOverlay();
  }

  function captureOriginal(el) { original = { el, style: el.getAttribute('style'), text: el.textContent, textChanged: false }; }
  function restorePreview() {
    if (!original) return; const o = original; original = null;
    if (o.textChanged) o.el.textContent = o.text;
    if (o.style === null) o.el.removeAttribute('style'); else o.el.setAttribute('style', o.style);
  }
  function restoreStyleOnly() { if (!original) return; if (original.style === null) original.el.removeAttribute('style'); else original.el.setAttribute('style', original.style); }
  function previewText() {
    if (pending || kind.value !== 'text' || !selected || !record?.capabilities?.text) return;
    if (selected.childElementCount) { status.textContent = 'TEXT PREVIEW NEEDS A PLAIN ELEMENT'; return; }
    if (!original || original.el !== selected) captureOriginal(selected);
    selected.textContent = textarea.value; original.textChanged = true; status.textContent = 'PREVIEW · NOT SAVED'; scheduleOverlay();
  }
  function previewStyle() {
    if (pending || kind.value !== 'style' || !selected || !record?.capabilities?.style) return;
    if (!original || original.el !== selected) captureOriginal(selected);
    restoreStyleOnly(); const p = prop.value, v = value.value;
    if (!v) { status.textContent = 'CSS VALUE REQUIRED'; return; }
    if (!window.CSS?.supports?.(p, v)) { status.textContent = `INVALID CSS · ${p}`; return; }
    selected.style.setProperty(p, v); status.textContent = 'PREVIEW · NOT SAVED'; scheduleOverlay();
  }
  function updateUI() {
    const has = !!record, caps = record?.capabilities || {};
    if (has) {
      const textOpt = kind.querySelector('option[value="text"]'), styleOpt = kind.querySelector('option[value="style"]');
      textOpt.disabled = !caps.text; styleOpt.disabled = !caps.style;
      if (kind.selectedOptions[0]?.disabled) kind.value = caps.style ? 'style' : 'text';
    }
    apply.disabled = pending || !has; undo.disabled = pending; kind.disabled = pending || !has;
    textarea.disabled = pending || !has || kind.value !== 'text'; prop.disabled = pending || !has || kind.value !== 'style'; value.disabled = pending || !has || kind.value !== 'style';
    targetOut.textContent = has ? `${record.file} // ${record.tag}` : selected ? 'RESOLVING…' : 'NO TARGET · ALT+CLICK';
  }
  function clearSelection() {
    restorePreview(); seq++; resolveAbort?.abort(); resolveAbort = null; selected = null; record = null;
    destroyOverlay(); textarea.value = ''; value.value = ''; updateUI();
  }

  async function chooseElement(el) {
    restorePreview(); seq++; resolveAbort?.abort(); selected = el; record = null; textarea.value = ''; value.value = ''; updateUI(); makeOverlay();
    const my = seq, ctrl = new AbortController(); resolveAbort = ctrl; status.textContent = 'RESOLVING…';
    try {
      await ensureToken(); if (my !== seq) return;
      const rec = await post('/resolve', { sourceId: el.dataset.dsId }, { read: true, reqSignal: ctrl.signal });
      if (my !== seq || selected !== el || controller.getState().mode !== 'edit') return;
      record = rec; captureOriginal(el); textarea.value = rec.text ? displayText(rec.text.expectedOld) : ''; value.value = '';
      const caps = rec.capabilities || {}; kind.value = caps.text ? 'text' : caps.style ? 'style' : 'text';
      status.textContent = `${rec.file} // ${rec.tag}`; updateUI();
    } catch (e) {
      if (e?.name === 'AbortError') return;
      if (my === seq) { selected = null; record = null; destroyOverlay(); updateUI(); showError(e); }
    } finally { if (my === seq) resolveAbort = null; }
  }

  function setPending(v, msg) { pending = v; if (msg) status.textContent = msg; updateUI(); }
  apply.addEventListener('click', async () => {
    if (pending || !record || !selected) return;
    const rec = record, type = kind.value; let operation;
    if (type === 'text') {
      if (!rec.capabilities?.text) { status.textContent = 'TEXT EDIT UNAVAILABLE'; return; }
      if (textarea.value === displayText(rec.text.expectedOld)) { status.textContent = 'NO TEXT CHANGE'; return; }
      operation = { kind: 'replaceStaticText', expectedOld: rec.text?.expectedOld, newValue: textarea.value };
    } else {
      if (!rec.capabilities?.style) { status.textContent = 'STYLE EDIT UNAVAILABLE'; return; }
      const p = prop.value, v = value.value;
      if (!v || !window.CSS?.supports?.(p, v)) { status.textContent = 'INVALID CSS VALUE'; return; }
      operation = { kind: 'replaceInlineStyle', expectedOld: rec.style?.expectedOld || '', property: p, newValue: v };
    }
    restorePreview(); setPending(true, 'APPLYING…');
    try { sessionStorage.setItem(RESTORE, '1'); } catch {}
    let success = false, finalTarget = '';
    try {
      const res = await post('/commit', { sourceId: rec.sourceId, baseRevision: rec.baseRevision, operation });
      const message = `COMMIT SUCCESS(${res.newRevision}) · ${rec.file} // ${rec.tag}`;
      try { sessionStorage.setItem(KEY, JSON.stringify({ transactionId: res.transactionId, newRevision: res.newRevision, message })); } catch {}
      record = null; selected = null; destroyOverlay(); textarea.value = ''; value.value = '';
      finalTarget = `${rec.file} // ${rec.tag} · RESELECT`; status.textContent = `${message} · RESELECT`; success = true;
    } catch (e) { showError(e); try { sessionStorage.removeItem(RESTORE); } catch {} }
    finally { pending = false; updateUI(); if (success) targetOut.textContent = finalTarget; }
  }, { signal });

  undo.addEventListener('click', async () => {
    if (pending) return;
    const savedTx = savedTransaction();
    if (!savedTx?.transactionId) { status.textContent = 'NO TRANSACTION TO UNDO'; return; }
    restorePreview(); setPending(true, 'UNDOING…');
    try { sessionStorage.setItem(RESTORE, '1'); } catch {}
    try {
      const res = await post('/undo', { transactionId: savedTx.transactionId });
      try { sessionStorage.removeItem(KEY); } catch {}
      clearSelection(); status.textContent = `UNDO SUCCESS(${res.newRevision}) · RESELECT`;
    } catch (e) { showError(e); }
    finally { pending = false; updateUI(); }
  }, { signal });

  textarea.addEventListener('input', previewText, { signal });
  value.addEventListener('input', previewStyle, { signal });
  prop.addEventListener('change', previewStyle, { signal });
  kind.addEventListener('change', () => { const el = selected; restorePreview(); if (el) captureOriginal(el); updateUI(); }, { signal });
  window.addEventListener('click', (event) => {
    if (pending || controller.getState().mode !== 'edit' || !event.altKey) return;
    const path = event.composedPath?.() || [];
    if (path.includes(hud)) return;
    const el = event.target instanceof Element ? event.target.closest('[data-ds-id]') : null;
    if (!el) return;
    event.preventDefault(); event.stopImmediatePropagation(); event.stopPropagation(); void chooseElement(el);
  }, { capture: true, signal });
  window.addEventListener('scroll', scheduleOverlay, { capture: true, passive: true, signal });
  window.addEventListener('resize', scheduleOverlay, { passive: true, signal });

  let previousMode = null;
  function renderState(state) {
    const edit = state?.mode === 'edit';
    section.hidden = !edit; modeBtn.setAttribute('aria-pressed', String(edit)); modeBtn.classList.toggle('is-active', edit);
    if (edit) {
      if (previousMode !== 'edit') { stopLiveEntrance(); stopLiveWipe(); }
      ensureToken().catch(showError);
    } else clearSelection();
    previousMode = state?.mode;
  }
  off = controller.subscribe(renderState); renderState(controller.getState());
  try {
    if (sessionStorage.getItem(RESTORE) === '1') {
      sessionStorage.removeItem(RESTORE);
      queueMicrotask(() => { if (!signal.aborted) controller.setMode('edit'); });
    }
  } catch {}
  return () => {
    off?.(); ac.abort(); restorePreview(); resolveAbort?.abort(); destroyOverlay(); modeBtn.remove(); section.remove();
  };
}
