/**
 * context-capture.js
 * Pure DOM geometry / traversal helpers used by the ivorg display workspace.
 * No global DOM access happens at import time; the caller injects `readStyle`
 * (defaults are resolved lazily from element.ownerDocument.defaultView).
 */

const SKIP_TAGS = new Set([
  'html', 'head', 'body', 'script', 'style', 'noscript', 'template',
  'link', 'meta', 'title', 'base'
]);

const DECOR_TAGS = new Set([
  'br', 'hr', 'wbr', 'img', 'svg', 'path', 'circle', 'rect', 'line',
  'polyline', 'polygon', 'ellipse', 'g', 'defs', 'use', 'col', 'colgroup',
  'source', 'track', 'iframe', 'canvas', 'video', 'audio'
]);

const SEMANTIC_TAGS = new Set([
  'section', 'article', 'aside', 'nav', 'table', 'ul', 'ol', 'main',
  'header', 'footer', 'form', 'figure', 'details', 'dialog', 'tbody', 'dl'
]);

const SEMANTIC_ROLES = new Set([
  'list', 'grid', 'table', 'treegrid', 'listbox', 'rowgroup', 'region',
  'navigation', 'article', 'feed', 'tabpanel'
]);

const STYLE_KEYS = [
  'display', 'position', 'grid-template-columns', 'grid-template-rows',
  'grid-auto-flow', 'flex-direction', 'flex-wrap', 'justify-content',
  'align-items', 'width', 'height', 'gap', 'row-gap', 'column-gap',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'transform', 'clip-path', 'z-index', 'opacity', 'overflow', 'mask-image',
  'filter', 'mix-blend-mode'
];

const DEFAULT_WORDS = new Set([
  'none', 'normal', 'auto', '0px', '0', 'visible', 'static', 'initial',
  'inherit', 'unset', 'revert', 'transparent', 'rgba(0, 0, 0, 0)', '0s'
]);

const VAR_RE = /var\(\s*(--[A-Za-z0-9_-]+)/g;

/* ------------------------------------------------------------------ *
 * small duck-typed element helpers (no instanceof checks)
 * ------------------------------------------------------------------ */

function tagOf(el) {
  return String((el && (el.tagName || el.nodeName)) || '').toLowerCase();
}

function attr(el, name) {
  if (!el || typeof el.getAttribute !== 'function') return null;
  let v;
  try { v = el.getAttribute(name); } catch (e) { return null; }
  return v === undefined ? null : v;
}

function parentOf(el) {
  if (!el) return null;
  if (el.parentElement) return el.parentElement;
  const p = el.parentNode;
  return p && p.nodeType === 1 ? p : null;
}

function docOf(el) {
  if (!el) return null;
  if (el.ownerDocument) return el.ownerDocument;
  if (el.nodeType === 9) return el;
  return null;
}

function classesOf(el) {
  const raw = attr(el, 'class');
  if (typeof raw === 'string' && raw.trim()) return raw.trim().split(/\s+/);
  const cn = el && el.className;
  if (typeof cn === 'string' && cn.trim()) return cn.trim().split(/\s+/);
  return [];
}

function childElements(el) {
  if (!el) return [];
  if (el.children && typeof el.children.length === 'number') {
    return Array.from(el.children);
  }
  const cn = el.childNodes;
  if (cn && typeof cn.length === 'number') {
    const out = [];
    for (let i = 0; i < cn.length; i++) {
      const c = cn[i];
      if (c && (c.nodeType === 1 || c.tagName)) out.push(c);
    }
    return out;
  }
  return [];
}

function isTextNode(n) {
  if (!n) return false;
  if (n.nodeType === 3) return true;
  return n.nodeType == null && typeof n.nodeValue === 'string' && !n.tagName;
}

function normalizeList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v.length === 'number') return Array.from(v).filter(Boolean);
  return [v];
}

function defaultReadStyle(el) {
  const doc = docOf(el);
  const win = doc && doc.defaultView;
  if (win && typeof win.getComputedStyle === 'function') {
    return win.getComputedStyle(el);
  }
  return {};
}

