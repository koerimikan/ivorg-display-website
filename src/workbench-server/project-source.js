import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { hash } from '../workbench-core/objects/spec.js';

export async function sourceManifest(root) {
  const files = [];
  async function visit(relative) {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory() && !entry.name.startsWith('workbench')) await visit(file);
      else if (entry.isFile() && /\.(astro|js|css)$/.test(file)) files.push(file);
    }
  }
  await visit('src'); files.sort();
  const sourceRevisions = Object.fromEntries(await Promise.all(files.map(async file => [file, hash(await readFile(path.join(root, file)))])));
  return { docRevision: hash(files.map(file => `${file}\0${sourceRevisions[file]}`).join('\n')), sourceRevisions };
}
export async function sourceRevision(root) { return (await sourceManifest(root)).docRevision; }
