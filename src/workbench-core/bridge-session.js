import { PREVIEW_ORIGIN, acceptBridgeMessage } from './bridge.js';
const failure = code => Object.assign(Error(code), { code });

export function createBridgeSession({ source, send, nonce = () => crypto.randomUUID(), onMessage = () => {}, onState = () => {} }) {
  let expected, connected = false, retryTimer, attempts = 0, disposed = false;
  const pending = new Map();
  function dropPending(code) { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(failure(code)); } pending.clear(); }
  function connect() {
    if (disposed) return;
    clearInterval(retryTimer); dropPending('EPOCH'); connected = false; attempts = 0;
    expected = { origin: PREVIEW_ORIGIN, source, frameEpoch: (expected?.frameEpoch || 0) + 1, nonce: nonce(), docRevision: null };
    const init = () => {
      if (connected || ++attempts > 20) { clearInterval(retryTimer); if (!connected) onState('BRIDGE_UNAVAILABLE'); return; }
      send({ schemaVersion: 1, kind: 'init', frameEpoch: expected.frameEpoch, sessionNonce: expected.nonce });
    };
    init(); retryTimer = setInterval(init, 250);
  }
  function receive(event) {
    if (!expected || disposed) return { reject: 'EPOCH' };
    const result = acceptBridgeMessage(event, expected);
    if (result.reject) { if (result.reject === 'STALE_DOC') connect(); return result; }
    if (result.kind === 'route') { onMessage(result); connect(); return result; }
    if (result.kind === 'hello') { expected.docRevision = result.docRevision; connected = true; clearInterval(retryTimer); onState('CONNECTED'); }
    if (result.kind === 'measure' && !connected) return { reject: 'NONCE' };
    if (result.requestId && pending.has(result.requestId)) {
      const request = pending.get(result.requestId); pending.delete(result.requestId); clearTimeout(request.timer);
      if (result.kind === 'error') request.reject(failure(result.code));
      else if (!result.selection) request.reject(failure('RESELECTION_REQUIRED'));
      else if (!result.selection.layoutFacts.fontsReady) request.reject(failure('FONTS_NOT_READY'));
      else request.resolve({ ...result.selection, capture: result.capture, receivedAt: Date.now() });
    }
    onMessage(result); return result;
  }
  function remeasure(timeoutMs = 5000) {
    if (!connected || disposed) return Promise.reject(failure('BRIDGE_UNAVAILABLE'));
    const requestId = nonce();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(failure('REMEASURE_TIMEOUT')); }, timeoutMs);
      pending.set(requestId, { resolve, reject, timer });
      send({ schemaVersion: 1, kind: 'remeasure', frameEpoch: expected.frameEpoch, sessionNonce: expected.nonce, requestId });
    });
  }
  return { connect, receive, remeasure, get expected() { return expected ? { ...expected } : null; }, dispose() { disposed = true; clearInterval(retryTimer); dropPending('BRIDGE_DISPOSED'); } };
}
