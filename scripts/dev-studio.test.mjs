// Pure Node contract tests; does not launch or control a browser.
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { MotionBaker } from '../src/dev-studio/motion-baker.js';
import reference from '../motion-baker.test.cjs';

globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
globalThis.matchMedia = () => Object.assign(new EventTarget(), { matches: false });
const raf = new Map();
let nextRaf = 0;
globalThis.requestAnimationFrame = callback => { raf.set(++nextRaf, callback); return nextRaf; };
globalThis.cancelAnimationFrame = id => raf.delete(id);
const { createController } = await import('../src/dev-studio/controller.js');
const { projectFrame } = await import('../src/dev-studio/scene.js');
after(() => { raf.clear(); });

function fixture() {
  const tracking = { instances: 0, advances: 0, disposed: 0, projections: 0, random: 0 };
  const controller = createController({ createSession(scene) {
    tracking.instances++;
    const baker = new MotionBaker(() => {
      let value = Math.random(); tracking.random++;
      return {
        advance({ timeMs }) { tracking.advances++; value += timeMs; },
        snapshot() { return { scene, value }; }
      };
    });
    return {
      baker,
      bake(reroll) { return reroll && baker.frames ? baker.reroll() : baker.bake(1500); },
      project(frame) { tracking.projections++; tracking.last = frame; },
      dispose() { tracking.disposed++; }
    };
  } });
  return { controller, tracking };
}

test('browser engine matches Stage 1 reference with stateful fixed-step input', () => {
  const factory = () => {
    let sum = 0;
    return {
      advance({ dtMs }) { sum += dtMs * .37; },
      snapshot() { return { nested: { sum }, values: [sum] }; }
    };
  };
  const browser = new MotionBaker(factory), original = new reference.MotionBaker(factory);
  assert.deepEqual(browser.bake(1000.5), original.bake(1000.5));
  assert.deepEqual(browser.seekTime(350), original.seekTime(350));
  assert.throws(() => { browser.frames[0].state.nested.sum = 1; }, TypeError);
});

test('stage mode eagerly acquires scene; physics restores it', () => {
  const { controller: c, tracking: t } = fixture();
  try {
    c.setMode('stage'); assert.equal(t.instances, 1);
    c.bake(); assert.equal(c.getState().lastFrame, 90);
    c.setMode('physics'); assert.equal(t.disposed, 1);
    assert.equal(c.getState().hasFrames, false);
  } finally { c.dispose(); }
});

test('scrub and steps project existing frames without simulation or new randomness', () => {
  const { controller: c, tracking: t } = fixture();
  try {
    c.setMode('stage'); c.bake();
    const advances = t.advances, random = t.random;
    c.seekFrame(21); const expected = t.last;
    c.step(1); c.step(-1);
    assert.strictEqual(t.last, expected);
    assert.equal(c.getState().timeMs, 350);
    assert.equal(t.advances, advances); assert.equal(t.random, random);
    c.bake(true); assert.equal(t.random, random + 1);
  } finally { c.dispose(); }
});

test('physics parameters are bounded and cannot change during stage', () => {
  const { controller: c } = fixture();
  try {
    c.setPhysics({ factor: 9, tau: -1, orbit: true });
    assert.equal(c.getState().factor, 3); assert.equal(c.getState().tau, 20);
    c.setMode('stage'); c.setPhysics({ factor: 1, orbit: false });
    assert.equal(c.getState().factor, 3); assert.equal(c.getState().orbit, true);
  } finally { c.dispose(); }
});

test('playback speed and reverse select baked frames and dispose cancels RAF', () => {
  const { controller: c, tracking: t } = fixture();
  try {
    c.setMode('stage'); c.bake(); c.seekFrame(30);
    c.setDirection(-1); c.setSpeed(.1); c.togglePlay();
    const callback = [...raf.values()].at(-1); raf.clear();
    const before = t.advances;
    callback(performance.now() + 200);
    assert(c.getState().frame < 30);
    assert.equal(t.advances, before);
    c.step(1); assert.equal(c.getState().playing, false);
    assert.equal(raf.size, 0);
  } finally { c.dispose(); }
});

test('resize invalidates stale frames; navigation preparation exits stage safely', () => {
  const { controller: c, tracking: t } = fixture();
  try {
    c.setMode('stage'); c.bake(); window.dispatchEvent(new Event('resize'));
    assert.equal(c.getState().hasFrames, false); assert.match(c.getState().error, /Viewport/);
    assert.equal(t.disposed, 1);
    c.bake(); document.dispatchEvent(new Event('astro:before-preparation'));
    assert.equal(c.getState().mode, 'physics'); assert.equal(t.disposed, 2);
  } finally { c.dispose(); }
});

