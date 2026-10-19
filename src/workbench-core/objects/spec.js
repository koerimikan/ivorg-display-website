import sax from 'sax';
import { createHash } from 'node:crypto';
import schema from './spec-schema.json' with { type: 'json' };

export class ContractError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
export const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code, detail) => { throw new ContractError(code, detail); };
const ID = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_-]+)+$/;
const PREFIX = { PageObject: 'page.', ComponentObject: 'cmp.', ComponentZone: 'zone.', Node: 'node.', TransitionObject: 'tx.', TransitionDefinition: 'td.', TransitionBinding: 'bnd.', TransitionInstance: 'ti.', Link: 'lnk.' };

export function parseSpec(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > 256 * 1024) fail('SPEC_SIZE', 'max 256 KiB');
  if (/<!DOCTYPE|<!ENTITY|<\?[^?]*(?:stylesheet)|schemaLocation|XInclude/i.test(xml)) fail('SPEC_EXTERNAL', 'external declarations prohibited');
  const parser = sax.parser(true, { xmlns: true, trim: false });
  const stack = [], ids = new Set(); let root, count = 0;
  parser.ondoctype = () => fail('SPEC_EXTERNAL', 'DTD prohibited');
  parser.onprocessinginstruction = ({ name }) => { if (name !== 'xml') fail('SPEC_EXTERNAL', name); };
  parser.onopentag = element => {
    if (++count > 4096 || stack.length > 32) fail('SPEC_LIMIT', 'tree budget');
    const rule = schema.elements[element.local];
    if (!rule || element.uri !== schema.namespace) fail('SPEC_ELEMENT', element.name);
    if (stack.length && !schema.elements[stack.at(-1).tag].children.includes(element.local)) fail('SPEC_CHILD', element.local);
    const attrs = Object.create(null);
    for (const a of Object.values(element.attributes)) {
      if (a.uri === 'http://www.w3.org/2000/xmlns/') continue;
      if (a.uri || !rule.attributes.includes(a.local)) fail('SPEC_ATTRIBUTE', `${element.local}.${a.name}`);
      attrs[a.local] = a.value;
    }
    for (const key of rule.required) if (!attrs[key]?.trim()) fail('SPEC_REQUIRED', `${element.local}.${key}`);
    for (const key of ['enabled', 'reusable', 'required', 'locked']) if (attrs[key] && !['true', 'false'].includes(attrs[key]) && key !== 'locked') fail('SPEC_BOOLEAN', key);
    if (attrs.enabled && !['true', 'false'].includes(attrs.enabled)) fail('SPEC_BOOLEAN', 'enabled');
    const identity = attrs.id || attrs.documentId;
    if (identity) {
      if (!ID.test(identity) || ids.has(identity)) fail('SPEC_ID', identity);
      if (PREFIX[element.local] && !identity.startsWith(PREFIX[element.local])) fail('SPEC_ID_TYPE', identity);
      ids.add(identity);
    }
    if (attrs.namespace && attrs.namespace !== schema.namespace) fail('SPEC_NAMESPACE', attrs.namespace);
    if (attrs.strategy && !['replace', 'merge', 'append'].includes(attrs.strategy)) fail('SPEC_OVERRIDE', attrs.strategy);
    if (element.local === 'TransitionBinding') {
      if (!['click', 'wheel', 'touch', 'pageLoad', 'componentEvent'].includes(attrs.trigger)) fail('SPEC_TRIGGER', attrs.trigger);
      if (!['cover', 'uncover', 'inPlace', 'none'].includes(attrs.effect)) fail('SPEC_EFFECT', attrs.effect);
    }
    if (element.local === 'TransitionDefinition' && !['beforeSwap', 'afterSwap', 'inPlace'].includes(attrs.phase)) fail('SPEC_PHASE', attrs.phase);
    const node = { tag: element.local, attrs: { ...attrs }, text: '', children: [] };
    if (stack.length) stack.at(-1).children.push(node);
    else { if (root || node.tag !== 'Spec') fail('SPEC_ROOT', 'one Spec root required'); root = node; }
    stack.push(node);
  };
  parser.ontext = text => { if (stack.length) stack.at(-1).text += text; };
  parser.oncdata = text => { if (stack.length) stack.at(-1).text += text; };
  parser.onclosetag = () => stack.pop();
  parser.onerror = error => fail('SPEC_XML', error.message);
  parser.write(xml).close();
  if (!root || root.attrs.specVersion !== '1.0.0') fail('SPEC_VERSION', 'expected 1.0.0');
  return root;
}

export function specToGraph(root, specHash) {
  const objects = [], references = [];
  function visit(node, parentId, transitionObjectId) {
    const id = node.attrs.id || node.attrs.documentId;
    const transitionId = node.tag === 'TransitionObject' ? id : transitionObjectId;
    if (id) {
      const object = { objectId: id, type: node.tag, version: 1, fields: { ...node.attrs }, children: [],
        description: node.children.filter(c => c.tag === 'Description').map(c => c.text.trim()).join('\n'),
        overrides: node.children.filter(c => c.tag === 'Override').map(c => ({ ...c.attrs })),
        params: Object.fromEntries(node.children.filter(c => c.tag === 'Param').map(c => [c.attrs.name, { ...c.attrs }])),
        provenance: { sourceRef: node.attrs.sourceRef || 'design-only', specHash } };
      if (node.attrs.extendsRef) object.extendsRef = node.attrs.extendsRef;
      if (node.attrs.locked) object.locked = node.attrs.locked.split(',');
      if (transitionId && id !== transitionId) object.transitionObjectId = transitionId;
      objects.push(object);
      if (parentId) objects.find(o => o.objectId === parentId).children.push(id);
    }
    if (node.tag === 'ComponentRef') {
      objects.find(o => o.objectId === parentId).children.push(node.attrs.ref);
    }
    for (const [name, value] of Object.entries(node.attrs)) {
      if (['layoutRef', 'ref', 'componentRef', 'linkRef', 'deckRef', 'fromPage', 'toPage', 'definitionRef', 'bindingRef', 'scopeObject', 'targetObject', 'fromObject', 'extendsRef'].includes(name)) references.push({ owner: id || parentId, field: name, target: value });
    }
    for (const child of node.children) visit(child, id || parentId, transitionId);
  }
  visit(root, null, null);
  return { schemaVersion: 1, projectId: root.attrs.projectId, specHash, objects, references };
}
