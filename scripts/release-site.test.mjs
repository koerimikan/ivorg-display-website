import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { RELEASE, TRACKS, releaseDateSpec, listenLinks, previewFor, safePreviewPath } from '../apps/ivorg-website/src/lib/release.js';
import { createPreviewController } from '../apps/ivorg-website/src/scripts/audio-preview.js';
import { robotsTxt, sitemapXml } from '../apps/ivorg-website/src/integrations/seo-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'apps/ivorg-website/dist');
const verify = (dir, extra = []) => spawnSync(process.execPath, ['scripts/verify-release.mjs', '--dist', dir, '--allow-missing-site', ...extra], { cwd: root, encoding: 'utf8', windowsHide: true });

test('unconfirmed printed date is never shown as a release date', () => {
  assert.equal(RELEASE.dateConfirmed, false);
  assert.deepEqual(releaseDateSpec(), ['EDITION', '℗ 2026']);
  assert.deepEqual(releaseDateSpec({ ...RELEASE, dateConfirmed: true }), ['RELEASED', '2026.08.24']);
});

test('listen links and preview paths are allow-listed', () => {
  assert.deepEqual(listenLinks([{ label: 'A', url: 'https://example.org/x' }, { label: 'B', url: 'javascript:alert(1)' }, { label: 'C', url: 'http://plain.example' }, { label: '', url: 'https://example.org' }, { label: 'D', url: 'https://u:p@example.org' }]),
    [{ label: 'A', url: 'https://example.org/x' }]);
  assert.equal(safePreviewPath('/audio/previews/01-mirror.mp3'), '/audio/previews/01-mirror.mp3');
  for (const bad of ['/audio/previews/../x.mp3', 'https://cdn.example/x.mp3', '/audio/previews/x.exe', '/artwork/x.mp3']) assert.equal(safePreviewPath(bad), null, bad);
  assert.equal(previewFor(TRACKS[0]), null, 'no licensed previews configured yet');
});

class FakeAudio extends EventTarget {
  constructor() { super(); this.paused = true; this.attrs = {}; this.plays = 0; this.reject = false; }
  setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k] ?? null; } removeAttribute(k) { delete this.attrs[k]; }
  async play() { this.plays++; if (this.reject) throw new Error('NotAllowedError'); this.paused = false; }
  pause() { this.paused = true; } load() {}
}
function fixture() {
  const { document } = parseHTML(`<html><body><table><tbody id="t">${[1, 2].map(n => `<tr><td><button class="track-play" data-preview="/audio/previews/0${n}.mp3" aria-pressed="false"><span class="track-name">T${n}</span></button></td></tr>`).join('')}</tbody></table></body></html>`);
  return { document, root: document.getElementById('t'), buttons: [...document.querySelectorAll('button')] };
}
const click = (doc, el) => el.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
const tick = () => new Promise(r => setTimeout(r, 0));

test('preview controller: single active track, toggle, ended, cleanup', async () => {
  const { document, root, buttons } = fixture(); const audio = new FakeAudio(); const said = [];
  const cleanup = createPreviewController({ root, createAudio: () => audio, announce: t => said.push(t) });
  click(document, buttons[0]); await tick();
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true'); assert.equal(audio.getAttribute('src'), '/audio/previews/01.mp3');
  click(document, buttons[1]); await tick();
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'false'); assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
  click(document, buttons[1]); await tick();
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'false'); assert.equal(audio.paused, true);
  click(document, buttons[0]); await tick(); audio.dispatchEvent(new Event('ended'));
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
  click(document, buttons[0]); await tick(); cleanup();
  assert.equal(audio.paused, true); assert.equal(audio.getAttribute('src'), null);
  const plays = audio.plays; click(document, buttons[1]); await tick();
  assert.equal(audio.plays, plays, 'no handler survives cleanup (route swap)');
  assert.ok(said.some(t => t.startsWith('Playing preview')));
});

test('preview controller: autoplay rejection resets state and is announced', async () => {
  const { document, root, buttons } = fixture(); const audio = new FakeAudio(); audio.reject = true; const said = [];
  createPreviewController({ root, createAudio: () => audio, announce: t => said.push(t) });
  click(document, buttons[0]); await tick();
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'false'); assert.deepEqual(said, ['Preview could not be played.']);
});

test('preview controller is inert without configured previews', () => {
  const { document } = parseHTML('<html><body><div id="r"><span class="track-name">x</span></div></body></html>');
  let created = 0; const cleanup = createPreviewController({ root: document.getElementById('r'), createAudio: () => { created++; return new FakeAudio(); } });
  assert.equal(created, 0); cleanup();
});

