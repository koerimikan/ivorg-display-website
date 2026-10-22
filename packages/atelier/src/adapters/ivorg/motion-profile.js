// Explicit development registry. Selectors refer to real interfaces in motion.js/home.js.
export const MOTION_BINDINGS = Object.freeze([
  { id: 'entrance', selector: '.reveal,.feature-poster,.bulletin-poster,.cover-face,.track-row,.index-title,.reader-deck', sourceFiles: ['src/scripts/motion.js'], constraints: ['Preserve createEntranceTimeline() and Astro page cleanup; support reduced motion.'] },
  { id: 'decode', selector: '[data-decode]', sourceFiles: ['src/scripts/motion.js'], constraints: ['Preserve createDecodeDriver(), target text and random baked-frame replay.'] },
  { id: 'parallax', selector: '#poster-stack', sourceFiles: ['src/scripts/home.js'], constraints: ['Preserve mountHome() damping, pointer/Auto-Orbit input, and Stage/Edit/Scope RAF suspension.'] },
  { id: 'wipe', selector: '#page-wipe', sourceFiles: ['src/scripts/motion.js'], constraints: ['Preserve createWipeTimeline(), wipe() Promise lifecycle and route cancellation; do not navigate during baked replay.'] }
].map(binding => Object.freeze({ ...binding, sourceFiles: Object.freeze(binding.sourceFiles), constraints: Object.freeze(binding.constraints) })));

export function collectMotionContext(roots) {
  return MOTION_BINDINGS.filter(binding => roots.some(root =>
    root.matches(binding.selector) || root.querySelector(binding.selector) || root.closest(binding.selector)
  ));
}
