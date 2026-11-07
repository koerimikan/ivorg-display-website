// Writes robots.txt and sitemap.xml into the static build. The sitemap needs
// absolute URLs, so it is only emitted when IVORG_SITE_URL / `site` is set;
// otherwise robots.txt is written without a Sitemap line and a warning is logged.
import { writeFile } from 'node:fs/promises';

export const PUBLIC_ROUTES = ['/', '/discography/', '/newsletter/'];

export function robotsTxt(site) {
  return 'User-agent: *\nAllow: /\n' + (site ? `Sitemap: ${new URL('/sitemap.xml', site).href}\n` : '');
}

export function sitemapXml(site, routes = PUBLIC_ROUTES) {
  const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    routes.map(route => `  <url><loc>${escape(new URL(route, site).href)}</loc></url>`).join('\n') + '\n</urlset>\n';
}

export default function seoFiles() {
  let site;
  return {
    name: 'ivorg-seo-files',
    hooks: {
      'astro:config:done': ({ config }) => { site = config.site; },
      'astro:build:done': async ({ dir, logger }) => {
        await writeFile(new URL('robots.txt', dir), robotsTxt(site));
        if (site) await writeFile(new URL('sitemap.xml', dir), sitemapXml(site));
        else logger.warn('IVORG_SITE_URL is not set: sitemap.xml skipped, canonical/og URLs are root-relative.');
      }
    }
  };
}
