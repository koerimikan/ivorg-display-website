import { MotionBaker } from '../../dev-studio/motion-baker.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createPosterDeck(seed, count = 4) {
  if (!Number.isInteger(count) || count < 1 || count > 128) throw new RangeError('Invalid deck size');
  const rng = mulberry32(seed); let deck = [], cursor = 0, last = -1, draws = 0;
  return {
    next() {
      if (cursor === deck.length) {
        deck = Array.from({ length: count }, (_, i) => i);
        for (let i = count - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
        if (count > 1 && deck[0] === last) [deck[0], deck[1]] = [deck[1], deck[0]];
        cursor = 0;
      }
      last = deck[cursor++]; draws++; return last;
    },
    get cursor() { return draws; }
  };
}

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(canonical(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
const clean = n => Number(n.toFixed(6));
const clamp = n => Math.max(0, Math.min(1, n));
const expo = p => p === 1 ? 1 : 1 - 2 ** (-10 * p);

export function createFixtureSession(sessionId) {
  if (typeof sessionId !== 'string' || !/^[a-zA-Z][a-zA-Z0-9._-]{1,100}$/.test(sessionId)) throw new TypeError('Invalid sessionId');
  let instanceSeq = 0, artifact = null, baker = null, currentInput = null, deckCursor = 0, generation = 0;
  return {
    get artifact() { return artifact; },
    get deckCursor() { return deckCursor; },
    async bake(input) {
      const ownGeneration = ++generation;
      const { binding, definition, seed = 1, viewport = { w: 960, h: 540, frameZoom: 1, dpr: 1 }, deckCursorAtStart = 0 } = input;
      if (!binding || binding.fields.enabled !== 'true' || definition?.objectId !== binding.fields.definitionRef) throw new TypeError('Invalid enabled binding/definition');
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isInteger(deckCursorAtStart) || deckCursorAtStart < 0 || deckCursorAtStart > 10000) throw new RangeError('Invalid seed/cursor');
      if (!['w','h','frameZoom','dpr'].every(k => Number.isFinite(viewport[k]) && viewport[k] > 0) || viewport.w > 8192 || viewport.h > 8192) throw new RangeError('Invalid viewport');
      const params = Object.fromEntries(Object.entries(definition.params).map(([name, p]) => [name, p.value]));
      const keyInput = { fixtureRevision: 'sanitized-p1-v1', specHash: input.specHash, sourceRevision: input.sourceRevision, targetRevision: input.targetRevision,
        definitionRevision: await digest(definition), params, seed, viewport, assets: 'sanitized-vector-no-external-assets-v1', deckCursorAtStart,
        sourcePage: binding.fields.fromPage, targetPage: binding.fields.toPage, effect: binding.fields.effect, posterCount: input.posterCount || 4 };
      for (const field of ['specHash', 'sourceRevision', 'targetRevision']) if (!/^[a-f0-9]{64}$/.test(keyInput[field])) throw new TypeError(`Missing ${field}`);
      const nextKey = await digest(keyInput);
      const deck = createPosterDeck(seed, input.posterCount || 4);
      for (let i = 0; i < deckCursorAtStart; i++) deck.next();
      const poster = deck.next();
      const localRng = mulberry32(seed ^ 0x91e10da5);
      const noise = Array.from({ length: 91 }, () => Math.floor(localRng() * 36).toString(36).toUpperCase());
      const kind = binding.fields.effect, symbol = definition.fields.implSymbol;
      if (!['createWipeTimeline', 'createDecodeDriver', 'createEntranceTimeline'].includes(symbol)) throw new TypeError('Unsupported P1 fixture definition');
      const duration = Math.max(1500, Number(params.durationMs || params.revealDurationMs || 0));
      if (!Number.isFinite(duration) || duration > 5000) throw new RangeError('Invalid duration');
      const nextBaker = new MotionBaker(() => {
        let timeMs = 0;
        return {
          advance(tick) { timeMs = tick.timeMs; },
          snapshot() {
            const progress = clamp(timeMs / duration), cover = expo(clamp(timeMs / Number(params.durationMs || 560)));
            const uncover = expo(clamp((timeMs - 720) / 780));
            const stage = kind === 'uncover' ? expo(clamp(timeMs / Number(params.durationMs || 780))) : cover;
            const overlay = kind === 'inPlace' ? 0 : kind === 'uncover' ? 1 - stage : timeMs <= 720 ? stage : 1 - uncover;
            return { progress: clean(progress), sourceVisible: timeMs < 720, targetVisible: timeMs >= 720, poster,
              overlay: clean(overlay), clipRight: clean(118 * overlay), stripX: clean((kind === 'uncover' ? -8 : 8) * (1 - expo(clamp(timeMs / 850)))),
              itemY: clean(26 * (1 - expo(clamp(timeMs / Number(params.itemDurationMs || 950))))),
              itemOpacity: clean(expo(clamp(timeMs / Number(params.itemDurationMs || 950)))),
              decode: symbol === 'createDecodeDriver' && timeMs < Number(params.durationMs || 650) ? `FIXTURE-${noise[Math.min(90, Math.floor(progress * 90))]}` : 'FIXTURE',
              scene: symbol, parallax: 'excluded', sourcePage: binding.fields.fromPage, targetPage: binding.fields.toPage };
          }
        };
      });
      const frames = nextBaker.bake(duration, 60), checksum = await digest(frames);
      if (ownGeneration !== generation) throw new Error('Fixture superseded');
      instanceSeq++;
      const instance = Object.freeze({ instanceId: `ti.${sessionId}.${instanceSeq}`, sessionId, instanceSeq,
        bindingRef: binding.objectId, definitionRef: definition.objectId, deckCursorAtStart, recordedBy: 'fixture' });
      artifact = Object.freeze({ bakeKey: nextKey, checksum, frames, instance, seed, viewport: Object.freeze({ ...viewport }),
        markers: Object.freeze([{ atMs: 0, kind: 'cover' }, { atMs: 720, kind: 'swap' }, { atMs: 1500, kind: 'settle' }]),
        environment: 'normalized-vector-p1-v1', params: Object.freeze(params) });
      baker = nextBaker; deckCursor = deck.cursor; currentInput = structuredClone({ ...input, seed });
      return artifact;
    },
    seekFrame(index) { if (!baker) throw new Error('Bake first'); return baker.seekFrame(index); },
    seekTime(ms) { if (!baker) throw new Error('Bake first'); return baker.seekTime(ms); },
    reroll() { if (!currentInput) throw new Error('Bake first'); return this.bake({ ...currentInput, seed: (currentInput.seed + 1) >>> 0 }); }
  };
}