test('robots and sitemap are absolute and complete', () => {
  assert.equal(robotsTxt(undefined), 'User-agent: *\nAllow: /\n');
  assert.match(robotsTxt('https://ivorg.example/'), /Sitemap: https:\/\/ivorg\.example\/sitemap\.xml/);
  const xml = sitemapXml('https://ivorg.example/');
  for (const route of ['/', '/discography/', '/newsletter/']) assert.ok(xml.includes(`<loc>https://ivorg.example${route}</loc>`));
});

test('built pages: self-hosted fonts, metadata, preview-edition labelling, no unconfirmed date', async () => {
  for (const route of ['', 'discography/', 'newsletter/']) {
    const html = await readFile(path.join(dist, route, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
    assert.match(html, /<html lang="en"/); assert.match(html, /property="og:image"/);
  }
  const disco = await readFile(path.join(dist, 'discography/index.html'), 'utf8');
  assert.doesNotMatch(disco, />PRINTED<|26\.08\.24|2026-08-24/); assert.match(disco, /EDITION/);
  assert.doesNotMatch(disco, /class="track-play"/, 'no dead play buttons without licensed previews');
  const news = await readFile(path.join(dist, 'newsletter/index.html'), 'utf8');
  assert.doesNotMatch(news, /PREVIEW EDITION|ILLUSTRATIVE|DEMO ARCHIVE/); assert.match(news, /ISSUE 01/); assert.match(news, /Alexandra Poulos/); assert.match(news, />VOICEBANK</);
});

test('verify-release passes on the build and fails on injected defects', async t => {
  const clean = verify(dist); assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  const temp = await mkdtemp(path.join(tmpdir(), 'ivorg-verify-')); t.after(() => rm(temp, { recursive: true, force: true }));
  const cases = [
    ['residue', async d => appendFile(path.join(d, 'index.html'), '<div data-ds-id="x"></div>'), /RESIDUE/],
    ['engine', async d => writeFile(path.join(d, 'leak.js'), 'import "@atelier/client";'), /RESIDUE/],
    ['google-fonts', async d => appendFile(path.join(d, 'newsletter/index.html'), '<link href="https://fonts.googleapis.com/css2?family=Inter">'), /THIRD_PARTY_FONT/],
    ['dead-link', async d => appendFile(path.join(d, 'index.html'), '<a href="/missing/">x</a>'), /DEAD_LINK/],
    ['no-slash', async d => appendFile(path.join(d, 'index.html'), '<a href="/discography">x</a>'), /TRAILING_SLASH/],
    ['dead-asset', async d => appendFile(path.join(d, 'index.html'), '<img src="/artwork/nope.webp">'), /DEAD_LINK/],
    ['meta', async d => { const f = path.join(d, 'discography/index.html'); await writeFile(f, (await readFile(f, 'utf8')).replace(/<meta property="og:image"[^>]*>/, '')); }, /NO_META \/discography\/ og:image/],
    ['blank', async d => appendFile(path.join(d, 'index.html'), '<a href="https://example.org" target="_blank">x</a>'), /UNSAFE_BLANK/],
  ];
  for (const [name, mutate, expected] of cases) {
    const dir = path.join(temp, name); await cp(dist, dir, { recursive: true }); await mutate(dir);
    const run = verify(dir); assert.equal(run.status, 1, name + ' should fail\n' + run.stdout); assert.match(run.stderr, expected, name);
  }
  const strict = spawnSync(process.execPath, ['scripts/verify-release.mjs', '--dist', dist], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (!(await readFile(path.join(dist, 'robots.txt'), 'utf8')).includes('Sitemap:')) assert.match(strict.stderr, /NO_SITEMAP/);
});

test('club-supplied credits and lyrics render as plain text on the discography page', async () => {
  const html = await readFile(path.join(dist, 'discography/index.html'), 'utf8');
  const { document } = parseHTML(html);
  assert.equal(document.querySelectorAll('.track-credit').length, 7, 'every track has music/lyrics credits');
  assert.equal(document.querySelectorAll('details.track-lyrics').length, 4, 'only the four tracks with supplied lyrics');
  const lyrics = [...document.querySelectorAll('.lyrics-text')];
  assert.ok(lyrics.every(p => p.children.length === 0), 'lyrics are a single text node, no markup');
  assert.match(lyrics[0].textContent, /与未来邂逅/);
  assert.match(document.querySelector('.track-zh').textContent, /雨/);
  assert.doesNotMatch(html, /Streaming links will be listed here/);
  assert.match(html, /Friends of IVORG/);
});
