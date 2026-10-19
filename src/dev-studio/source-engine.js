import { parse } from '@astrojs/compiler-rs';
import MagicString from 'magic-string';
import { createHash } from 'node:crypto';

const MAX_BYTES = 8192;
const SKIP_TAGS = new Set(['script', 'style']);
const ALLOWED_STYLE = new Set([
  'margin', 'padding', 'gap', 'font-size', 'line-height', 'letter-spacing',
  'width', 'height', 'min-width', 'max-width', 'border-radius', 'opacity',
  'color', 'background-color'
]);
for (const p of ['margin', 'padding']) {
  for (const s of ['top', 'right', 'bottom', 'left']) ALLOWED_STYLE.add(`${p}-${s}`);
}

export class SourceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'SourceError';
    this.status = status;
  }
}

export function revision(source) {
  return `sha256:${createHash('sha256').update(source).digest('hex')}`;
}

function hashId(file, start, tag) {
  const h = createHash('sha256').update(`${file ?? ''}\0${start}\0${tag}`).digest('hex');
  return `s_${h.slice(0, 16)}`;
}

function parseAst(source) {
  let result;
  try {
    result = parse(source);
  } catch {
    throw new SourceError(422, 'Unable to parse source');
  }
  for (const d of result?.diagnostics ?? []) {
    if (d && (d.severity === 'error' || d.severity === 1)) {
      throw new SourceError(422, `Parse error: ${d.text || d.message || 'invalid source'}`);
    }
  }
  if (!result?.ast) throw new SourceError(422, 'Parse produced no AST');
  return result.ast;
}

function assertSlice(source, start, end, expected, label) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > source.length) {
    throw new SourceError(500, `Invalid ${label} range`);
  }
  if (source.slice(start, end) !== expected) {
    throw new SourceError(500, `Invalid ${label} source slice`);
  }
}

function validateOpening(source, opening) {
  if (!opening?.name || opening.name.type !== 'JSXIdentifier') {
    throw new SourceError(500, 'Invalid JSX opening element');
  }
  const { name, start, end } = opening;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > source.length || start >= end) {
    throw new SourceError(500, 'Invalid JSX opening range');
  }
  if (source[start] !== '<' || source[end - 1] !== '>') {
    throw new SourceError(500, 'Invalid JSX opening delimiters');
  }
  assertSlice(source, name.start, name.end, name.name, 'tag name');
}

function attrName(a) {
  if (!a || a.type !== 'JSXAttribute') return '';
  if (a.name?.type === 'JSXNamespacedName') return `${a.name.namespace.name}:${a.name.name.name}`;
  return typeof a.name?.name === 'string' ? a.name.name : '';
}

function attrValue(a) {
  const v = a?.value;
  if (v?.type === 'Literal' && typeof v.value === 'string') return v.value;
  return null;
}

function textExcluded(attrs) {
  return attrs.some((a) => {
    const n = attrName(a);
    return n === 'data-decode' || n === 'data-coord' ||
      (n === 'id' && attrValue(a) === 'system-clock');
  });
}

function computeText(source, node, attrs) {
  if (textExcluded(attrs)) return null;
  let found = null;
  for (const ch of node.children ?? []) {
    if (ch?.type !== 'JSXText') return null;
    const raw = ch.raw ?? ch.value;
    if (typeof raw !== 'string') throw new SourceError(500, 'Invalid JSXText');
    assertSlice(source, ch.start, ch.end, raw, 'JSXText');
    if (/\S/.test(raw)) {
      if (found) return null;
      found = { raw, start: ch.start };
    }
  }
  if (!found) return null;
  const { raw, start } = found;
  let a = 0;
  let b = raw.length;
  while (a < raw.length && /\s/.test(raw[a])) a++;
  while (b > a && /\s/.test(raw[b - 1])) b--;
  if (a === b) return null;
  return { range: [start + a, start + b], expectedOld: raw.slice(a, b) };
}