function truncate(value, max) {
  const t = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

function camel(prop) {
  return prop.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
}

/* ------------------------------------------------------------------ *
 * rectangles
 * ------------------------------------------------------------------ */

export function normalizeRect(a, b) {
  const xs = [];
  const ys = [];
  const collect = (v) => {
    if (!v || typeof v !== 'object') return;
    if (typeof v.x === 'number') xs.push(v.x);
    if (typeof v.left === 'number') xs.push(v.left);
    if (typeof v.right === 'number') xs.push(v.right);
    if (typeof v.width === 'number') {
      if (typeof v.x === 'number') xs.push(v.x + v.width);
      else if (typeof v.left === 'number') xs.push(v.left + v.width);
    }
    if (typeof v.y === 'number') ys.push(v.y);
    if (typeof v.top === 'number') ys.push(v.top);
    if (typeof v.bottom === 'number') ys.push(v.bottom);
    if (typeof v.height === 'number') {
      if (typeof v.y === 'number') ys.push(v.y + v.height);
      else if (typeof v.top === 'number') ys.push(v.top + v.height);
    }
  };
  collect(a);
  collect(b);
  if (!xs.length) xs.push(0);
  if (!ys.length) ys.push(0);
  const left = Math.min.apply(null, xs);
  const right = Math.max.apply(null, xs);
  const top = Math.min.apply(null, ys);
  const bottom = Math.max.apply(null, ys);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function toRect(v) {
  return normalizeRect(v, v);
}

export function intersects(a, b) {
  const ra = toRect(a);
  const rb = toRect(b);
  const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
  const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
  return w > 0 && h > 0;
}

function overlapArea(a, b) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

function containsRect(outer, inner) {
  return outer.left <= inner.left + 0.5 && outer.top <= inner.top + 0.5 &&
    outer.right >= inner.right - 0.5 && outer.bottom >= inner.bottom - 0.5;
}

/* ------------------------------------------------------------------ *
 * visibility
 * ------------------------------------------------------------------ */

function inOverlay(el) {
  let cur = el;
  let guard = 0;
  while (cur && guard++ < 40) {
    const cls = classesOf(cur);
    if (tagOf(cur) === 'dev-studio-hud' || cls.indexOf('dev-studio-hud') >= 0) return true;
    if (attr(cur, 'data-dev-studio-ui') !== null) return true;
    cur = parentOf(cur);
  }
  return false;
}

function styleOf(el, readStyle) {
  try { return readStyle(el) || {}; } catch (e) { return {}; }
}

function isExportable(el, readStyle) {
  if (!el) return false;
  const tag = tagOf(el);
  if (!tag || SKIP_TAGS.has(tag) || ['input','textarea','select','option'].includes(tag)) return false;
  if (inOverlay(el)) return false;
  if (attr(el, 'hidden') !== null) return false;
  if (String(attr(el, 'aria-hidden') || '').toLowerCase() === 'true') return false;
  const st = styleOf(el, readStyle);
  let ancestor=parentOf(el),guard=0;
  while(ancestor&&guard++<40){
    const parentStyle=styleOf(ancestor,readStyle);
    if(attr(ancestor,'hidden')!==null || attr(ancestor,'aria-hidden')==='true' || parentStyle.display==='none' || parentStyle.visibility==='hidden' || String(parentStyle.opacity)==='0')return false;
    ancestor=parentOf(ancestor);
  }
  if (st.display === 'none') return false;
  if (st.visibility === 'hidden' || st.visibility === 'collapse') return false;
  const op = st.opacity;
  if (op != null && op !== '' && parseFloat(op) === 0) return false;
  if (typeof el.getBoundingClientRect === 'function') {
    let r = null;
    try { r = el.getBoundingClientRect(); } catch (e) { r = null; }
    if (r) {
      const nr = toRect(r);
      if (!(nr.width > 0 && nr.height > 0)) return false;
    }
  }
  return true;
}

function visibleRect(el, readStyle) {
  if (!isExportable(el, readStyle)) return null;
  let r = null;
  try { r = el.getBoundingClientRect(); } catch (e) { r = null; }
  if (!r) return null;
  const nr = toRect(r);
  return nr.width > 0 && nr.height > 0 ? nr : null;
}

/* ------------------------------------------------------------------ *
 * semantic classification
 * ------------------------------------------------------------------ */

function roleOf(el) {
  return String(attr(el, 'role') || '').toLowerCase().split(/\s+/)[0] || '';
}

function isSemantic(el) {
  if (!el) return false;
  const tag = tagOf(el);
  if (tag === 'body' || tag === 'html') return false;
  if (SEMANTIC_TAGS.has(tag)) return true;
  if (SEMANTIC_ROLES.has(roleOf(el))) return true;
  if (attr(el, 'data-grid') !== null) return true;
  return false;
}

function isListContainer(el) {
  if (!el) return false;
  const tag = tagOf(el);
  if (tag === 'ul' || tag === 'ol' || tag === 'tbody' || tag === 'dl') return true;
  const role = roleOf(el);
  if (role === 'list' || role === 'grid' || role === 'treegrid' ||
      role === 'table' || role === 'rowgroup' || role === 'listbox') return true;
  return attr(el, 'data-grid') !== null;
}

/* ------------------------------------------------------------------ *
 * selectSemanticRoots
 * ------------------------------------------------------------------ */

export function selectSemanticRoots(elements, rect, options) {
  const opts = options || {};
  const readStyle = typeof opts.readStyle === 'function' ? opts.readStyle : defaultReadStyle;
  const list = normalizeList(elements);
  const box = toRect(rect);
  const boxArea = box.width * box.height;
  if (!(boxArea > 0) || !list.length) return [];

  const doc = docOf(list[0]);
  const win = doc && doc.defaultView;
  let viewportArea = opts.viewportArea;
  if (!(viewportArea > 0)) {
    const w = win && win.innerWidth;
    const h = win && win.innerHeight;
    viewportArea = (w > 0 && h > 0) ? w * h : boxArea * 4;
  }

  const seenEl = new Set();
  const hits = [];
  for (let i = 0; i < list.length; i++) {
    const el = list[i];
    if (!el || seenEl.has(el)) continue;
    seenEl.add(el);
    const r = visibleRect(el, readStyle);
    if (!r || !intersects(r, box)) continue;
    hits.push({ el, rect: r, area: r.width * r.height, overlap: overlapArea(r, box) });
  }
  if (!hits.length) return [];

  // drop full-viewport background wrappers
  const wrapperLimit = Math.max(viewportArea, boxArea) * 0.85;
  const candidates = hits.filter((h) => !(h.area >= wrapperLimit && containsRect(h.rect, box)));
  const pool = candidates;
  if(!pool.length)return [];

  // keep only the smallest (leaf-most) hits
  const ancestors = new Set();
  for (let i = 0; i < pool.length; i++) {
    let p = parentOf(pool[i].el);
    let guard = 0;
    while (p && guard++ < 60) { ancestors.add(p); p = parentOf(p); }
  }
  let leaves = pool.filter((h) => !ancestors.has(h.el));
  if (!leaves.length) leaves = pool;

  const maxArea = Math.min(boxArea * 3, viewportArea * 0.75);
  const chosen = [];
  for (let i = 0; i < leaves.length; i++) {
    let node = leaves[i].el;
    let pick = node;
    let guard = 0;
    while (node && guard++ < 6) {
      if (isSemantic(node)) {
        const r = visibleRect(node, readStyle);
        if (r && r.width * r.height <= maxArea && intersects(r, box)) {
          pick = node;
          break;
        }
      }
      node = parentOf(node);
    }
    chosen.push(pick);
  }

  // dedupe + drop descendants of already chosen roots
  const unique = [];
  const seen = new Set();
  for (let i = 0; i < chosen.length; i++) {
    if (!seen.has(chosen[i])) { seen.add(chosen[i]); unique.push(chosen[i]); }
  }
  let result = unique.filter((el) => {
    let p = parentOf(el);
    let guard = 0;
    while (p && guard++ < 60) {
      if (seen.has(p)) return false;
      p = parentOf(p);
    }
    return true;
  });

  // promote to a small common semantic ancestor when disjointness is artificial
  if (result.length > 1) {
    const common = commonAncestorOf(result);
    if (common && isSemantic(common)) {
      const r = visibleRect(common, readStyle);
      if (r && r.width * r.height <= maxArea && intersects(r, box)) result = [common];
    }
  }

  const scored = new Map();
  const scoreOf = (el) => {
    if (scored.has(el)) return scored.get(el);
    const r = visibleRect(el, readStyle);
    const v = r ? overlapArea(r, box) : 0;
    scored.set(el, v);
    return v;
  };
  result.sort((a, b) => scoreOf(b) - scoreOf(a));
  return result.slice(0, 8);
}

function commonAncestorOf(els) {
  if (!els || !els.length) return null;
  let common = els[0];
  for (let i = 1; i < els.length; i++) {
    const chain = new Set();
    let cur = common;
    let guard = 0;
    while (cur && guard++ < 80) { chain.add(cur); cur = parentOf(cur); }
    let p = els[i];
    let found = null;
    let g = 0;
    while (p && g++ < 80) {
      if (chain.has(p)) { found = p; break; }
      p = parentOf(p);
    }
    if (!found) return null;
    common = found;
  }
  return common;
}

/* ------------------------------------------------------------------ *
 * summarizeDOM
 * ------------------------------------------------------------------ */

function directText(el) {
  const cn = el && el.childNodes;
  if (!cn || typeof cn.length !== 'number') return '';
  const parts = [];
  for (let i = 0; i < cn.length; i++) {
    const n = cn[i];
    if (!n || !isTextNode(n)) continue;
    const v = typeof n.nodeValue === 'string' ? n.nodeValue : String(n);
    if (v && v.trim()) parts.push(v.trim());
  }
  if (!parts.length) return '';
  return truncate(parts.join(' '), 160);
}

function itemText(el, readStyle) {
  const parts = [];
  let count = 0;
  const walk = (node, depth) => {
    if (!node || depth > 4 || count > 60) return;
    const cn = node.childNodes;
    if (!cn || typeof cn.length !== 'number') return;
    for (let i = 0; i < cn.length && count <= 60; i++) {
      const c = cn[i];
      if (!c) continue;
      if (isTextNode(c)) {
        const v = typeof c.nodeValue === 'string' ? c.nodeValue : '';
        if (v && v.trim()) { parts.push(v.trim()); count++; }
        continue;
      }
      const tg = tagOf(c);
      if (!tg || SKIP_TAGS.has(tg) || tg === 'svg' || !isExportable(c, readStyle)) continue;
      if (attr(c, 'hidden') !== null) continue;
      if (String(attr(c, 'aria-hidden') || '').toLowerCase() === 'true') continue;
      walk(c, depth + 1);
    }
  };
  walk(el, 1);
  return truncate(parts.join(' '), 120);
}

function classSignature(classes) {
  const meaningful = [];
  for (let i = 0; i < classes.length; i++) {
    let c = String(classes[i] || '').trim();
    if (!c || /^ds[-_]/i.test(c)) continue;
    c = c.replace(/[-_]?\d+$/g, '');
    if (c) meaningful.push(c);
  }
  meaningful.sort();
  return meaningful.join('.');
}

function isGroupable(tag, els) {
  if (!tag || DECOR_TAGS.has(tag) || SKIP_TAGS.has(tag)) return false;
  let meaningful = 0;
  for (let i = 0; i < els.length; i++) {
    if (directText(els[i]) || childElements(els[i]).length) meaningful++;
  }
  return meaningful >= Math.min(2, els.length);
}

function groupRepeats(children, parentEl) {
  const out = [];
  const listParent = isListContainer(parentEl);
  const minCount = listParent ? 2 : 3;
  let i = 0;
  while (i < children.length) {
    const tag = tagOf(children[i]);
    const sig = classSignature(classesOf(children[i]));
    let j = i + 1;
    while (j < children.length &&
           tagOf(children[j]) === tag &&
           classSignature(classesOf(children[j])) === sig) {
      j++;
    }
    const els = children.slice(i, j);
    i = j;
    if (tag && els.length >= minCount && isGroupable(tag, els)) {
      out.push({ els });
    } else {
      for (let k = 0; k < els.length; k++) out.push({ els: [els[k]] });
    }
  }
  return out;
}

function idAttrOf(el) {
  const v = attr(el, 'data-ds-id');
  return typeof v === 'string' && /^s_[a-f0-9]{12,64}$/.test(v) ? v : null;
}

function runSummarize(roots, options, elementById) {
  const opts = options || {};
  const maxNodes = opts.maxNodes > 0 ? Math.min(80,Math.floor(opts.maxNodes)) : 80;
  const maxDepth = opts.maxDepth > 0 ? Math.min(6,Math.floor(opts.maxDepth)) : 6;
  const readStyle = typeof opts.readStyle === 'function' ? opts.readStyle : defaultReadStyle;

  const nodes = [];
  const rootNodes = [];
  const byId = new Map();
  const budget = { nodes: maxNodes };
  let seq = 0;
  let truncated = false;

  function buildNode(el, depth, nearestId) {
    if (!el) return null;
    if (budget.nodes <= 0 || depth > maxDepth) { truncated = true; return null; }
    if (!isExportable(el, readStyle)) return null;

    const id = 'n' + (seq++);
    budget.nodes--;
    const ownId = idAttrOf(el);
    const sourceId = ownId || nearestId || null;
    const node = {
      id,
      tag: tagOf(el),
      classes: classesOf(el).slice(0, 8),
      sourceId
    };
    if (elementById) elementById.set(id, el);
    byId.set(id, node);
    nodes.push(node);

    const text = directText(el);
    if (text) node.text = text;

    const kids = childElements(el).filter((c) => isExportable(c, readStyle));
    if (!kids.length) return id;
    if (depth >= maxDepth) { truncated = true; return id; }

    const groups = groupRepeats(kids, el);
    const childIds = [];
    for (let g = 0; g < groups.length; g++) {
      const group = groups[g];
      if (budget.nodes <= 0) { truncated = true; break; }
      const repId = buildNode(group.els[0], depth + 1, sourceId);
      if (!repId) continue;
      childIds.push(repId);
      if (group.els.length > 1) {
        const rep = byId.get(repId);
        const items = [];
        for (let k = 0; k < group.els.length && k < 24; k++) items.push(itemText(group.els[k],readStyle));
        rep.repeat = {
          count: group.els.length,
          representative: repId,
          items,
          omittedItems: Math.max(0, group.els.length - items.length)
        };
      }
    }
    if (childIds.length) node.children = childIds.map(id => byId.get(id));
    return id;
  }

  const unique = Array.from(new Set(normalizeList(roots)));
  for (let i = 0; i < unique.length; i++) {
    const root = unique[i];
    let p = parentOf(root);
    let guard = 0;
    let nested = false;
    while (p && guard++ < 60) {
      if (unique.indexOf(p) >= 0) { nested = true; break; }
      p = parentOf(p);
    }
    if (nested) continue;
    if (budget.nodes <= 0) { truncated = true; break; }
    let ancestor=parentOf(root),mapped=null;
    while(ancestor&&!mapped){mapped=idAttrOf(ancestor);ancestor=parentOf(ancestor);}
    const rootId=buildNode(root, 1, mapped);
    if(rootId)rootNodes.push(byId.get(rootId));
  }

  return { nodes:rootNodes, nodeCount: nodes.length, truncated };
}

export function summarizeDOM(roots, options) {
  return runSummarize(roots, options, null);
}

/* ------------------------------------------------------------------ *
 * styles / css variables
 * ------------------------------------------------------------------ */

function readProp(st, prop) {
  if (!st) return '';
  let v;
  if (typeof st.getPropertyValue === 'function') {
    try { v = st.getPropertyValue(prop); } catch (e) { v = undefined; }
  }
  if ((v == null || v === '') && st[prop] != null) v = st[prop];
  if ((v == null || v === '') && st[camel(prop)] != null) v = st[camel(prop)];
  return v == null ? '' : String(v).trim();
}

function isDefaultValue(prop, v) {
  const val = String(v).trim().toLowerCase();
  if (!val) return true;
  if (DEFAULT_WORDS.has(val)) return true;
  if (prop === 'opacity' && parseFloat(val) === 1) return true;
  if (prop === 'z-index' && val === 'auto') return true;
  return false;
}

function scanVarNames(text, names) {
  if (!text || text.indexOf('var(') < 0) return;
  VAR_RE.lastIndex = 0;
  let m;
  while ((m = VAR_RE.exec(text))) {
    names.add(m[1]);
    if (names.size > 40) break;
  }
}

function matchesSelector(el, sel) {
  if (typeof el.matches !== 'function') return false;
  try { return el.matches(sel); } catch (e) { return false; }
}

function scanRules(rules, el, names, win, budget, depth) {
  if (!rules || depth > 3) return;
  const len = rules.length || 0;
  for (let i = 0; i < len; i++) {
    if (budget.n <= 0) return;
    budget.n--;
    let rule = null;
    try { rule = rules[i]; } catch (e) { continue; }
    if (!rule) continue;

    const media = rule.media && typeof rule.media === 'object' ? rule.media.mediaText : null;
    if (media && win && typeof win.matchMedia === 'function') {
      let m = null;
      try { m = win.matchMedia(media); } catch (e) { m = null; }
      if (m && m.matches === false) continue;
    }

    let nested = null;
    try { nested = rule.cssRules || null; } catch (e) { nested = null; }
    if (nested && !rule.selectorText) {
      scanRules(nested, el, names, win, budget, depth + 1);
      continue;
    }

    const sel = rule.selectorText;
    if (!sel || sel.indexOf('::') >= 0) continue;
    let cssText = '';
    try { cssText = rule.style ? String(rule.style.cssText || '') : ''; } catch (e) { cssText = ''; }
    if (!cssText || cssText.toLowerCase().indexOf('var(') < 0) continue;
    if (matchesSelector(el, sel)) scanVarNames(cssText, names);
  }
}

function collectVariables(el, st, doc, styleSheets) {
  const names = new Set();
  scanVarNames(attr(el, 'style') || '', names);
  const sheets = styleSheets || (doc && doc.styleSheets) || null;
  if (sheets && sheets.length) {
    const win = doc && doc.defaultView;
    const budget = { n: 6000 };
    for (let i = 0; i < sheets.length && budget.n > 0; i++) {
      let rules = null;
      try { rules = sheets[i].cssRules || sheets[i].rules || null; } catch (e) { rules = null; }
      if (rules) scanRules(rules, el, names, win, budget, 0);
    }
  }
  if (!names.size) return null;
  const out = {};
  let count = 0;
  for (const name of names) {
    if (count >= 8) break;
    const v = readProp(st, name);
    if (!v) continue;
    out[name] = truncate(v, 160);
    count++;
  }
  return count ? out : null;
}

function collectStyles(el, readStyle, styleSheets, doc) {
  const out = {};
  const st = styleOf(el, readStyle);
  let count = 0;
  const prioritized=[...new Set(['display','width','height','transform','clip-path','z-index','font-size','gap',...STYLE_KEYS])];
  for (let i = 0; i < prioritized.length; i++) {
    if (count >= 23) break;
    const prop = prioritized[i];
    const v = readProp(st, prop);
    if (!v || isDefaultValue(prop, v)) continue;
    out[prop] = truncate(v, 160);
    count++;
  }
  const vars = collectVariables(el, st, doc, styleSheets);
  if (vars) out.variables = vars;
  return out;
}

/* ------------------------------------------------------------------ *
 * captureContext
 * ------------------------------------------------------------------ */

export function captureContext(roots, options) {
  const opts = options || {};
  const readStyle = typeof opts.readStyle === 'function' ? opts.readStyle : defaultReadStyle;
  const elementById = new Map();
  const domSummary = runSummarize(roots, opts, elementById);

  const first = normalizeList(roots)[0] || null;
  const doc = docOf(first);
  const styleSheets = opts.styleSheets || (doc && doc.styleSheets) || null;

  const styles = {};
  const sourceIds = [];
  const seenIds = new Set();
  const seenEls = new Set();

  const flattened=[];
  const visit=node=>{flattened.push(node);node.children?.forEach(visit);};domSummary.nodes.forEach(visit);
  for (const node of flattened) {
    const el = elementById.get(node.id);
    if (!el || seenEls.has(el)) continue;
    seenEls.add(el);
    if (node.sourceId && sourceIds.length < 24 && !seenIds.has(node.sourceId)) {
      seenIds.add(node.sourceId);
      sourceIds.push(node.sourceId);
    }
    styles[node.id] = collectStyles(el, readStyle, styleSheets, doc);
  }

  return {
    domSummary,
    styles,
    sourceIds,
    unmapped: domSummary.nodes.length > 0 && sourceIds.length === 0
  };
}

export default { normalizeRect, intersects, selectSemanticRoots, summarizeDOM, captureContext };
