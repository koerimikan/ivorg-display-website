import { gsap } from 'gsap';
import { MotionBaker } from './motion-baker.js';
import {
  createEntranceTimeline, createWipeTimeline, createDecodeDriver,
  pickPoster, stopLiveEntrance, stopLiveWipe
} from '../scripts/motion.js';

const TARGETS = '.reveal,.feature-poster,.bulletin-poster,.cover-face,.track-row,.index-title,.reader-body>h2,.reader-deck,[data-decode]';
const SVG_ATTRIBUTES = ['stroke-dasharray', 'stroke-dashoffset', 'transform', 'opacity'];

function readNode(node) {
  const state = { style: node.getAttribute('style'), attributes: {} };
  if (node.hasAttribute('data-decode')) state.textContent = node.textContent;
  if (node instanceof SVGElement) {
    for (const key of SVG_ATTRIBUTES) state.attributes[key] = node.getAttribute(key);
  }
  return state;
}

// Project stored state onto the original nodes. No GSAP evaluation or navigation here.
export function projectFrame(nodes, frame) {
  if (frame.state.nodes.length !== nodes.length) throw new Error('Scene node map is stale');
  if (nodes.some(node => !node.isConnected)) throw new Error('Scene detached; bake again');
  nodes.forEach((node, index) => {
    const state = frame.state.nodes[index];
    if (state.style === null) node.removeAttribute('style');
    else node.setAttribute('style', state.style);
    if ('textContent' in state) node.textContent = state.textContent;
    for (const [key, value] of Object.entries(state.attributes)) {
      if (value === null) node.removeAttribute(key);
      else node.setAttribute(key, value);
    }
    // GSAP must re-read transforms when normal animations resume after inline projection.
    if (node._gsap) node._gsap.uncache = 1;
  });
}

export function createStageSession(scene = 'entrance') {
  stopLiveEntrance();
  stopLiveWipe();
  const root = document.getElementById('page-content');
  const wipe = document.getElementById('page-wipe');
  if (!root || !wipe) throw new Error('Page is not ready');
  const nodes = [...new Set([...root.querySelectorAll(TARGETS), wipe, ...wipe.querySelectorAll('*')])];
  const baseline = { state: { nodes: nodes.map(readNode) } };
  let disposed = false;
  const restore = () => {
    if (nodes.every(node => node.isConnected)) projectFrame(nodes, baseline);
  };
  const baker = new MotionBaker(() => {
    restore();
    let master;
    let decoder;
    let context;
    try {
      context = gsap.context(() => {
        master = gsap.timeline({ paused: true });
        if (scene !== 'wipe') {
          master.add(createEntranceTimeline(root, { clear: false }), 0);
          decoder = createDecodeDriver(root, { random: true });
          decoder.advance(0); // Real random initial state, captured by frame zero.
        }
        if (scene !== 'entrance') {
          pickPoster(wipe);
          wipe.style.visibility = 'visible';
          master.add(createWipeTimeline(wipe, true), 0);
          master.add(createWipeTimeline(wipe, false, { immediateRender: false }), .72);
        }
        master.totalTime(0, true);
      });
      return {
        advance({ timeMs }) {
          master.totalTime(timeMs / 1000, true);
          decoder?.advance(timeMs);
          if (scene !== 'entrance') wipe.style.visibility = timeMs >= 1500 ? 'hidden' : 'visible';
        },
        snapshot() { return { nodes: nodes.map(readNode) }; },
        dispose() { context.revert(); restore(); }
      };
    } catch (error) {
      master?.kill(); context?.revert(); restore(); throw error;
    }
  });
  return {
    baker,
    bake(reroll = false) {
      if (disposed) throw new Error('Scene disposed');
      return reroll && baker.frames ? baker.reroll() : baker.bake(1500, 60);
    },
    project(frame) {
      if (disposed) throw new Error('Scene disposed');
      projectFrame(nodes, frame);
    },
    dispose() { if (disposed) return; disposed = true; restore(); }
  };
}
