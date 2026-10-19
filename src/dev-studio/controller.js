import { createStageSession } from './scene.js';

export function createController({ createSession = createStageSession } = {}) {
  const abort = new AbortController();
  const { signal } = abort;
  const subscribers = new Set();
  const state = {
    mode: 'physics', factor: 1, tau: 140, orbit: false,
    busy: false, error: '', frame: 0, lastFrame: 90, timeMs: 0,
    durationMs: 1500, playing: false, speed: 1, direction: 1,
    scene: 'entrance', hasFrames: false
  };
  let session = null, playback = 0, lastTime = 0, playhead = 0;
  const emit = () => subscribers.forEach(fn => fn({ ...state }));
  const dispatchMode = () => window.dispatchEvent(new CustomEvent('dev-studio:mode', { detail: ['edit','scope'].includes(state.mode) ? 'stage' : state.mode }));
  const dispatchPhysics = () => window.dispatchEvent(new CustomEvent('dev-studio:physics', { detail: { factor: state.factor, tau: state.tau, orbit: state.orbit } }));
  function pause() { cancelAnimationFrame(playback); playback = 0; state.playing = false; }
  function discard() {
    pause(); session?.dispose(); session = null;
    state.hasFrames = false; state.frame = 0; state.timeMs = 0; state.lastFrame = 0;
  }
  function setMode(mode) {
    if (!['physics', 'stage', 'edit', 'scope'].includes(mode) || mode === state.mode) return;
    discard(); state.mode = mode; state.error = '';
    dispatchMode(); dispatchPhysics();
    if (mode === 'stage') {
      try { session = createSession(state.scene); }
      catch (error) { state.error = error.message; }
    }
    emit();
  }
  function render(index) {
    if (!session || !state.hasFrames) return;
    const frame = session.baker.seekFrame(index);
    session.project(frame);
    state.frame = frame.frameIndex; state.timeMs = frame.timeMs; playhead = frame.timeMs;
  }
  function seekFrame(index) {
    pause();
    try { render(index); } catch (error) { state.error = error.message; discard(); }
    emit();
  }
  function bake(reroll = false) {
    if (state.mode !== 'stage' || state.busy) return;
    pause(); state.busy = true; state.error = ''; emit();
    try {
      session ??= createSession(state.scene);
      const frames = session.bake(reroll);
      state.lastFrame = frames.length - 1; state.hasFrames = true;
      render(0);
    } catch (error) { discard(); state.error = error.message; }
    finally { state.busy = false; emit(); }
  }
  function tick(now) {
    if (!state.playing || !session || !state.hasFrames) { pause(); return; }
    const next = Math.max(0, Math.min(state.durationMs, playhead + (now - lastTime) * state.speed * state.direction));
    lastTime = now;
    try {
      const frame = session.baker.seekTime(next);
      session.project(frame); state.frame = frame.frameIndex; state.timeMs = frame.timeMs; playhead = next;
      if (next === 0 || next === state.durationMs) pause();
    } catch (error) { state.error = error.message; discard(); }
    emit();
    if (state.playing) playback = requestAnimationFrame(tick);
  }
  function togglePlay() {
    if (!state.hasFrames || state.mode !== 'stage') return;
    if (state.playing) pause();
    else {
      if ((state.direction === 1 && state.frame === state.lastFrame) || (state.direction === -1 && state.frame === 0)) {
        render(state.direction === 1 ? 0 : state.lastFrame);
      }
      state.playing = true; lastTime = performance.now(); playback = requestAnimationFrame(tick);
    }
    emit();
  }
  // Stop real input only in Stage; HUD controls remain usable through their composed path.
  function isolate(event) {
    if (!['stage','scope'].includes(state.mode) || event.composedPath().some(node => node?.localName === 'dev-studio-hud' || node?.hasAttribute?.('data-dev-studio-ui'))) return;
    if(state.mode==='scope'&&event.type.startsWith('pointer'))return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    if (['click', 'auxclick', 'wheel', 'touchmove', 'keydown'].includes(event.type)) event.preventDefault();
    event.stopImmediatePropagation();
  }
  for (const type of ['pointermove', 'pointerover', 'pointerleave', 'pointerdown', 'click', 'auxclick', 'wheel', 'touchmove', 'keydown']) window.addEventListener(type, isolate, { capture: true, passive: false, signal });
  document.addEventListener('astro:before-preparation', () => setMode('physics'), { signal });
  document.addEventListener('astro:before-swap', () => { discard(); state.mode = 'physics'; dispatchMode(); emit(); }, { signal });
  document.addEventListener('astro:page-load', () => { dispatchMode(); dispatchPhysics(); }, { signal });
  window.addEventListener('resize', () => {
    if (!state.hasFrames) return;
    discard(); state.error = 'Viewport changed — BAKE again'; emit();
  }, { signal });
  window.addEventListener('ivorg:motion', () => {
    if (state.mode === 'stage') { discard(); state.error = 'Motion preference changed — BAKE again'; emit(); }
  }, { signal });
  return {
    getState: () => ({ ...state }),
    subscribe(fn) { subscribers.add(fn); fn({ ...state }); return () => subscribers.delete(fn); },
    setMode, bake, seekFrame, togglePlay,
    step(delta) { seekFrame(state.frame + delta); },
    setPhysics(next) {
      if (state.mode !== 'physics') return;
      if (Number.isFinite(next.factor)) state.factor = Math.max(0, Math.min(3, next.factor));
      if (Number.isFinite(next.tau)) state.tau = Math.max(20, Math.min(600, next.tau));
      if (typeof next.orbit === 'boolean') state.orbit = next.orbit;
      dispatchPhysics(); emit();
    },
    setScene(scene) { if (!['entrance', 'wipe', 'combined'].includes(scene)) return; discard(); state.scene = scene; state.error = ''; emit(); },
    setSpeed(speed) { if ([.1, .5, 1].includes(speed)) { state.speed = speed; emit(); } },
    setDirection(direction) { if ([1, -1].includes(direction)) { state.direction = direction; emit(); } },
    dispose() { discard(); state.mode = 'physics'; state.orbit = false; dispatchMode(); dispatchPhysics(); abort.abort(); subscribers.clear(); }
  };
}
