import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createSourceService, createRpcMiddleware } from './server.js';

export function createStudioPlugin(service, root) {
  return {
    name: 'dev-studio:source-bridge', apply: 'serve', enforce: 'pre',
    // Astro 7's compiler also uses enforce:pre; hook order is needed before it.
    transform: {
      order: 'pre',
      async handler(code, id) {
        if (id.includes('?') || !id.endsWith('.astro')) return null;
        const file = path.relative(root, id).split(path.sep).join('/');
        if (!file.startsWith('src/') || file.split('/').includes('..')) return null;
        // Mapping offsets always refer to disk bytes decoded as UTF-16 JS strings.
        if (await readFile(id, 'utf8') !== code) throw new Error(`Studio must run before Astro compilation: ${file}`);
        const result = service.register(code, file);
        return { code: result.code, map: result.map };
      }
    },
    configureServer(server) {
      if (server.config.server.host !== '127.0.0.1') throw new Error('Dev-Studio requires server.host=127.0.0.1');
      server.middlewares.use(createRpcMiddleware(service));
    }
  };
}

export default function devStudio() {
  return {
    name: 'dev-studio',
    hooks: {
      'astro:config:setup': ({ command, config, updateConfig }) => {
        if (command !== 'dev') return;
        const root = fileURLToPath(config.root);
        const service = createSourceService({ root });
        updateConfig({ vite: { plugins: [createStudioPlugin(service, root)] } });
      }
    }
  };
}
