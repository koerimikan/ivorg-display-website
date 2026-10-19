const TAG = 'dev-studio-hud';

const CSS = `
:host{all:initial;box-sizing:border-box;position:fixed;inset:auto auto 14px 50%;transform:translateX(-50%);z-index:2147483647;width:min(960px,calc(100vw - 24px));max-height:70vh;overflow:auto;margin:0;padding:12px;background:#090A0C;color:#E8E8E8;border:1px solid rgba(255,255,255,.12);border-radius:0;box-shadow:0 24px 70px rgba(0,0,0,.6);font:12px/1.35 "JetBrains Mono",Consolas,monospace;color-scheme:dark}
:host([hidden]){display:none!important}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
.panel{display:grid;gap:9px}
.row,.group{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.modes{display:flex;gap:6px;flex-wrap:wrap}
.status{flex:1;min-width:140px;color:#A9ADB5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right}
.field{display:flex;align-items:center;gap:6px;color:#C8CBD0}
.field output{min-width:2.6em;color:#E5FF00;text-align:right}
input[type=range]{accent-color:#E5FF00;background:transparent;border:0;padding:0;min-width:110px;max-width:220px}
input[type=range]::-webkit-slider-runnable-track{height:3px;background:#E5FF00;border-radius:2px}
input[type=range]::-moz-range-track{height:3px;background:#E5FF00;border-radius:2px}
button,select{font:inherit;color:#E8E8E8;background:#111317;border:1px solid rgba(255,255,255,.16);border-radius:2px;padding:5px 8px;color-scheme:dark}
button{cursor:pointer}
button:hover:not(:disabled),select:hover:not(:disabled){border-color:rgba(229,255,0,.55);background:#171A1F}
button:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid #E5FF00;outline-offset:1px}
button[aria-pressed=true]{background:#E5FF00;color:#090A0C;border-color:#E5FF00}
button:disabled,select:disabled,input:disabled{opacity:.38;cursor:not-allowed}
input[type=checkbox]{accent-color:#E5FF00;color-scheme:dark}
.check{display:flex;align-items:center;gap:5px;color:#C8CBD0;user-select:none}
.frame{color:#E5FF00;min-width:136px}
.dim{color:#8A8F98}
`;

const TEMPLATE = `
<div class=panel>
  <div class=row>
    <div class=modes role=group aria-label="HUD mode">
      <button type=button data-mode=physics aria-pressed=true>01 // PHYSICS SANDBOX</button>
      <button type=button data-mode=stage aria-pressed=false>02 // BAKED TIMELINE</button>
    </div>
    <span class=status role=status aria-live=polite></span>
  </div>
  <div class=group data-physics>
    <label class=field>Factor <input data-factor type=range min=0 max=3 step=0.1 aria-label="Physics factor"> <output data-factor-out></output></label>
    <label class=field>Tau <input data-tau type=range min=20 max=600 step=10 aria-label="Physics tau"> <output data-tau-out></output></label>
    <label class=check><input data-orbit type=checkbox> Auto-Orbit</label>
  </div>
  <div class=group data-stage hidden>
    <div class=row>
      <label class=field>Scene <select data-scene aria-label="Stage scene">
        <option value=entrance>Entrance</option>
        <option value=wipe>Wipe</option>
        <option value=combined>Combined</option>
      </select></label>
      <button type=button data-bake>● BAKE</button>
      <button type=button data-reroll>🎲 RE-ROLL</button>
    </div>
    <div class=row>
      <span class=frame>FRAME <span data-frame>000</span> / <span data-last>000</span> <span class=dim data-ms>0 / 0 ms</span></span>
      <input data-seek type=range min=0 max=0 step=1 value=0 aria-label="Frame">
    </div>
    <div class=row>
      <button type=button data-play>Play</button>
      <button type=button data-pause>Pause</button>
      <button type=button data-minus>Step -1</button>
      <button type=button data-plus>Step +1</button>
      <span class=field>Speed <span class=modes>
        <button type=button data-speed=0.1 aria-pressed=false>0.1x</button>
        <button type=button data-speed=0.5 aria-pressed=false>0.5x</button>
        <button type=button data-speed=1 aria-pressed=false>1.0x</button>
      </span></span>
      <span class=field>Direction <span class=modes>
        <button type=button data-dir=forward aria-pressed=true>Forward</button>
        <button type=button data-dir=reverse aria-pressed=false>Reverse</button>
      </span></span>
    </div>
  </div>
</div>`;

const pad3 = value => String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(3, '0');

