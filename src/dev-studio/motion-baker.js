// Browser port of the Stage 1 verified engine; tested against its CommonJS reference.
const MAX_SNAPSHOTS = 100000;
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


export { MotionBaker, deepFreeze };
