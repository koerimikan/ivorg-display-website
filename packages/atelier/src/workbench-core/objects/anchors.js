import { parse } from '@astrojs/compiler-rs';
import { ContractError, hash } from './spec.js';

// Runtime offsets are derived. Template identity is the stored structural path, never a sourceId.
export function indexAnchors(source, file) {
  const { ast, diagnostics = [] } = parse(source);
  if (diagnostics.some(d => d.severity === 'error' || d.severity === 1)) throw new ContractError('ANCHOR_PARSE', file);
  const anchors = [];
  function walk(nodes, prefix = '') {
    const counts = new Map();
    for (const node of nodes || []) {
      if (node.type === 'JSXFragment') { walk(node.children, prefix); continue; }
      if (node.type !== 'JSXElement' || node.openingElement.name.type !== 'JSXIdentifier') continue;
      const tag = node.openingElement.name.name, ordinal = counts.get(tag) || 0; counts.set(tag, ordinal + 1);
      const path = `${prefix}/${tag}:${ordinal}`;
      const attrs = node.openingElement.attributes || [];
      const domId = attrs.find(a => a.type === 'JSXAttribute' && a.name?.name === 'id' && typeof a.value?.value === 'string')?.value.value;
      const text = (node.children || []).filter(c => c.type === 'JSXText').map(c => c.value || c.raw || '').join('').trim();
      anchors.push({ file, kind: 'structural', path, tag, domId, text, fingerprint:hash(JSON.stringify([tag,domId||null,text])), range: [node.start, node.end] });
      if (!['script', 'style'].includes(tag)) walk(node.children, path);
    }
  }
  walk(ast.body);
  return anchors;
}

export function resolveAnchor(anchor, source) {
  if (anchor.kind === 'range') return { state: 'read-only', reason: 'RANGE_NOT_WRITABLE', anchor };
  const all = indexAnchors(source, anchor.file);
  const matches = all.filter(a => (anchor.kind === 'attr' ? a.domId === anchor.domId : anchor.kind === 'content' ? a.tag === anchor.tag && a.text === anchor.text : a.path === anchor.path && a.tag === anchor.tag) && (!anchor.fingerprint || a.fingerprint===anchor.fingerprint));
  return matches.length === 1 ? { state: 'bound', anchor: matches[0] } : { state: matches.length ? 'ambiguous' : 'unbound' };
}
