// Public-release assertions over the static build (apps/ivorg-website/dist).
// Usage: node scripts/verify-release.mjs [--dist <dir>] [--allow-missing-site]
// Fails (exit 1) on: workbench/engine residue, third-party font requests,
// missing per-route metadata, broken internal links/assets under
// trailingSlash=always, or (unless --allow-missing-site) a missing sitemap.
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const argValue = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const dist = path.resolve(argValue('--dist') || path.join(root, 'apps/ivorg-website/dist'));
const allowMissingSite = args.includes('--allow-missing-site');
const ROUTES = ['/', '/discography/', '/newsletter/'];
const failures = [], notes = [];
const fail = message => failures.push(message);

const RESIDUE = [/data-ds-id/, /data-cw-id/, /PreviewBridge|preview-bridge/, /@atelier\//, /workbench-core|workbench-server|workbench\/shell/,
  /__companion\//, /__dev_studio_api/, /csrfToken|bootstrap-owner|DEEPSEEK_API_KEY/, /COMPANION_P1/];
const THIRD_PARTY = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/];

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file, out); else out.push(file);
  }
  return out;
}
const exists = async file => { try { return (await stat(file)).isFile(); } catch { return false; } };
const rel = file => path.relative(dist, file).replaceAll('\\', '/');

async function resolveInternal(ref, fromFile) {
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return true;
  const target = clean.startsWith('/') ? path.join(dist, decodeURIComponent(clean)) : path.resolve(path.dirname(fromFile), decodeURIComponent(clean));
  if (!target.startsWith(dist)) return false;
  if (clean.endsWith('/')) return exists(path.join(target, 'index.html'));
  if (await exists(target)) return true;
  if (!path.extname(clean) && await exists(path.join(target, 'index.html'))) {
    fail(`TRAILING_SLASH ${rel(fromFile)} -> ${ref} (page link without trailing slash)`);
    return true;
  }
  return false;
}
const isInternal = ref => ref && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);

const files = await walk(dist);
let textFiles = 0, refsChecked = 0;
for (const file of files) {
  if (!/\.(?:html|js|css|xml|txt|json|svg)$/.test(file)) continue;
  textFiles++;
  const text = await readFile(file, 'utf8');
  for (const re of RESIDUE) if (re.test(text)) fail(`RESIDUE ${rel(file)} ${re}`);
  for (const re of THIRD_PARTY) if (re.test(text)) fail(`THIRD_PARTY_FONT ${rel(file)} ${re}`);
  if (file.endsWith('.css')) {
    for (const [, raw] of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      if (!isInternal(raw) || raw.startsWith('data:')) continue;
      refsChecked++;
      if (!await resolveInternal(raw, file)) fail(`DEAD_ASSET ${rel(file)} -> ${raw}`);
    }
  }
}

let siteOrigin = null;
for (const route of ROUTES) {
  const file = path.join(dist, route, 'index.html');
  if (!await exists(file)) { fail(`MISSING_ROUTE ${route}`); continue; }
  const { document } = parseHTML(await readFile(file, 'utf8'));
  const meta = sel => document.querySelector(sel)?.getAttribute('content')?.trim();
  if (!document.documentElement.getAttribute('lang')) fail(`NO_LANG ${route}`);
  if (!document.querySelector('title')?.textContent.trim()) fail(`NO_TITLE ${route}`);
  for (const [label, sel] of [['description', 'meta[name="description"]'], ['og:title', 'meta[property="og:title"]'], ['og:description', 'meta[property="og:description"]'],
    ['og:image', 'meta[property="og:image"]'], ['og:url', 'meta[property="og:url"]'], ['twitter:card', 'meta[name="twitter:card"]']]) if (!meta(sel)) fail(`NO_META ${route} ${label}`);
  if (!document.querySelector('link[rel="icon"]')) fail(`NO_FAVICON ${route}`);
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
  if (canonical) {
    const url = new URL(canonical);
    siteOrigin ??= url.origin;
    if (url.pathname !== route) fail(`CANONICAL_MISMATCH ${route} ${canonical}`);
    if (!/^https?:\/\//.test(meta('meta[property="og:image"]') || '')) fail(`OG_IMAGE_NOT_ABSOLUTE ${route}`);
  }
  const refs = [];
  for (const el of document.querySelectorAll('[href]')) refs.push(el.getAttribute('href'));
  for (const el of document.querySelectorAll('[src]')) refs.push(el.getAttribute('src'));
  for (const el of document.querySelectorAll('[srcset]')) for (const part of el.getAttribute('srcset').split(',')) refs.push(part.trim().split(/\s+/)[0]);
  for (const el of document.querySelectorAll('[data-preview]')) refs.push(el.getAttribute('data-preview'));
  const og = meta('meta[property="og:image"]');
  if (og) refs.push(siteOrigin && og.startsWith(siteOrigin) ? og.slice(siteOrigin.length) : og);
  for (const el of document.querySelectorAll('a[target="_blank"]')) if (!/noopener/.test(el.getAttribute('rel') || '')) fail(`UNSAFE_BLANK ${route} ${el.getAttribute('href')}`);
  for (const ref of refs) {
    if (!isInternal(ref)) continue;
    refsChecked++;
    if (!await resolveInternal(ref, file)) fail(`DEAD_LINK ${route} -> ${ref}`);
  }
}

if (!await exists(path.join(dist, 'robots.txt'))) fail('NO_ROBOTS');
const hasSitemap = await exists(path.join(dist, 'sitemap.xml'));
if (hasSitemap) {
  const xml = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
  for (const route of ROUTES) if (!xml.includes(`${siteOrigin || ''}${route}</loc>`)) fail(`SITEMAP_MISSING ${route}`);
  if (!(await readFile(path.join(dist, 'robots.txt'), 'utf8')).includes('Sitemap: ')) fail('ROBOTS_NO_SITEMAP_LINE');
} else if (allowMissingSite) notes.push('sitemap.xml absent (IVORG_SITE_URL unset) — allowed by --allow-missing-site');
else fail('NO_SITEMAP: set IVORG_SITE_URL to the production origin and rebuild');

for (const n of notes) console.log('NOTE ' + n);
if (failures.length) { for (const f of failures) console.error('FAIL ' + f); console.error(`RELEASE_VERIFY FAIL failures=${failures.length}`); process.exit(1); }
console.log(`RELEASE_VERIFY PASS files=${files.length} textFiles=${textFiles} refsChecked=${refsChecked} routes=${ROUTES.length} site=${siteOrigin || 'unset'}`);
