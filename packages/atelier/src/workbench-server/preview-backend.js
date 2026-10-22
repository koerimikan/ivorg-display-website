import { spawn } from 'node:child_process';
import path from 'node:path';
import { mkdir, readFile, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { detectSandbox } from './sandbox.js';
import { hash } from '../workbench-core/objects/spec.js';
import { deny } from './auth.js';
import { dependencyLock } from './dependency-lock.js';

function dockerCommand(docker, args, timeoutMs = 5000) {
  return new Promise(resolve => {
    let stdout = '', stderr = '', finished = false;
    const child = spawn(docker, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = result => { if (finished) return; finished = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { child.kill(); finish({ code: null, error: 'PREVIEW_TIMEOUT' }); }, timeoutMs);
    for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) stream.on('data', data => {
      if (name === 'stdout') stdout += data; else stderr += data;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 200000) { child.kill(); finish({ code: null, error: 'PREVIEW_OUTPUT_LIMIT' }); }
    });
    child.on('error', () => finish({ code: null, error: 'PREVIEW_BACKEND_UNAVAILABLE' }));
    child.on('close', code => finish({ code, stdout, stderr }));
  });
}

export async function previewBackend(root, { docker = 'docker', image = process.env.COMPANION_PREVIEW_IMAGE } = {}) {
  const backend = await detectSandbox({ docker, image });
  if (!backend.available) return { ...backend, mode: 'static-ast', ssrExecuted: false };
  const inspected = await dockerCommand(docker, ['image', 'inspect', image, '--format', '{{json .}}']);
  if (inspected.code !== 0) return { available: false, mode: 'static-ast', reason: 'Build-image attestation unavailable', ssrExecuted: false };
  const facts = JSON.parse(inspected.stdout);
  const lockDigest = hash(await readFile(await dependencyLock(root)));
  if (facts.Config?.Labels?.['io.ivorg.preview.lock-sha256'] !== lockDigest || facts.Config?.Labels?.['io.ivorg.preview.runtime'] !== 'astro-node') {
    return { available: false, mode: 'static-ast', reason: 'Build image must contain Linux dependencies matching the exact lockfile', ssrExecuted: false };
  }
  return { ...backend, docker, image, lockDigest, mode: 'container-ssr' };
}

export function attestPreviewContainer(config) {
  const host = config?.HostConfig;
  if (!host || host.NetworkMode !== 'none' || !host.ReadonlyRootfs || host.Privileged ||
      !host.CapDrop?.includes('ALL') || !host.SecurityOpt?.includes('no-new-privileges') ||
      host.PidsLimit !== 128 || host.Memory !== 512 * 1024 * 1024 || config.Config?.User !== '65534:65534' ||
      config.Mounts?.length !== 2 || config.Mounts.some(m => !['/in', '/out'].includes(m.Destination)) ||
      !config.Mounts.some(m => m.Destination === '/in' && m.Type === 'bind' && !m.RW) ||
      !config.Mounts.some(m => m.Destination === '/out' && m.Type === 'bind' && m.RW)) deny('PREVIEW_ATTESTATION');
  return true;
}

export async function runSnapshotBuild(snapshot, backend, { timeoutMs = 60000, baseline = false } = {}) {
  if (!backend.available || backend.mode !== 'container-ssr') deny('PREVIEW_BACKEND_UNAVAILABLE');
  const output = path.join(snapshot, baseline ? 'before-output' : 'after-output');
  const input = baseline ? path.join(snapshot, 'before') : path.join(snapshot, 'after');
  if ([input, output].some(p => p.includes(','))) deny('PREVIEW_PATH');
  await mkdir(output, { recursive: true, mode: 0o777 });
  await chmod(output,0o777);
  const name = 'cw-preview-' + randomUUID();
  const script = `import fs from 'node:fs';
fs.cpSync('/in','/tmp/project',{recursive:true});
fs.symlinkSync('/opt/workbench/node_modules','/tmp/project/node_modules','dir');
const {build}=await import('/opt/workbench/node_modules/astro/dist/index.js');
await build({root:'/tmp/project',outDir:'/out/dist',cacheDir:'/out/cache',vite:{cacheDir:'/out/vite'}});`;
  const args = ['create', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--pids-limit', '128', '--memory', '512m', '--cpus', '1', '--user', '65534:65534', '--mount', `type=bind,source=${input},destination=/in,readonly`, '--mount', `type=bind,source=${output},destination=/out`, '--tmpfs', '/tmp:rw,noexec,nosuid,size=256m', '--workdir', '/tmp', '--env', 'HOME=/tmp/home', '--entrypoint', 'node', backend.image, '--input-type=module', '-e', script];
  const created = await dockerCommand(backend.docker, args);
  if (created.code !== 0) deny('PREVIEW_CREATE_FAILED', 409);
  try {
    const inspection = await dockerCommand(backend.docker, ['inspect', name, '--format', '{{json .}}']);
    if (inspection.code !== 0) deny('PREVIEW_ATTESTATION');
    attestPreviewContainer(JSON.parse(inspection.stdout));
    const build = await dockerCommand(backend.docker, ['start', '--attach', name], timeoutMs);
    if (build.error) deny(build.error, 409);
    if (build.code !== 0) deny('PREVIEW_BUILD_FAILED', 409);
    return { output, log: build.stdout + build.stderr };
  } finally {
    await dockerCommand(backend.docker, ['rm', '-f', name]);
  }
}
