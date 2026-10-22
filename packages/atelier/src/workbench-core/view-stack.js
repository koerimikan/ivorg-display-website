export function createViewStack(initial = { zoom: 1, panX: 0, panY: 0, selection: null, scrollX: 0, scrollY: 0 }) {
  let state = { kind: 'macro', viewport: structuredClone(initial) }; const stack = [];
  return {
    get state() { return structuredClone(state); },
    setViewport(viewport) {
      if (state.kind !== 'macro' || !['zoom','panX','panY','scrollX','scrollY'].every(k => Number.isFinite(viewport[k])) || viewport.zoom < .25 || viewport.zoom > 2) throw new TypeError('Invalid viewport');
      state.viewport = structuredClone(viewport);
    },
    open(kind, objectId) {
      if (!['page','transition'].includes(kind)) throw new TypeError('Invalid view');
      if (state.kind === 'macro') state.viewport.selection = objectId;
      stack.push(structuredClone(state)); state = { kind, objectId };
      return this.state;
    },
    back() { if (stack.length) state = stack.pop(); return this.state; }
  };
}
