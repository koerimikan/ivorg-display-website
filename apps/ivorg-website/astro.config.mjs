import { defineConfig } from 'astro/config';
import atelier from '@atelier/client/astro';
import seoFiles from './src/integrations/seo-files.mjs';
export default defineConfig({
 site: process.env.IVORG_SITE_URL || undefined,
 integrations: [atelier({ enabled: process.env.COMPANION_P1 === '1' }), seoFiles()],
 output: 'static', trailingSlash: 'always', server: { host: '127.0.0.1', port: 4321 }, devToolbar: { enabled: false },
 vite: { server: { strictPort: true } }
});
