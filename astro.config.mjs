import { defineConfig } from 'astro/config';
import devStudio from './src/dev-studio/integration.js';
export default defineConfig({
  integrations: [devStudio()],
  output: 'static',
  trailingSlash: 'always',
  server: { host: '127.0.0.1', port: 4321 },
  devToolbar: { enabled: false }
});
