// Disposable host sandbox: a throwaway git checkout of apps/ivorg-website in
// the OS temp dir, with node_modules linked (junction) to the workspace.
// The real host is never written. `git status --porcelain` on the sandbox is
// the zero-diff oracle after Undo.
import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const host = path.join(repo, 'apps/ivorg-website');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });

export async function createDisposableHost() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'atelier-e2e-host-'));
  for (const item of ['src', 'workbench', 'public', 'astro.config.mjs', 'package.json']) await cp(path.join(host, item), path.join(root, item), { recursive: true });
  await cp(path.join(repo, 'package-lock.json'), path.join(root, 'package-lock.json'));
  await symlink(path.join(repo, 'node_modules'), path.join(root, 'node_modules'), 'junction');
  await writeFile(path.join(root, '.gitignore'), 'node_modules/\n.companion/\n.astro/\ndist/\n');
  git(root, 'init', '-q');
  git(root, '-c', 'core.autocrlf=false', 'add', '-A');
  git(root, '-c', 'user.name=atelier-e2e', '-c', 'user.email=e2e@localhost', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'disposable baseline');
  const baseline = git(root, 'rev-parse', 'HEAD').trim();
  return {
    root, baseline,
    status: () => git(root, 'status', '--porcelain=v1'),
    diff: () => git(root, 'diff', '--stat'),
    dispose: () => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  };
}
