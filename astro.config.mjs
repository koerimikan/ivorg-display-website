import { defineConfig } from 'astro/config';
import devStudio from './src/dev-studio/integration.js';
import companionPreview from './src/workbench-server/preview-integration.js';
export default defineConfig({
  integrations: [process.env.COMPANION_P1 === '1' ? companionPreview() : devStudio()],
  output: 'static',
  trailingSlash: 'always',
  server: { host: '127.0.0.1', port: 4321 },
  devToolbar: { enabled: false }
});