function computeStyle(source, attrs) {
  const styles = attrs.filter((a) => attrName(a) === 'style');
  if (styles.length === 0) return { style: null, capable: true };
  if (styles.length !== 1) return { style: null, capable: false };
  const v = styles[0].value;
  if (!v || v.type !== 'Literal' || typeof v.value !== 'string') {
    return { style: null, capable: false };
  }
  const raw = v.raw ?? source.slice(v.start, v.end);
  assertSlice(source, v.start, v.end, raw, 'style value');
  if (raw.length < 2 || (raw[0] !== '"' && raw[0] !== "'") || raw[raw.length - 1] !== raw[0]) {
    return { style: null, capable: false };
  }
  const inner = raw.slice(1, -1);
  assertSlice(source, v.start + 1, v.end - 1, inner, 'style inner');
  if (inner.includes('&')) return { style: null, capable: false };
  return {
    style: { range: [v.start + 1, v.end - 1], expectedOld: inner, quote: raw[0] },
    capable: true
  };
}

export function analyzeSource(source, file) {
  const ast = parseAst(source);
  const ms = new MagicString(source);
  const records = [];
  const baseRevision = revision(source);

  function walk(node) {
    if (!node) return;
    if (node.type === 'JSXElement') {
      const opening = node.openingElement;
      if (opening?.name?.type !== 'JSXIdentifier') {
        for (const child of node.children ?? []) walk(child);
        return;
      }
      validateOpening(source, opening);
      const tag = opening.name.name;
      if (SKIP_TAGS.has(tag)) return;
      const attrs = opening.attributes ?? [];
      const isComponent = /^[A-Z]/.test(tag);
      const raw = attrs.some((a) => attrName(a) === 'set:html' || attrName(a) === 'set:text');
      const blocked = attrs.some((a) => a.type === 'JSXSpreadAttribute' ||
        ['data-ds-id', 'set:html', 'set:text'].includes(attrName(a)));
      if (!isComponent && !blocked && tag !== 'slot') {
        const id = hashId(file, opening.start, tag);
        const text = computeText(source, node, attrs);
        const st = computeStyle(source, attrs);
        records.push({
          sourceId: id,
          file,
          tag,
          range: [node.start, node.end],
          baseRevision,
          capabilities: { text: Boolean(text), style: st.capable },
          text,
          style: st.style,
          insertStyleAt: opening.name.end
        });
        ms.appendLeft(opening.name.end, ` data-ds-id="${id}"`);
      }
      if (raw) return;
      for (const child of node.children ?? []) walk(child);
      return;
    }
    if (node.type === 'JSXFragment') {
      for (const child of node.children ?? []) walk(child);
    }
  }

  for (const node of ast.body ?? []) walk(node);
  const code = ms.toString();
  return { records, code, map: ms.generateMap({ hires: true, includeContent: true }) };
}

function assertRange(range, length) {
  if (!Array.isArray(range) || range.length !== 2 ||
      !Number.isInteger(range[0]) || !Number.isInteger(range[1]) ||
      range[0] < 0 || range[1] < range[0] || range[1] > length) {
    throw new SourceError(422, 'Invalid record range');
  }
}

