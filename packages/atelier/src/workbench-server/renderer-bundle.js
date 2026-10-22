import { build } from 'esbuild';
const bundles = new Map();
export async function mermaidBundle(root) {
  if (!bundles.has(root)) bundles.set(root, build({ absWorkingDir: root, stdin: { contents: "import mermaid from 'mermaid'; export default mermaid;", resolveDir: root, sourcefile: 'workbench-mermaid-entry.js' }, bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022', minify: true, sourcemap: false, logLevel: 'silent' }).then(result => result.outputFiles[0].contents).catch(error => { bundles.delete(root); throw error; }));
  return bundles.get(root);
}
