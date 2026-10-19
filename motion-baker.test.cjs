'use strict';

const MAX_SNAPSHOTS = 100000;
const TARGET = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs. Sphinx of black quartz, judge my vow. 0123456789 abcdefghijklmnopqrstuvwxyz';
const FINAL_MATRIX = 'matrix(1, 0, 0, 1, 0, 0)';
const FINAL_CLIP = 'inset(0%)';
const FINAL_FILTER = 'blur(0px)';

function validateBake(durationMs, fps) {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new TypeError('durationMs must be a finite positive number');
  }
  if (typeof fps !== 'number' || !Number.isFinite(fps) || fps <= 0) {
    throw new TypeError('fps must be a finite positive number');
  }
  const rawIntervals = durationMs * fps / 1000;
  if (!Number.isFinite(rawIntervals)) throw new RangeError('Frame count is not finite');
  const intervals = Math.max(1, Math.ceil(rawIntervals));
  if (!Number.isSafeInteger(intervals) || intervals + 1 > MAX_SNAPSHOTS) {
    throw new RangeError(`Cannot bake more than ${MAX_SNAPSHOTS} snapshots`);
  }
  return intervals;
}

function cloneSnapshot(value, stack = new WeakSet()) {
  if (value === null) return null;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Snapshot contains a non-finite number');
    return value;
  }
  if (type !== 'object') throw new TypeError(`Snapshot contains unsupported ${type}`);
  if (stack.has(value)) throw new TypeError('Snapshot contains a cycle');
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key === 'symbol' || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('Snapshot requires enumerable data properties only');
    }
    if (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key)) {
      throw new TypeError('Snapshot arrays cannot have extra properties');
    }
  }
  stack.add(value);
  let out;
  if (Array.isArray(value)) {
    out = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(value, i)) throw new TypeError('Snapshot arrays must be dense');
      out[i] = cloneSnapshot(value[i], stack);
    }
  } else {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError('Snapshot contains a non-plain object');
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('Snapshot contains symbol keys');
    out = {};
    for (const key of Object.keys(value)) {
      Object.defineProperty(out, key, {
        value: cloneSnapshot(value[key], stack),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
  }
  stack.delete(value);
  return out;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) deepFreeze(value[key], seen);
  return Object.freeze(value);
}

class MotionBaker {
  #createSimulation;
  #frames = null;
  #durationMs = null;
  #fps = null;
  #baking = false;

  constructor(createSimulation) {
    if (typeof createSimulation !== 'function') throw new TypeError('createSimulation must be a function');
    this.#createSimulation = createSimulation;
  }

  get frames() {
    return this.#frames;
  }

  get config() {
    if (this.#durationMs === null) return null;
    return Object.freeze({ durationMs: this.#durationMs, fps: this.#fps });
  }

  bake(durationMs, fps = 60) {
    if (this.#baking) throw new Error('MotionBaker.bake is already in progress');
    this.#baking = true;
    try {
      const intervals = validateBake(durationMs, fps);
      const sim = this.#createSimulation();
      if (!sim || typeof sim.advance !== 'function' || typeof sim.snapshot !== 'function') {
        let error = new TypeError('createSimulation must return advance() and snapshot()');
        if (sim && typeof sim.dispose === 'function') {
          try { sim.dispose(); } catch (disposeError) { error = disposeError; }
        }
        throw error;
      }
      let frames;
      let failed = false;
      let failure;
      try {
        frames = this.#buildFrames(sim, durationMs, fps, intervals);
      } catch (error) {
        failed = true;
        failure = error;
      }
      if (typeof sim.dispose === 'function') {
        try { sim.dispose(); } catch (error) {
          if (!failed) { failed = true; failure = error; }
        }
      }
      if (failed) throw failure;
      this.#frames = frames;
      this.#durationMs = durationMs;
      this.#fps = fps;
      return frames;
    } finally {
      this.#baking = false;
    }
  }

  #buildFrames(sim, durationMs, fps, intervals) {
    const frames = new Array(intervals + 1);
    const frameAt = (frameIndex, timeMs) => {
      const state = cloneSnapshot(sim.snapshot());
      frames[frameIndex] = deepFreeze({ frameIndex, timeMs, state });
    };
    frameAt(0, 0);
    let previousTime = 0;
    for (let i = 1; i <= intervals; i++) {
      const isLast = i === intervals;
      // Index-based timestamps avoid accumulated drift (e.g. frame 21 = 350ms).
      const timeMs = isLast ? durationMs : (i * 1000) / fps;
      const dtMs = timeMs - previousTime;
      if (!(dtMs > 0)) throw new RangeError('Frame timestamps must increase');
      const progress = isLast ? 1 : timeMs / durationMs;
      sim.advance({ timeMs, dtMs, progress });
      frameAt(i, timeMs);
      previousTime = timeMs;
    }
    return deepFreeze(frames);
  }

  seekFrame(frameIndex) {
    const frames = this.#frames;
    if (frames === null) throw new Error('No frames available; call bake() first');
    if (typeof frameIndex !== 'number' || !Number.isInteger(frameIndex)) {
      throw new TypeError('frameIndex must be an integer');
    }
    const clamped = Math.max(0, Math.min(frames.length - 1, frameIndex));
    return frames[clamped];
  }

  seekTime(timeMs) {
    const frames = this.#frames;
    if (frames === null) throw new Error('No frames available; call bake() first');
    if (typeof timeMs !== 'number' || !Number.isFinite(timeMs)) {
      throw new TypeError('timeMs must be a finite number');
    }
    const last = frames.length - 1;
    if (timeMs <= frames[0].timeMs) return frames[0];
    if (timeMs >= frames[last].timeMs) return frames[last];
    let low = 0;
    let high = last;
    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (frames[mid].timeMs <= timeMs) low = mid;
      else high = mid - 1;
    }
    return frames[low];
  }

  reroll() {
    if (this.#durationMs === null) throw new Error('No bake configuration available; call bake() first');
    return this.bake(this.#durationMs, this.#fps);
  }
}

function createProbeSimulation(track = {}) {
  let state = { timeMs: 0, dtMs: 0, progress: 0, advances: 0, payload: [] };
  return {
    advance({ timeMs, dtMs, progress }) {
      track.advances = (track.advances || 0) + 1;
      state = { timeMs, dtMs, progress, advances: track.advances, payload: [timeMs, dtMs, progress] };
    },
    snapshot() {
      track.snapshots = (track.snapshots || 0) + 1;
      return state;
    },
    dispose() {
      track.disposals = (track.disposals || 0) + 1;
    }
  };
}

function scramble(length, rand) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789!?';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(rand() * alphabet.length)];
  return out;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function createDecoderSimulation(track = {}) {
  track.advances = track.advances || 0;
  track.snapshots = track.snapshots || 0;
  track.randomCalls = track.randomCalls || 0;
  track.disposals = track.disposals || 0;
  const rand = () => { track.randomCalls++; return Math.random(); };
  const start = {
    a: 0.2 + rand() * 2,
    b: rand() * 0.4,
    c: rand() * 2,
    d: rand() * 0.4,
    tx: rand() * 200 - 100,
    ty: rand() * 200 - 100,
    clip: rand() * 100,
    opacity: rand() * 0.5,
    blur: rand() * 12
  };
  const spring = { x: rand() * 100, v: 0, k: 20 + rand() * 20, damping: 5 + rand() * 5 };
  let state = {
    timeMs: 0,
    dtMs: 0,
    progress: 0,
    text: scramble(TARGET.length, rand),
    matrix: `matrix(${start.a}, ${start.b}, ${start.c}, ${start.d}, ${start.tx}, ${start.ty})`,
    clipPath: `inset(${start.clip}%)`,
    opacity: start.opacity,
    filter: `blur(${start.blur}px)`,
    spring: { x: spring.x, v: spring.v },
    matrixValues: [start.a, start.b, start.c, start.d, start.tx, start.ty]
  };
  return {
    advance({ timeMs, dtMs, progress }) {
      track.advances++;
      const seconds = dtMs / 1000;
      spring.v += (100 - spring.x) * spring.k * seconds - spring.v * spring.damping * seconds;
      spring.x += spring.v * seconds;
      if (progress >= 1) {
        state = {
          timeMs,
          dtMs,
          progress: 1,
          text: TARGET,
          matrix: FINAL_MATRIX,
          clipPath: FINAL_CLIP,
          opacity: 1,
          filter: FINAL_FILTER,
          spring: { x: spring.x, v: spring.v },
          matrixValues: [1, 0, 0, 1, 0, 0]
        };
        return;
      }
      const ease = 1 - Math.pow(1 - progress, 3);
      const wobble = Math.sin(timeMs / 90 + spring.x * 0.1) * 0.04;
      const ink = Math.min(1, Math.max(0, ease + wobble));
      const cut = Math.floor(TARGET.length * ink);
      const text = TARGET.slice(0, cut) + scramble(TARGET.length - cut, rand);
      const a = lerp(start.a, 1, ease) + wobble;
      const b = lerp(start.b, 0, ease) + wobble;
      const c = lerp(start.c, 0, ease) - wobble;
      const d = lerp(start.d, 1, ease) + wobble;
      const tx = lerp(start.tx, 0, ease) + wobble * 10;
      const ty = lerp(start.ty, 0, ease) - wobble * 10;
      const clip = Math.max(0, start.clip * (1 - ease) + Math.abs(wobble) * 20);
      const opacity = Math.min(1, Math.max(0, start.opacity + (1 - start.opacity) * ease + wobble));
      const blur = Math.max(0, start.blur * (1 - ease) + Math.abs(wobble) * 3);
      state = {
        timeMs,
        dtMs,
        progress,
        text,
        matrix: `matrix(${a}, ${b}, ${c}, ${d}, ${tx}, ${ty})`,
        clipPath: `inset(${clip}%)`,
        opacity,
        filter: `blur(${blur}px)`,
        spring: { x: spring.x, v: spring.v },
        matrixValues: [a, b, c, d, tx, ty]
      };
    },
    snapshot() {
      track.snapshots++;
      return state;
    },
    dispose() {
      track.disposals++;
    }
  };
}

const tests = [];
let assertions = 0;
let passedAssertions = 0;
function test(name, fn) { tests.push({ name, fn }); }
function assert(condition, message) {
  assertions++;
  if (!condition) throw new Error(message);
  passedAssertions++;
}
function eq(actual, expected, message) {
  assert(Object.is(actual, expected), `${message}: expected ${String(expected)}, got ${String(actual)}`);
}
function closeTo(actual, expected, message, epsilon = 1e-9) {
  assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected} +/- ${epsilon}, got ${actual}`);
}
function throws(fn, type = Error, part = '') {
  let caught;
  try { fn(); } catch (error) { caught = error; }
  assert(caught instanceof type, `Expected ${type.name}, got ${String(caught)}`);
  if (part) assert(String(caught.message).includes(part), `Expected message containing "${part}"`);
  return caught;
}

test('exact cadence 1500ms@60fps has 91 snapshots and exact final', () => {
  const baker = new MotionBaker(() => createProbeSimulation());
  const frames = baker.bake(1500, 60);
  eq(frames.length, 91, 'snapshot count');
  eq(Math.ceil(1500 * 60 / 1000), 90, 'interval count');
  eq(frames[0].frameIndex, 0, 'first index');
  eq(frames[0].timeMs, 0, 'first time');
  eq(frames[90].frameIndex, 90, 'last index');
  eq(frames[90].timeMs, 1500, 'last time');
  eq(frames[90].state.progress, 1, 'last progress');
  closeTo(frames[1].state.dtMs, 1000 / 60, 'first dt');
});

test('full forward seekFrame walks every baked frame', () => {
  const baker = new MotionBaker(() => createProbeSimulation());
  const frames = baker.bake(1500, 60);
  for (let i = 0; i < frames.length; i++) assert(baker.seekFrame(i) === frames[i], `forward ${i}`);
});

test('full reverse seekFrame walks every baked frame', () => {
  const baker = new MotionBaker(() => createProbeSimulation());
  const frames = baker.bake(1500, 60);
  for (let i = frames.length - 1; i >= 0; i--) assert(baker.seekFrame(i) === frames[i], `reverse ${i}`);
});

test('repeated arbitrary seekFrame jumps clamp and remain immutable', () => {
  const baker = new MotionBaker(() => createProbeSimulation());
  const frames = baker.bake(500, 20);
  const picks = [0, 5, -3, 999, 5, 0, 12, 12];
  for (const pick of picks) {
    const expected = Math.max(0, Math.min(frames.length - 1, pick));
    assert(baker.seekFrame(pick) === frames[expected], `clamp ${pick}`);
  }
  assert(Object.isFrozen(frames) && Object.isFrozen(frames[0]), 'frames frozen');
});

test('seeking never evaluates simulation or random source', () => {
  const track = {};
  const baker = new MotionBaker(() => createDecoderSimulation(track));
  baker.bake(1500, 60);
  const before = { advances: track.advances, snapshots: track.snapshots, randomCalls: track.randomCalls };
  for (let i = 0; i < 100; i++) {
    baker.seekFrame(i % 91);
    baker.seekTime((i * 17.23) % 1500);
  }
  eq(track.advances, before.advances, 'advance calls');
  eq(track.snapshots, before.snapshots, 'snapshot calls');
  eq(track.randomCalls, before.randomCalls, 'random calls');
});

test('reroll changes random middle TEXT, not just numeric properties', () => {
  const baker = new MotionBaker(() => createDecoderSimulation());
  baker.bake(1500, 60);
  const first = baker.seekFrame(30).state.text;
  const firstMatrix = baker.seekFrame(30).state.matrix;
  baker.reroll();
  const second = baker.seekFrame(30).state.text;
  // Independent random draws can theoretically collide; no seed or mock is used.
  assert(first.length > 100, 'middle sample is long');
  assert(first !== second, 'middle samples should differ after fresh random reroll');
  assert(firstMatrix !== baker.seekFrame(30).state.matrix, 'fresh random matrix differs');
});

test('bake and reroll both converge final text and properties exactly', () => {
  const baker = new MotionBaker(() => createDecoderSimulation());
  baker.bake(1500, 60);
  const runs = [baker.frames, baker.reroll()];
  for (const frames of runs) {
    const last = frames[frames.length - 1];
    const state = last.state;
    eq(last.timeMs, 1500, 'endpoint');
    eq(state.text, TARGET, 'text');
    assert(TARGET.length > 100, 'long target');
    eq(state.matrix, FINAL_MATRIX, 'matrix');
    eq(state.clipPath, FINAL_CLIP, 'clipPath');
    eq(state.opacity, 1, 'opacity');
    eq(state.filter, FINAL_FILTER, 'filter');
    eq(state.progress, 1, 'progress');
  }
});

test('nested mutation throws TypeError on frozen state arrays', () => {
  const baker = new MotionBaker(() => createDecoderSimulation());
  const frames = baker.bake(750, 60);
  const frame = frames[frames.length - 1];
  assert(Object.isFrozen(frame.state.matrixValues), 'array frozen');
  throws(() => { frame.state.matrixValues[0] = 2; }, TypeError);
  throws(() => { frame.state.spring.x = 2; }, TypeError);
  throws(() => { frames.push(frame); }, TypeError);
});

test('reused mutable snapshot is deep-detached', () => {
  const shared = { value: 0 };
  const baker = new MotionBaker(() => ({
    advance({ timeMs }) { shared.value = timeMs; },
    snapshot() { return shared; },
    dispose() {}
  }));
  const frames = baker.bake(100, 10);
  eq(frames.length, 2, 'frame count');
  eq(frames[0].state.value, 0, 'initial detached');
  eq(frames[1].state.value, 100, 'final detached');
  shared.value = 999999;
  eq(frames[0].state.value, 0, 'initial remains detached');
  eq(frames[1].state.value, 100, 'final remains detached');
});

test('bad bake arguments fail before a factory is created', () => {
  let calls = 0;
  const baker = new MotionBaker(() => { calls++; return createProbeSimulation(); });
  const bad = [[0, 60], [-1, 60], [NaN, 60], [Infinity, 60], [100, 0], [100, -1], [100, NaN], [100, Infinity], ['10', 60]];
  for (const [duration, fps] of bad) throws(() => baker.bake(duration, fps), TypeError);
  eq(calls, 0, 'factory calls');
  assert(baker.frames === null, 'no frames');
});

test('fractional endpoint and final dt follow the actual duration', () => {
  const baker = new MotionBaker(() => createProbeSimulation());
  const frames = baker.bake(1000.5, 60);
  eq(frames.length, 62, 'snapshot count');
  eq(frames[61].timeMs, 1000.5, 'exact endpoint');
  eq(frames[61].state.progress, 1, 'final progress');
  closeTo(frames[1].state.dtMs, 1000 / 60, 'fixed dt');
  const finalDt = frames[61].state.dtMs;
  closeTo(finalDt, 1000.5 - frames[60].timeMs, 'final remainder');
  closeTo(finalDt, 0.5, 'fractional remainder');
  assert(finalDt > 0 && finalDt < 1000 / 60, 'final dt is partial');
});

test('short duration produces one interval and exact endpoint', () => {
  const baker = new MotionBaker(() => createProbeSimulation());
  const frames = baker.bake(5, 60);
  eq(frames.length, 2, 'two frames');
  eq(frames[1].timeMs, 5, 'endpoint');
  closeTo(frames[1].state.dtMs, 5, 'single dt');
  eq(frames[1].state.progress, 1, 'final progress');
});

test('failed bake preserves old frames/config and disposes atomically', () => {
  let failing = false;
  let disposals = 0;
  const baker = new MotionBaker(() => {
    let snapshots = 0;
    let state = { ok: true, timeMs: 0 };
    return {
      advance({ timeMs }) { state = { ok: true, timeMs }; },
      snapshot() {
        snapshots++;
        if (failing && snapshots === 3) return { bad: undefined };
        return state;
      },
      dispose() { disposals++; }
    };
  });
  const good = baker.bake(100, 10);
  const oldConfig = baker.config;
  failing = true;
  disposals = 0;
  throws(() => baker.bake(500, 10), TypeError, 'undefined');
  assert(baker.frames === good, 'old frames preserved');
  eq(baker.config.durationMs, oldConfig.durationMs, 'old duration');
  eq(baker.config.fps, oldConfig.fps, 'old fps');
  eq(disposals, 1, 'failed bake disposed');
});

test('reroll preserves custom fps and cadence', () => {
  const track = {};
  const baker = new MotionBaker(() => createProbeSimulation(track));
  const first = baker.bake(1000, 30);
  eq(first.length, 31, 'first cadence');
  const second = baker.reroll();
  eq(second.length, 31, 'reroll cadence');
  eq(second[30].timeMs, 1000, 'reroll endpoint');
  closeTo(second[1].state.dtMs, 1000 / 30, 'reroll dt');
  eq(baker.config.fps, 30, 'fps persisted');
});

test('seekTime binary search chooses at-or-before including endpoint', () => {
  const baker = new MotionBaker(() => createProbeSimulation());
  const frames = baker.bake(1500, 60);
  const probes = [-1, 0, 1, 16.666, 50, 100.1, 777.7, 1499.9, 1500, 1501];
  for (const time of probes) {
    const frame = baker.seekTime(time);
    if (time <= 0) assert(frame === frames[0], `low clamp ${time}`);
    if (time >= 0) {
      assert(frame.timeMs <= time, `at-or-before ${time}`);
      if (frame.frameIndex < frames.length - 1) {
        assert(frames[frame.frameIndex + 1].timeMs > time, `next is after ${time}`);
      }
    }
  }
  assert(baker.seekTime(frames[10].timeMs) === frames[10], 'exact timestamp');
  eq(baker.seekTime(350).frameIndex, 21, '350ms is frame 21');
});

test('snapshot cap rejects more than 100000 frames before simulation starts', () => {
  let calls = 0;
  const baker = new MotionBaker(() => { calls++; return createProbeSimulation(); });
  throws(() => baker.bake(100000, 1000), RangeError, '100000');
  eq(calls, 0, 'factory calls');
});

test('reentrant bake is rejected while another bake is busy', () => {
  let baker;
  let busyError;
  const factory = () => {
    let advanced = false;
    return {
      advance() {
        if (!advanced) {
          advanced = true;
          try { baker.bake(10, 10); } catch (error) { busyError = error; }
        }
      },
      snapshot() { return { ok: true }; },
      dispose() {}
    };
  };
  baker = new MotionBaker(factory);
  baker.bake(30, 10);
  assert(busyError instanceof Error, 'reentrant error captured');
  assert(/in progress/i.test(busyError.message), 'busy message');
});

test('dispose runs exactly once on success and on reroll', () => {
  let disposals = 0;
  const baker = new MotionBaker(() => ({
    advance() {},
    snapshot() { return { ok: true }; },
    dispose() { disposals++; }
  }));
  baker.bake(100, 10);
  eq(disposals, 1, 'first dispose');
  baker.reroll();
  eq(disposals, 2, 'reroll dispose');
});

test('deepFreeze freezes nested arrays and tolerates cycles', () => {
  const root = { a: { arr: [1, { b: 2 }] } };
  root.self = root;
  deepFreeze(root);
  assert(Object.isFrozen(root), 'root frozen');
  assert(Object.isFrozen(root.a), 'nested object frozen');
  assert(Object.isFrozen(root.a.arr), 'array frozen');
  assert(Object.isFrozen(root.a.arr[1]), 'nested array object frozen');
  throws(() => { root.a.arr[0] = 9; }, TypeError);
});

test('seek and reroll before bake throw cleanly', () => {
  const baker = new MotionBaker(() => createProbeSimulation());
  throws(() => baker.seekFrame(0), Error, 'No frames');
  throws(() => baker.seekTime(0), Error, 'No frames');
  throws(() => baker.reroll(), Error, 'No bake');
  assert(baker.frames === null, 'frames null');
});

test('seekFrame and seekTime validate inputs after bake', () => {
  const baker = new MotionBaker(() => createProbeSimulation());
  baker.bake(100, 10);
  throws(() => baker.seekFrame(0.5), TypeError);
  throws(() => baker.seekFrame(NaN), TypeError);
  throws(() => baker.seekTime(NaN), TypeError);
  throws(() => baker.seekTime(Infinity), TypeError);
  eq(baker.seekFrame(-999).frameIndex, 0, 'negative clamp');
  eq(baker.seekFrame(999).frameIndex, 1, 'positive clamp');
});

test('random text and matrices replay byte-identically forward/reverse/jumps', () => {
  const track = {};
  const baker = new MotionBaker(() => createDecoderSimulation(track));
  const frames = baker.bake(1500);
  const serialized = frames.map(frame => JSON.stringify(frame));
  const before = { ...track };
  for (let i = 0; i < frames.length; i++) {
    eq(JSON.stringify(baker.seekFrame(i)), serialized[i], `forward random state ${i}`);
  }
  for (let i = frames.length - 1; i >= 0; i--) {
    eq(JSON.stringify(baker.seekFrame(i)), serialized[i], `reverse random state ${i}`);
  }
  for (const i of [21, 80, 3, 21, 0, 90, 21, 45, 3, 21]) {
    eq(JSON.stringify(baker.seekFrame(i)), serialized[i], `jump random state ${i}`);
    eq(JSON.stringify(baker.seekTime(frames[i].timeMs)), serialized[i], `time random state ${i}`);
  }
  eq(JSON.stringify(track), JSON.stringify(before), 'replay has no simulator side effects');
  assert(track.randomCalls > 0, 'real random source used during bake');
  assert(frames.every(f => Number.isFinite(f.state.spring.x) && Number.isFinite(f.state.spring.v)), 'finite physical state');
  assert(new Set(frames.map(f => f.state.matrix)).size > 20, 'transform evolves');
  eq(JSON.stringify(JSON.parse(JSON.stringify(frames))), JSON.stringify(frames), 'JSON round-trip');
});

test('factory/advance/snapshot/dispose failures preserve prior bake and release busy guard', () => {
  let phase = '';
  let disposed = 0;
  const baker = new MotionBaker(() => {
    if (phase === 'factory') throw new Error('factory');
    return {
      advance() { if (phase === 'advance') throw new Error('advance'); },
      snapshot() {
        if (phase === 'snapshot') throw new Error('snapshot');
        return { ok: true };
      },
      dispose() { disposed++; if (phase === 'dispose') throw new Error('dispose'); }
    };
  });
  for (const failingPhase of ['factory', 'advance', 'snapshot', 'dispose']) {
    phase = '';
    const good = baker.bake(100, 30);
    const cleanupBefore = disposed;
    phase = failingPhase;
    throws(() => baker.bake(500, 60), Error, phase);
    assert(baker.frames === good, `${phase}: prior frames survive`);
    eq(baker.config.durationMs, 100, `${phase}: prior duration survives`);
    eq(baker.config.fps, 30, `${phase}: prior fps survives`);
    eq(disposed - cleanupBefore, phase === 'factory' ? 0 : 1, `${phase}: cleanup exactly once`);
    phase = '';
    eq(baker.reroll().at(-1).timeMs, 100, 'reroll recovers with prior config');
  }
});

test('falsy thrown values cannot silently commit a failed bake', () => {
  let failing = false;
  let phase = 'advance';
  let thrown;
  const baker = new MotionBaker(() => {
    if (failing && phase === 'factory') throw thrown;
    return {
      advance() { if (failing && phase === 'advance') throw thrown; },
      snapshot() {
        if (failing && phase === 'snapshot') throw thrown;
        return { ok: true };
      },
      dispose() { if (failing && phase === 'dispose') throw thrown; }
    };
  });
  const good = baker.bake(100, 10);
  for (phase of ['factory', 'advance', 'snapshot', 'dispose']) {
    for (thrown of [null, undefined, 0, false, '']) {
      failing = true;
      let didThrow = false;
      let caught;
      try { baker.bake(500); } catch (error) { didThrow = true; caught = error; }
      assert(didThrow, `${phase}: falsy failure propagates`);
      eq(caught, thrown, 'original failure preserved');
      assert(baker.frames === good, 'prior frames preserved');
      eq(baker.config.durationMs, 100, 'prior configuration preserved');
    }
  }
});

test('invalid JSON states reject without freezing simulator-owned input', () => {
  const cycle = {}; cycle.self = cycle;
  const extraArray = [1]; extraArray.extra = 2;
  const symbolArray = [1]; symbolArray[Symbol('secret')] = 2;
  let getterCalls = 0;
  const accessor = { get x() { getterCalls++; return 1; } };
  const invalidStates = [undefined, { x: undefined }, { x: NaN }, { x: Infinity },
    { x: () => 1 }, { x: 1n }, new Date(), new Map(), cycle, [, 1],
    extraArray, symbolArray, { [Symbol('x')]: 1 }, accessor];
  for (const state of invalidStates) {
    let disposed = 0;
    const baker = new MotionBaker(() => ({
      advance() {}, snapshot() { return state; }, dispose() { disposed++; }
    }));
    throws(() => baker.bake(100), TypeError);
    eq(disposed, 1, 'invalid snapshot disposed');
    eq(baker.frames, null, 'no partial commit');
    if (state && typeof state === 'object') assert(!Object.isFrozen(state), 'input not frozen');
  }
  eq(getterCalls, 0, 'snapshot accessors never executed');
});

test('nested snapshot aliases are detached and frames cannot be reassigned', () => {
  const nested = { nodes: { title: { textContent: 'initial', style: { opacity: 0 } } }, values: [0] };
  const baker = new MotionBaker(() => ({
    advance({ progress }) {
      nested.nodes.title.textContent = 'final';
      nested.nodes.title.style.opacity = progress;
      nested.values[0] = progress;
    },
    snapshot() { return nested; }
  }));
  const frames = baker.bake(100, 10);
  nested.nodes.title.textContent = 'external pollution';
  nested.values.push(9);
  eq(frames[0].state.nodes.title.textContent, 'initial', 'nested initial detached');
  eq(frames[1].state.nodes.title.textContent, 'final', 'nested final detached');
  eq(frames[0].state.values.length, 1, 'array detached');
  throws(() => { baker.frames = []; }, TypeError);
  throws(() => { baker.config = null; }, TypeError);
  throws(() => { frames[0].state.nodes.title.style.opacity = 9; }, TypeError);
  throws(() => { frames[0].timeMs = 9; }, TypeError);
});

test('invalid factory contracts clean up and validation preserves prior bake', () => {
  throws(() => new MotionBaker(null), TypeError);
  let invalid = false;
  let disposed = 0;
  const baker = new MotionBaker(() => invalid ? {
    dispose() { disposed++; }
  } : createProbeSimulation());
  const good = baker.bake(100);
  invalid = true;
  throws(() => baker.bake(200), TypeError, 'advance');
  eq(disposed, 1, 'invalid simulation disposed');
  assert(baker.frames === good, 'factory contract failure preserves frames');
  throws(() => baker.bake(-1), TypeError);
  assert(baker.frames === good, 'invalid args preserve frames');
});

if (require.main === module) {
  let passed = 0;
  for (let i = 0; i < tests.length; i++) {
    const entry = tests[i];
    try {
      entry.fn();
      passed++;
      console.log(`PASS ${i + 1} - ${entry.name}`);
    } catch (error) {
      console.error(`FAIL ${i + 1} - ${entry.name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }
  console.log(`${passed}/${tests.length} PASS`);
  console.log(`Assertions: ${passedAssertions}/${assertions} PASS`);
  if (passed !== tests.length) process.exitCode = 1;
}

module.exports = { MotionBaker, deepFreeze };
