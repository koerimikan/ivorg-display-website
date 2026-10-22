import { defineConfig } from 'astro/config';
import atelier from '@atelier/client/astro';
export default defineConfig({
 integrations: [atelier({ enabled: process.env.COMPANION_P1 === '1' })],
 output: 'static', trailingSlash: 'always', server: { host: '127.0.0.1', port: 4321 }, devToolbar: { enabled: false }
});
