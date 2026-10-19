import path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { analyzeSource } from '../dev-studio/source-engine.js';
import { sourceManifest } from './project-source.js';
import MagicString from 'magic-string';
import { resolveAnchor } from '../workbench-core/objects/anchors.js';
import { records } from '../workbench-core/changes/structure.js';

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
        handleHotUpdate(context){const relative=path.relative(root,context.file).replaceAll('\\','/');if(!relative.startsWith('src/')||relative.split('/')[1].startsWith('workbench'))return;const layout=path.join(root,'src/layouts/SiteLayout.astro').replaceAll('\\','/');for(const module of context.server.moduleGraph.getModulesByFile(layout)||[])context.server.moduleGraph.invalidateModule(module);context.server.ws.send({type:'full-reload'});return [];},
        transform: { order: 'pre', async handler(code, id) {
          if (!id.endsWith('.astro') || id.includes('?')) return null;
          const relative = path.relative(root, id).replaceAll('\\', '/');
          if (!relative.startsWith('src/') || relative.split('/').includes('..')) return null;
          if (await readFile(id, 'utf8') !== code) throw new Error('Preview instrumentation must precede Astro compiler');
          const result = analyzeSource(code, relative);
          const registry=JSON.parse(await readFile(path.join(root,'workbench/objects/ivorg.object.json'),'utf8'));
          const insertions=[];
          for(const entry of registry.anchors.filter(e=>e.anchor.file===relative)){const bound=resolveAnchor(entry.anchor,code);if(bound.state!=='bound')continue;const record=result.records.find(r=>r.range[0]===bound.anchor.range[0]);if(record)insertions.push({at:record.insertStyleAt,id:entry.objectId});}
          const original=new MagicString(code);for(const record of result.records)original.appendLeft(record.insertStyleAt,` data-ds-id="${record.sourceId}"`);const aliases=new Map();for(const insertion of insertions){if(!aliases.has(insertion.at))aliases.set(insertion.at,[]);aliases.get(insertion.at).push(insertion.id);}for(const [at,ids]of aliases)original.appendLeft(at,` data-cw-id="${ids[0]}" data-cw-ids="${ids.join(' ')}"`);
          if(relative==='src/layouts/SiteLayout.astro'){const head=records(code).find(record=>record.tag==='head');if(!head)throw Error('Preview layout head required');original.appendLeft(head.node.openingElement.end,`<meta name="cw-preview-revision" content="${(await sourceManifest(root)).docRevision}">`);}
          return {code:original.toString(),map:original.generateMap({hires:true,includeContent:true})};
        } },
        configureServer(server) {
          if (server.config.server.host !== '127.0.0.1') throw new Error('Preview requires loopback');
          server.middlewares.use(async (req, res, next) => {
            delete req.headers?.cookie;delete req.headers?.authorization;
            const pathname = new URL(req.url, 'http://127.0.0.1:4321').pathname;
            if (pathname.startsWith('/__dev_studio_api')) { res.statusCode = 403; res.end('P1 read-only preview'); return; }
            if (pathname !== '/__companion/preview-state') return next();
            res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control','no-store');
            if (req.method !== 'GET') { res.statusCode = 405; res.end('{}'); return; }
            try {let transactionPending=false;try{for(const file of await readdir(path.join(root,'.companion/journal'))){if(file.endsWith('.json')){const journal=JSON.parse(await readFile(path.join(root,'.companion/journal',file),'utf8'));if(['PREPARED','APPLYING','RECOVERY_REQUIRED'].includes(journal.state)){transactionPending=true;break;}}}}catch(error){if(error.code!=='ENOENT')throw error;}res.end(JSON.stringify({ ...(await sourceManifest(root)), readOnly: true,transactionPending })); }
            catch { res.statusCode = 500; res.end('{"error":"Preview revision unavailable"}'); }
          });
        }
      }] } });
    }
  } };
}