test('stage suppresses page clicks, allows HUD controls, and removes handlers on disposal', () => {
  const { controller: c } = fixture();
  c.setMode('stage');
  const pageClick = new Event('click', { cancelable: true });
  window.dispatchEvent(pageClick); assert.equal(pageClick.defaultPrevented, true);
  const hudClick = new Event('click', { cancelable: true });
  hudClick.composedPath = () => [{ localName: 'dev-studio-hud' }];
  window.dispatchEvent(hudClick); assert.equal(hudClick.defaultPrevented, false);
  c.dispose();
  const normalClick = new Event('click', { cancelable: true });
  window.dispatchEvent(normalClick); assert.equal(normalClick.defaultPrevented, false);
});

test('scope mode locks page navigation but leaves pointer events and panel controls available',()=>{
  const {controller:c}=fixture();
  let frozen=false;
  const listener=event=>{frozen=event.detail==='stage';};window.addEventListener('dev-studio:mode',listener);
  try{
    c.setMode('scope');assert.equal(frozen,true);
    const click=new Event('click',{cancelable:true});window.dispatchEvent(click);assert.equal(click.defaultPrevented,true);
    let moved=false;const observe=()=>{moved=true;};window.addEventListener('pointermove',observe,{once:true});window.dispatchEvent(new Event('pointermove'));assert.equal(moved,true);
    const panel=new Event('click',{cancelable:true});panel.composedPath=()=>[{hasAttribute:key=>key==='data-dev-studio-ui'}];window.dispatchEvent(panel);assert.equal(panel.defaultPrevented,false);
    c.setMode('physics');assert.equal(frozen,false);
  }finally{c.dispose();window.removeEventListener('dev-studio:mode',listener);}
});

test('DOM projection restores inline attributes/text and never evaluates animations', () => {
  const attributes = new Map([['style', 'old'], ['stroke-dashoffset', '9']]);
  const node = {
    isConnected: true, textContent: 'old', _gsap: { uncache: 0 },
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key)
  };
  const frame = { state: { nodes: [{ style: null, textContent: 'baked', attributes: { 'stroke-dashoffset': '3' } }] } };
  projectFrame([node], frame);
  assert.equal(attributes.has('style'), false); assert.equal(node.textContent, 'baked');
  assert.equal(attributes.get('stroke-dashoffset'), '3'); assert.equal(node._gsap.uncache, 1);
  node.isConnected = false;
  assert.throws(() => projectFrame([node], frame), /detached/);
  assert.throws(() => projectFrame([], frame), /stale/);
});

test('home physics cancels RAF and detaches pointer on stage; restores once on exit', async () => {
  const file = new URL('../src/scripts/home.js', import.meta.url);
  const source = (await readFile(file, 'utf8'))
    .replace("'./motion.js'", JSON.stringify(new URL('../src/scripts/motion.js', import.meta.url).href))
    .replaceAll('import.meta.env.DEV', 'true');
  const { mountHome } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const { preferences } = await import('../src/scripts/motion.js');
  const previousBody = document.body;
  document.body = { hasAttribute: () => false };
  const stage = new EventTarget(), stack = new EventTarget();
  const labels = new Map();
  stack.style = {}; stack.dataset = {};
  stage.querySelector = key => { if (!labels.has(key)) labels.set(key, { textContent: '' }); return labels.get(key); };
  stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
  const root = { querySelector: key => key === '#home-foci' ? stage : stack };
  const mode = value => window.dispatchEvent(new CustomEvent('dev-studio:mode', { detail: value }));
  const cleanup = mountHome(root);
  try {
    assert.equal(raf.size, 1);
    window.dispatchEvent(new CustomEvent('dev-studio:physics', { detail: { orbit: true, factor: 2, tau: 200 } }));
    const callback = [...raf.values()][0]; raf.clear(); callback(performance.now() + 100);
    assert.match(stack.style.transform, /translate3d/);
    mode('stage'); assert.equal(raf.size, 0); assert.equal(stack.style.transform, 'none');
    const before = [...labels.values()].map(label => label.textContent);
    const pointer = new Event('pointermove'); pointer.clientX = 99; pointer.clientY = 99;
    stage.dispatchEvent(pointer);
    assert.deepEqual([...labels.values()].map(label => label.textContent), before);
    mode('physics'); assert.equal(raf.size, 1);
    mode('physics'); assert.equal(raf.size, 1);
    assert.equal(preferences.motion, true);
  } finally { cleanup(); document.body = previousBody; }
  assert.equal(raf.size, 0);
});

test('HUD entry is dev-only and production output has no studio runtime', async () => {
  const layout = await readFile(new URL('../src/layouts/SiteLayout.astro', import.meta.url), 'utf8');
  assert.match(layout, /if \(import\.meta\.env\.DEV\) import\('\.\.\/dev-studio\/index\.js'\)/);
  const { readdir } = await import('node:fs/promises');
  const root = new URL('../dist/', import.meta.url);
  async function inspect(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) await inspect(url);
      else if (/\.(html|js|css)$/.test(entry.name)) {
        const content = await readFile(url, 'utf8');
        assert.doesNotMatch(content, /dev-studio|Baked Timeline|MotionBaker|dev-studio:physics/);
      }
    }
  }
  await inspect(root);
});