function encodeText(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function verifyPatched(code, start, after) {
  parseAst(code);
  assertSlice(code, start, start + after.length, after, 'patched output');
}

function checkRecord(source, record) {
  if (!record || typeof record !== 'object' || typeof record.sourceId !== 'string') {
    throw new SourceError(422, 'Invalid record');
  }
  if (record.baseRevision !== revision(source)) throw new SourceError(409, 'Base revision mismatch');
  assertRange(record.range, source.length);
}

function patchStaticText(source, record, operation) {
  if (!record.capabilities?.text || !record.text) throw new SourceError(422, 'Text not editable');
  if (typeof operation.expectedOld !== 'string' || typeof operation.newValue !== 'string') {
    throw new SourceError(422, 'Invalid replaceStaticText operation');
  }
  const [start, end] = record.text.range;
  assertRange(record.text.range, source.length);
  const before = source.slice(start, end);
  if (record.text.expectedOld !== before || operation.expectedOld !== before) {
    throw new SourceError(409, 'Stale text');
  }
  if (Buffer.byteLength(operation.newValue, 'utf8') > MAX_BYTES) {
    throw new SourceError(422, 'Text exceeds byte limit');
  }
  const after = encodeText(operation.newValue);
  if (Buffer.byteLength(after, 'utf8') > MAX_BYTES) {
    throw new SourceError(422, 'Encoded text exceeds byte limit');
  }
  const ms = new MagicString(source);
  ms.update(start, end, after);
  const code = ms.toString();
  verifyPatched(code, start, after);
  return { code, patch: { start, end, before, after } };
}

function isWS(c) {
  return /\s/.test(c);
}

function parseDeclarations(raw) {
  const decls = [];
  let segStart = 0;
  let quote = null;
  let depth = 0;

  function addSegment(s, e) {
    let first = s;
    while (first < e && isWS(raw[first])) first++;
    let last = e;
    while (last > first && isWS(raw[last - 1])) last--;
    if (first === last) return;

    let colon = -1;
    let q = null;
    let d = 0;
    for (let i = s; i < e; i++) {
      const c = raw[i];
      if (q) {
        if (c === '\\') { i++; continue; }
        if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '(' || c === '[') { d++; continue; }
      if (c === ')' || c === ']') {
        d--;
        if (d < 0) throw new SourceError(422, 'Malformed style');
        continue;
      }
      if (c === ':' && d === 0) { colon = i; break; }
    }
    if (colon < 0) throw new SourceError(422, 'Malformed style declaration');

    let ns = s;
    while (ns < colon && isWS(raw[ns])) ns++;
    let ne = colon;
    while (ne > ns && isWS(raw[ne - 1])) ne--;
    let vs = colon + 1;
    while (vs < e && isWS(raw[vs])) vs++;
    let ve = e;
    while (ve > vs && isWS(raw[ve - 1])) ve--;

    const name = raw.slice(ns, ne);
    const value = raw.slice(vs, ve);
    if (!name || !value || !/^(?:--[A-Za-z0-9_-]+|-?[A-Za-z][A-Za-z0-9_-]*)$/.test(name)) {
      throw new SourceError(422, 'Malformed style declaration');
    }
    decls.push({ name: name.startsWith('--') ? name : name.toLowerCase(), value, valueStart: vs, valueEnd: ve });
  }

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '/' && raw[i + 1] === '*') throw new SourceError(422, 'Style comments are not supported');
    if (c === '(' || c === '[') { depth++; continue; }
    if (c === ')' || c === ']') {
      depth--;
      if (depth < 0) throw new SourceError(422, 'Malformed style');
      continue;
    }
    if (c === ';' && depth === 0) {
      addSegment(segStart, i);
      segStart = i + 1;
    }
  }
  if (quote || depth !== 0) throw new SourceError(422, 'Malformed style');
  addSegment(segStart, raw.length);
  return decls;
}

function checkCollision(property, decls) {
  const names = new Set(decls.map((d) => d.name));
  if (names.has('all')) throw new SourceError(422, 'Style shorthand collision');
  const groups = {
    margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
    padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
    gap: ['row-gap', 'column-gap']
  };
  for (const [shorthand, longs] of Object.entries(groups)) {
    if (property === shorthand && longs.some((n) => names.has(n))) {
      throw new SourceError(422, 'Style shorthand collision');
    }
    if (longs.includes(property) && names.has(shorthand)) {
      throw new SourceError(422, 'Style shorthand collision');
    }
  }
  for (const family of ['margin', 'padding']) {
    if (property.startsWith(family) && [...names].some(name => new RegExp(`^${family}-(inline|block)`).test(name))) throw new SourceError(422, 'Logical style shorthand collision');
  }
  if (property === 'background-color' && names.has('background')) {
    throw new SourceError(422, 'Style shorthand collision');
  }
  if ((property === 'font-size' || property === 'line-height') && names.has('font')) {
    throw new SourceError(422, 'Style shorthand collision');
  }
}