class DevStudioHUD extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `<style>${CSS}</style>${TEMPLATE}`;
    this._visible = true;
    this._disposed = false;
    this._state = null;
    this._controller = null;
    this._unsub = null;
    this._abort = null;
    const q = selector => this.shadowRoot.querySelector(selector);
    this._r = {
      panel: q('.panel'), physics: q('[data-physics]'), stage: q('[data-stage]'),
      modePhysics: q('[data-mode=physics]'), modeStage: q('[data-mode=stage]'), status: q('.status'),
      factor: q('[data-factor]'), factorOut: q('[data-factor-out]'),
      tau: q('[data-tau]'), tauOut: q('[data-tau-out]'), orbit: q('[data-orbit]'),
      scene: q('[data-scene]'), bake: q('[data-bake]'), reroll: q('[data-reroll]'),
      frame: q('[data-frame]'), last: q('[data-last]'), ms: q('[data-ms]'), seek: q('[data-seek]'),
      play: q('[data-play]'), pause: q('[data-pause]'), minus: q('[data-minus]'), plus: q('[data-plus]'),
      speeds: [...this.shadowRoot.querySelectorAll('[data-speed]')],
      dirs: [...this.shadowRoot.querySelectorAll('[data-dir]')]
    };
    this._bind();
    this._onKey = event => {
      if (event.repeat || event.isComposing) return;
      const target = (event.composedPath && event.composedPath()[0]) || event.target;
      const altD = event.altKey && (event.key === 'd' || event.key === 'D');
      if (!altD && target instanceof Element && (target.isContentEditable || /^(TEXTAREA|SELECT)$/.test(target.tagName) || (target.tagName === 'INPUT' && !['range','checkbox','button'].includes(target.type)))) return;
      if (event.key !== '~' && !altD) return;
      event.preventDefault();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation(); else event.stopPropagation();
      this._toggle();
    };
  }

  _bind() {
    const r = this._r;
    r.modePhysics.addEventListener('click', () => this._invoke('setMode', 'physics'));
    r.modeStage.addEventListener('click', () => this._invoke('setMode', 'stage'));
    r.factor.addEventListener('input', () => this._invoke('setPhysics', { factor: Number(r.factor.value) }));
    r.tau.addEventListener('input', () => this._invoke('setPhysics', { tau: Number(r.tau.value) }));
    r.orbit.addEventListener('change', () => this._invoke('setPhysics', { orbit: r.orbit.checked }));
    r.scene.addEventListener('change', () => this._invoke('setScene', r.scene.value));
    r.bake.addEventListener('click', () => this._bake(false));
    r.reroll.addEventListener('click', () => this._bake(true));
    r.seek.addEventListener('input', () => this._invoke('seekFrame', Number(r.seek.value)));
    r.play.addEventListener('click', () => { if (!this._state?.playing) this._invoke('togglePlay'); });
    r.pause.addEventListener('click', () => { if (this._state?.playing) this._invoke('togglePlay'); });
    r.minus.addEventListener('click', () => this._invoke('step', -1));
    r.plus.addEventListener('click', () => this._invoke('step', 1));
    for (const button of r.speeds) button.addEventListener('click', () => this._invoke('setSpeed', Number(button.dataset.speed)));
    for (const button of r.dirs) button.addEventListener('click', () => this._invoke('setDirection', button.dataset.dir === 'reverse' ? -1 : 1));
    for (const type of ['click', 'pointerdown', 'wheel', 'touchstart', 'touchend']) {
      this.shadowRoot.addEventListener(type, event => event.stopPropagation(), { passive: false });
    }
    r.panel.addEventListener('pointermove', event => event.stopPropagation());
  }

  _invoke(method, ...args) {
    try { return this._controller?.[method]?.(...args); } catch { return undefined; }
  }

  _bake(reroll) {
    if (this._state?.busy) return;
    try {
      const result = this._controller?.bake?.(reroll);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {}
  }

  _setRange(key, value) {
    const element = this._r[key];
    if (!element) return;
    const next = String(value ?? 0);
    if (this.shadowRoot.activeElement !== element && element.value !== next) element.value = next;
  }

  _update(state) {
    if (!state) return;
    this._state = state;
    const r = this._r;
    const stage = state.mode === 'stage';
    const busy = !!state.busy;
    const ready = !!state.hasFrames;
    r.modePhysics.setAttribute('aria-pressed', String(state.mode === 'physics'));
    r.modeStage.setAttribute('aria-pressed', String(stage));
    r.physics.hidden = state.mode !== 'physics';
    r.stage.hidden = !stage;
    this._setRange('factor', state.factor);
    this._setRange('tau', state.tau);
    r.factorOut.textContent = Number(state.factor ?? 0).toFixed(1);
    r.tauOut.textContent = String(Math.round(Number(state.tau) || 0));
    r.orbit.checked = !!state.orbit;
    if (['entrance', 'wipe', 'combined'].includes(state.scene)) r.scene.value = state.scene;
    const max = Math.max(0, Math.trunc(Number(state.lastFrame) || 0));
    const frame = Math.min(max, Math.max(0, Math.trunc(Number(state.frame) || 0)));
    r.frame.textContent = pad3(frame);
    r.last.textContent = pad3(max);
    r.ms.textContent = `${Math.round(Number(state.timeMs) || 0)} / ${Math.round(Number(state.durationMs) || 0)} ms`;
    r.seek.max = String(max);
    if (r.seek.value !== String(frame)) r.seek.value = String(frame);
    r.seek.setAttribute('aria-valuetext', `${frame} of ${max}`);
    r.modePhysics.disabled = busy;
    r.modeStage.disabled = busy;
    r.factor.disabled = busy;
    r.tau.disabled = busy;
    r.orbit.disabled = busy;
    r.scene.disabled = busy;
    r.bake.disabled = busy;
    r.reroll.disabled = busy;
    r.seek.disabled = busy || !ready;
    r.play.disabled = busy || !ready || !!state.playing;
    r.pause.disabled = busy || !ready || !state.playing;
    r.minus.disabled = busy || !ready;
    r.plus.disabled = busy || !ready;
    for (const button of r.speeds) button.disabled = busy || !ready;
    for (const button of r.dirs) button.disabled = busy || !ready;
    const speed = Number(state.speed);
    for (const button of r.speeds) {
      button.setAttribute('aria-pressed', String(Math.abs(Number(button.dataset.speed) - speed) < 1e-9));
    }
    const direction = Number(state.direction) >= 0 ? 'forward' : 'reverse';
    for (const button of r.dirs) button.setAttribute('aria-pressed', String(button.dataset.dir === direction));
    let message;
    if (state.error) message = String(state.error);
    else if (busy) message = 'Baking…';
    else if (stage) message = ready ? (state.playing ? 'Playing' : 'Paused') : 'No baked frames';
    else message = state.mode === 'edit' ? 'ALT + CLICK // SOURCE EDIT' : state.mode === 'scope' ? 'DRAG // AGENT SCOPE' : 'Physics sandbox';
    r.status.textContent = message;
    r.status.title = state.error ? String(state.error) : '';
  }

  _show() {
    this._visible = true;
    this.hidden = false;
    this.removeAttribute('hidden');
    if (typeof this.showPopover === 'function' && this.hasAttribute('popover')) {
      try { this.showPopover(); } catch { this.removeAttribute('popover'); }
    } else this.removeAttribute('popover');
  }

  _hide() {
    if (!this._visible) return;
    if (this._state?.mode !== 'physics') this._invoke('setMode', 'physics');
    this._visible = false;
    if (typeof this.hidePopover === 'function') {
      try { this.hidePopover(); } catch {}
    }
    this.hidden = true;
  }

  _toggle() { this._visible ? this._hide() : this._show(); }

  start(controller) {
    this.setAttribute('popover', 'manual');
    this.setAttribute('role', 'dialog');
    this.setAttribute('aria-label', 'Dev Studio HUD');
    this._controller = controller;
    this._abort?.abort();
    this._unsub?.();
    this._abort = new AbortController();
    document.addEventListener('keydown', this._onKey, { capture: true, signal: this._abort.signal });
    this._unsub = controller.subscribe(state => this._update(state));
    this._update(controller.getState());
    this._show();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._hide();
    this._abort?.abort();
    this._unsub?.();
    this._unsub = null;
    this.remove();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get(TAG)) {
  customElements.define(TAG, DevStudioHUD);
}

export function mountHUD(controller) {
  if (typeof document === 'undefined') throw new Error('mountHUD requires a DOM');
  if (!controller) throw new TypeError('mountHUD requires a controller');
  const existing = document.querySelector(TAG);
  if (existing) {
    if (typeof existing.dispose === 'function') existing.dispose();
    else existing.remove();
  }
  const hud = document.createElement(TAG);
  (document.body || document.documentElement).appendChild(hud);
  hud.start(controller);
  return () => hud.dispose();
}
