// Minimal track preview player for /discography/.
// One shared <audio> element, one active track, user gesture required.
// The controller is owned by the page lifecycle: app.js mounts it on
// astro:page-load and its cleanup runs on astro:before-swap, so a preview
// never keeps playing (or stacks) across ClientRouter navigations.

export function createPreviewController({ root, createAudio = () => new Audio(), announce = () => {} }) {
  const buttons = [...root.querySelectorAll('button.track-play[data-preview]')];
  if (!buttons.length) return () => {};
  const audio = createAudio();
  audio.preload = 'none';
  let active = null;

  function setState(button, playing) {
    button.setAttribute('aria-pressed', String(playing));
    button.closest('tr')?.classList.toggle('is-playing', playing);
  }
  function stop() {
    if (active) setState(active, false);
    active = null;
    audio.pause();
  }
  async function toggle(button) {
    if (active === button && !audio.paused) { stop(); return; }
    if (active && active !== button) setState(active, false);
    active = button;
    const src = button.dataset.preview;
    if (audio.getAttribute('src') !== src) audio.setAttribute('src', src);
    setState(button, true);
    try {
      await audio.play();
      announce('Playing preview: ' + (button.querySelector('.track-name')?.textContent || ''));
    } catch {
      if (active === button) stop();
      announce('Preview could not be played.');
    }
  }
  const onClick = event => {
    const button = event.target.closest?.('button.track-play[data-preview]');
    if (button && root.contains(button)) { event.preventDefault(); void toggle(button); }
  };
  const onEnded = () => stop();
  const onError = () => { if (active) { stop(); announce('Preview could not be loaded.'); } };
  root.addEventListener('click', onClick);
  audio.addEventListener('ended', onEnded);
  audio.addEventListener('error', onError);
  return function cleanup() {
    root.removeEventListener('click', onClick);
    audio.removeEventListener('ended', onEnded);
    audio.removeEventListener('error', onError);
    stop();
    audio.removeAttribute('src');
    audio.load?.();
  };
}

export function mountAudioPreview(root) {
  const toast = document.getElementById('toast');
  return createPreviewController({ root, announce: text => { if (toast) toast.textContent = text; } });
}