function validateStyleValue(property, value) {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw new SourceError(422, 'Invalid style value');
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_BYTES) {
    throw new SourceError(422, 'Style value exceeds byte limit');
  }
  if (/[;{}"'()\\]/.test(value) || /url/i.test(value) || /!important/i.test(value)) {
    throw new SourceError(422, 'Unsafe style value');
  }
  if (property === 'color' || property === 'background-color') {
    if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value)) {
      throw new SourceError(422, 'Only hex colors are allowed');
    }
    return;
  }
  if (property === 'opacity') {
    if (!/^(?:0|1|0?\.\d+)$/.test(value)) throw new SourceError(422, 'Invalid opacity');
    const n = Number(value);
    if (!(n >= 0 && n <= 1)) throw new SourceError(422, 'Invalid opacity');
    return;
  }
  if (property === 'line-height' && value === 'normal') return;
  if (property === 'line-height' && /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) && Number.isFinite(Number(value))) return;
  if (property.startsWith('margin') && value === 'auto') return;
  if (!/^(?:0|(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|vw|vh|%))$/.test(value)) {
    throw new SourceError(422, 'Unsupported style value');
  }
}

function appendDeclaration(inner, property, value) {
  const trimmedEnd = inner.replace(/\s+$/, '').length;
  if (trimmedEnd === 0) return `${property}: ${value}`;
  return inner.slice(0, trimmedEnd).endsWith(';')
    ? ` ${property}: ${value}`
    : `; ${property}: ${value}`;
}

function patchInlineStyle(source, record, operation) {
  if (!record.capabilities?.style) throw new SourceError(422, 'Style not editable');
  const property = operation.property;
  if (typeof property !== 'string' || !ALLOWED_STYLE.has(property)) {
    throw new SourceError(422, 'Unsupported style property');
  }
  if (typeof operation.expectedOld !== 'string' || typeof operation.newValue !== 'string') {
    throw new SourceError(422, 'Invalid replaceInlineStyle operation');
  }
  validateStyleValue(property, operation.newValue);

  const ms = new MagicString(source);
  let start;
  let end;
  let before = '';
  let after = '';

  if (record.style) {
    const range = record.style.range;
    assertRange(range, source.length);
    const inner = source.slice(range[0], range[1]);
    if (record.style.expectedOld !== inner || operation.expectedOld !== inner) {
      throw new SourceError(409, 'Stale style');
    }
    const decls = parseDeclarations(inner);
    checkCollision(property, decls);
    const matches = decls.filter((d) => d.name === property);
    if (matches.length > 1) throw new SourceError(422, 'Duplicate style property');
    if (matches.length === 1) {
      const d = matches[0];
      start = range[0] + d.valueStart;
      end = range[0] + d.valueEnd;
      before = inner.slice(d.valueStart, d.valueEnd);
      if (before !== d.value) throw new SourceError(422, 'Invalid style value range');
      after = operation.newValue;
      ms.update(start, end, after);
    } else {
      start = end = range[1];
      after = appendDeclaration(inner, property, operation.newValue);
      ms.appendLeft(start, after);
    }
  } else {
    if (operation.expectedOld !== '') throw new SourceError(409, 'Stale style');
    if (!Number.isInteger(record.insertStyleAt) || record.insertStyleAt < 0 || record.insertStyleAt > source.length) {
      throw new SourceError(422, 'Invalid style insertion point');
    }
    start = end = record.insertStyleAt;
    after = ` style="${property}: ${operation.newValue}"`;
    ms.appendLeft(start, after);
  }

  const code = ms.toString();
  verifyPatched(code, start, after);
  return { code, patch: { start, end, before, after } };
}

export function patchSource(source, record, operation) {
  checkRecord(source, record);
  if (!operation || typeof operation !== 'object') throw new SourceError(422, 'Invalid operation');
  if (operation.kind === 'replaceStaticText') return patchStaticText(source, record, operation);
  if (operation.kind === 'replaceInlineStyle') return patchInlineStyle(source, record, operation);
  throw new SourceError(422, 'Unknown operation kind');
}
