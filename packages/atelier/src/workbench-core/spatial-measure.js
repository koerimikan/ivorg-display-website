import { spatialSelection, geometryFingerprint, inferGrid, gridPlacement, directionalNeighbors } from './geometry.js';

const number = value => Number.parseFloat(value) || 0;
const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
export function affineContentFrame(element, readStyle) {
  const r = box(element), style = readStyle(element);
  let signX = 1, signY = 1, unsupported = false;
  for (let parent = element; parent; parent = parent.parentElement) {
    const transform = readStyle(parent).transform || 'none';
    if (transform === 'none') continue;
    const match = /^matrix\(([^)]+)\)$/.exec(transform);
    const values = match?.[1].split(',').map(Number);
    if (!values || values.length !== 6 || !values.every(Number.isFinite) || values[1] !== 0 || values[2] !== 0 || !values[0] || !values[3]) { unsupported = true; continue; }
    signX *= Math.sign(values[0]); signY *= Math.sign(values[3]);
  }
  const padX = number(style.paddingLeft) + number(style.paddingRight), padY = number(style.paddingTop) + number(style.paddingBottom);
  const borderX = number(style.borderLeftWidth) + number(style.borderRightWidth), borderY = number(style.borderTopWidth) + number(style.borderBottomWidth);
  const width = number(style.width) + (style.boxSizing === 'border-box' ? 0 : padX + borderX);
  const height = number(style.height) + (style.boxSizing === 'border-box' ? 0 : padY + borderY);
  const layoutWidth = width || element.offsetWidth, layoutHeight = height || element.offsetHeight;
  const sx = layoutWidth > 0 ? signX * r.width / layoutWidth : 0, sy = layoutHeight > 0 ? signY * r.height / layoutHeight : 0;
  const matrix = unsupported ? [0, 0, 0, 0, r.x, r.y] : [sx, 0, 0, sy, sx < 0 ? r.x + r.width : r.x, sy < 0 ? r.y + r.height : r.y];
  const contentBox = { x: number(style.borderLeftWidth) + number(style.paddingLeft), y: number(style.borderTopWidth) + number(style.paddingTop), width: Math.max(0, (element.clientWidth ?? layoutWidth - borderX) - padX), height: Math.max(0, (element.clientHeight ?? layoutHeight - borderY) - padY) };
  return { matrix, contentBox, unsupported: unsupported || !sx || !sy, style, borderBox: r };
}

export async function measureSpatial(element, raw, { selectionId, frameEpoch, docRevision, readStyle = el => el.ownerDocument.defaultView.getComputedStyle(el), scroll = { x: 0, y: 0 }, frameZoom = 1, dpr = 1, fontsReady = true } = {}) {
  const frame = affineContentFrame(element, readStyle);
  const children = [...element.children].slice(0, 80).map(node => ({ node, sourceId: node.getAttribute('data-ds-id'), objectId: node.getAttribute('data-cw-id'), parentId: 'selected-parent', zoneId: 'selected-zone', rect: box(node) }));
  const preliminary = spatialSelection({ selectionId, raw, contentBox: frame.contentBox, matrix: frame.matrix, scroll, frameEpoch, sourceRevisions: { project: docRevision }, frameZoom, dpr });
  const r = preliminary.rects.viewport;
  const hit = children.filter(item => r.width < 1 && r.height < 1 ? item.rect.x <= r.x && item.rect.x + item.rect.width >= r.x && item.rect.y <= r.y && item.rect.y + item.rect.height >= r.y : item.rect.x < r.x + r.width && item.rect.x + item.rect.width > r.x && item.rect.y < r.y + r.height && item.rect.y + item.rect.height > r.y);
  const objectIds = [...new Set(hit.map(item => item.objectId).filter(Boolean))];
  const spatial = spatialSelection({ selectionId, raw, contentBox: frame.contentBox, matrix: frame.matrix, scroll, frameEpoch, sourceRevisions: { project: docRevision }, objectIds, runtimeSourceIds: [...new Set(hit.map(item => item.sourceId).filter(Boolean))], frameZoom, dpr });
  spatial.geometryFingerprint = await geometryFingerprint([frame.borderBox, r, ...children.map(item => item.rect)]);
  const inferred = inferGrid({ columns: frame.style.gridTemplateColumns, rows: frame.style.gridTemplateRows, columnGap: number(frame.style.columnGap), rowGap: number(frame.style.rowGap), writingMode: frame.style.writingMode, dense: frame.style.gridAutoFlow?.includes('dense') });
  if (frame.unsupported) { inferred.confidence = 0; inferred.reasons.push('Ancestor transform cannot be inverted for placement'); }
  const local = spatial.rects.container;
  const placement = local ? gridPlacement({ x: local.x - frame.contentBox.x, y: local.y - frame.contentBox.y, width: local.width, height: local.height }, inferred) : { appendOnly: true };
  const layoutFacts = { writingMode: frame.style.writingMode, ancestorRotate: spatial.nonInvertible, animationInFlight: false, dense: frame.style.gridAutoFlow?.includes('dense') === true, overflowClip: ['hidden', 'clip'].includes(frame.style.overflowX) || ['hidden', 'clip'].includes(frame.style.overflowY), fontsReady };
  for (let parent = element; parent; parent = parent.parentElement) if (parent.getAnimations?.().some(animation => animation.playState === 'running')) layoutFacts.animationInFlight = true;
  return { spatial, rect: spatial.rects.viewport, normalized: spatial.normalized, grid: { columns: placement.columns || [], rows: placement.rows || [], confidence: inferred.confidence, appendOnly: placement.appendOnly, reasons: inferred.reasons }, neighbors: directionalNeighbors(r, children.filter(item => item.sourceId), { parentId: 'selected-parent', zoneId: 'selected-zone' }), layoutFacts };
}
