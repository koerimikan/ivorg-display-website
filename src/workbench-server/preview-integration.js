import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { analyzeSource } from '../dev-studio/source-engine.js';
import { sourceRevision } from './server.js';

export default function companionPreview() {
  return { name: 'companion-p1-preview', hooks: {
    'astro:config:setup': ({ command, config, updateConfig, injectScript }) => {
      if (command !== 'dev') return;
      const root = fileURLToPath(config.root);
      injectScript('page', `import ${JSON.stringify(path.join(root, 'src/workbench/preview-bridge.js').replaceAll('\\', '/'))};`);
      updateConfig({ vite: { server: { strictPort: true }, plugins: [{
        name: 'companion-p1-read-only', enforce: 'pre', apply: 'serve',
        resolveId(id) { if (id.replaceAll('\\','/').endsWith('/dev-studio/index.js')) return '\0companion-p1-no-legacy-editor'; },
        load(id) { if (id === '\0companion-p1-no-legacy-editor') return 'export {};'; },
        transform: { order: 'pre', async handler(code, id) {
          if (!id.endsWith('.astro') || id.includes('?')) return null;
          const relative = path.relative(root, id).replaceAll('\\', '/');
          if (!relative.startsWith('src/') || relative.split('/').includes('..')) return null;
          if (await readFile(id, 'utf8') !== code) throw new Error('Preview instrumentation must precede Astro compiler');
          const result = analyzeSource(code, relative); return { code: result.code, map: result.map };
        } },
        configureServer(server) {
          if (server.config.server.host !== '127.0.0.1') throw new Error('Preview requires loopback');
          server.middlewares.use(async (req, res, next) => {
            const pathname = new URL(req.url, 'http://127.0.0.1:4321').pathname;
            if (pathname.startsWith('/__dev_studio_api')) { res.statusCode = 403; res.end('P1 read-only preview'); return; }
            if (pathname !== '/__companion/preview-state') return next();
            res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control','no-store');
            if (req.method !== 'GET') { res.statusCode = 405; res.end('{}'); return; }
            try { res.end(JSON.stringify({ docRevision: await sourceRevision(root), readOnly: true })); }
            catch { res.statusCode = 500; res.end('{"error":"Preview revision unavailable"}'); }
          });
        }
      }] } });
    }
  } };
}
