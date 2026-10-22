import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('./src/preview-bridge.js',import.meta.url))],outfile:fileURLToPath(new URL('./dist/atelier-client.js',import.meta.url)),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
