import path from 'node:path';
import { lstat, readFile, realpath } from 'node:fs/promises';

// A host owns its local lock, or uses the nearest containing npm workspace lock.
// Never traverse links or silently attest against an unrelated ancestor project.
export async function dependencyLock(root) {
  const host = await realpath(root);
  for (let directory = host; ; directory = path.dirname(directory)) {
    const file = path.join(directory, 'package-lock.json');
    try {
      const stat = await lstat(file);
      if (stat.isSymbolicLink() || !stat.isFile()) throw Error('DEPENDENCY_LOCK_UNSAFE');
      if (directory !== host) {
        const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
        if (!manifest.workspaces) throw Error('DEPENDENCY_LOCK_WORKSPACE_REQUIRED');
      }
      return file;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (directory === path.dirname(directory)) throw Error('DEPENDENCY_LOCK_REQUIRED');
  }
}
