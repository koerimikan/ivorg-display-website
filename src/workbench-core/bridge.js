export const CONTROL_ORIGIN = 'http://127.0.0.1:4323';
export const PREVIEW_ORIGIN = 'http://127.0.0.1:4321';
const noncePattern = /^[a-f0-9-]{32,64}$/i;
const digestPattern = /^[a-f0-9]{64}$/;
const routeOK = v => typeof v === 'string' && /^\/(?!\/)[^\s?#]*$/.test(v) && v.length <= 256;
export function isBridgeInit(ev, parent) {
  const d = ev.data;
  return ev.origin === CONTROL_ORIGIN && ev.source === parent && d?.schemaVersion === 1 && d.kind === 'init' && Number.isSafeInteger(d.frameEpoch) && d.frameEpoch > 0 && noncePattern.test(d.sessionNonce);
}
export function acceptBridgeMessage(ev, expect) {
  if (ev.origin !== expect.origin) return { reject: 'ORIGIN' };
  if (ev.source !== expect.source) return { reject: 'SOURCE' };
  const d = ev.data;
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.schemaVersion !== 1) return { reject: 'SCHEMA' };
  if (!Number.isSafeInteger(d.frameEpoch) || d.frameEpoch !== expect.frameEpoch) return { reject: 'EPOCH' };
  if (!noncePattern.test(d.sessionNonce) || d.sessionNonce !== expect.nonce) return { reject: 'NONCE' };
  if (!digestPattern.test(d.docRevision)) return { reject: 'SHAPE' };
  if (expect.docRevision && d.docRevision !== expect.docRevision) return { reject: 'STALE_DOC' };
  if (!['hello', 'measure', 'route', 'error'].includes(d.kind)) return { reject: 'SHAPE' };
  const common = ['schemaVersion','kind','frameEpoch','sessionNonce','docRevision'];
  const extras = d.kind === 'measure' ? ['pathname','rects','hitIds','runtimeSourceIds'] : d.kind === 'error' ? ['code','detail'] : ['pathname'];
  if (Object.keys(d).some(k => ![...common,...extras].includes(k))) return { reject: 'SHAPE' };
  if (d.kind !== 'error' && !routeOK(d.pathname)) return { reject: 'SHAPE' };
  if (d.kind === 'measure') {
    if (!Array.isArray(d.rects) || d.rects.length > 80 || !Array.isArray(d.hitIds) || d.hitIds.length > 80 || !Array.isArray(d.runtimeSourceIds) || d.runtimeSourceIds.length > 80) return { reject: 'SHAPE' };
    if ([...d.hitIds, ...d.runtimeSourceIds].some(id => typeof id !== 'string' || id.length > 160)) return { reject: 'SHAPE' };
    for (const r of d.rects) if (!r || Object.keys(r).some(k => !['x','y','width','height'].includes(k)) || !['x','y','width','height'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k]) && Math.abs(r[k]) <= 1e7) || r.width < 0 || r.height < 0) return { reject: 'SHAPE' };
  }
  if (d.kind === 'error' && (typeof d.code !== 'string' || d.code.length > 64 || typeof d.detail !== 'string' || d.detail.length > 512)) return { reject: 'SHAPE' };
  return d;
}
