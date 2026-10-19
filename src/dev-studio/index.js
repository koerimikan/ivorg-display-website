import { createController } from './controller.js';
import { mountHUD } from './hud.js';
import { mountSourceEditor } from './source-editor.js';
import { mountAgentScope } from './agent-scope.js';

const controller = createController();
function mount() {
  const removeHUD = mountHUD(controller);
  const removeEditor = mountSourceEditor(controller);
  const removeScope = mountAgentScope(controller);
  return () => { removeScope(); removeEditor(); removeHUD(); };
}
let unmount = mount();
const lifecycle = new AbortController();
document.addEventListener('astro:before-swap', () => { unmount(); }, { signal: lifecycle.signal });
document.addEventListener('astro:page-load', () => {
  if (!document.querySelector('dev-studio-hud')) unmount = mount();
}, { signal: lifecycle.signal });
if (import.meta.hot) {
  import.meta.hot.dispose(() => { unmount(); controller.dispose(); lifecycle.abort(); });
}
