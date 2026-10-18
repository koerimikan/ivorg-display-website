# IVORG — Pi Agent handoff

## Latest user intent (authoritative)

- Build an avant-garde club website with HOME / MANIFESTO, DISCOGRAPHY / MATRIX, NEWSLETTER / EDITORIAL ARCHIVE.
- User superseded the single-file requirement: pages must be decoupled, then explicitly chose **Astro + GSAP**.
- User relaxed global playback: player belongs to the album page. On leaving discography, pause; on returning retain selection/position without autoplay.
- User explicitly requested DeepSeek Flash Pi assistance and a handoff at 50% remaining account allowance. This draft was prepared at 51% remaining in the five-hour window; update the checkpoint below when threshold is reached.
- Work locally in `E:\Citrus Cafe\小白\ivorg-display-website`; do not deploy, push, overwrite unrelated projects, or expose credentials.

## Current architecture

- Astro **7.3.8**, GSAP **3.15.0**, Node **22.21.0**. Astro 7.4 requires Node >=22.22; do not upgrade the machine globally. 7.3.8 supports current Node.
- `src/layouts/SiteLayout.astro`: shared nav, Chicago clock, grid inspector, noise, marquee, persistent wipe element, ClientRouter.
- `src/pages/index.astro`: declaration typography, asymmetric album/newsletter posters, parallax.
- `src/pages/discography.astro`: independent album deck, tracklist, page-local AudioDeck.
- `src/pages/newsletter.astro`: index and editorial reader, authored with Pi.
- `src/styles/{shell,home,discography,newsletter}.css`: separated styles. Shell uses `body[data-page=discography]` for player clearance.
- `src/lib/data.js`: 3 demo albums × 4 tracks, 3 illustrative newsletters. No real artist claims; previews are oscillators, not vocal-library recordings.
- `src/lib/artwork.js`: original SVG album covers.
- `src/lib/audio.js`: session-level engine, synth / MediaElement -> gain -> compressor -> AnalyserNode; album UI pauses engine on cleanup.
- `src/scripts/{app,motion,home,discography,newsletter}.js`: mount/unmount; AbortController, ResizeObserver and rAF cleanup.
- GSAP covers the viewport during Astro's `astro:before-preparation` loader; unload page effects at `astro:before-swap`; mount/reveal at `astro:page-load`.

## Commands / verification

```powershell
npm install
npm run dev -- --host 127.0.0.1
npm run build
npm audit
```

- Local dev URL: `http://127.0.0.1:4321/`.
- Build already passed: static `/`, `/discography/`, `/newsletter/` generated.
- `npm audit fix` completed; audit currently reports zero vulnerabilities.
- Browser QA passed in the Codex browser: all routes, rapid navigation, back navigation, synth selection, keyboard seek, local WAV upload/playback, leaving album pauses and returning preserves selection/position, newsletter issue switch and paper/night mode. Desktop 1440x960 and mobile 390x844 checked. Mobile mask overflow was fixed and rechecked. No console script errors observed.
- A Codex-owned dev server is currently running (session is turn-local; check port before starting another).

## Pi assistance already used

- Installed Pi CLI 1.3.0; available provider/model: `deepseek/deepseek-flash`.
- Direct tool-calling emitted raw DSML rather than executing tools. Do not claim that mode edited files.
- Successful fallback: Pi `--no-tools --mode json --print` with explicit context attachments. It returned a JSON `files` array; Codex validated allowed paths and saved `newsletter.astro` + `newsletter.js`.
- Task specification: `docs/PI_NEWSLETTER_TASK.md`.
- Local raw response: `previews/pi-newsletter.jsonl` (ignored by Git). Never copy provider auth/config into the repo.

Example delegation pattern (adjust task file and attached context to the actual task):

```powershell
pi --provider deepseek --model deepseek-flash --thinking medium --no-extensions --no-mcp --no-skills --no-prompt-templates --no-session --no-tools --mode json -p '@docs/PI_NEWSLETTER_TASK.md' '@src/lib/data.js' 'Return complete file contents as JSON files array. No tool-call syntax.'
```

## Completion and next work

- Three decoupled Astro routes, shared layout, GSAP wipe and per-page cleanup are implemented.
- Page-local album playback, actual Web Audio analyser, local file support and newsletter reader are implemented.
- Intermediate vanilla files were removed individually after migration; earlier single-file code is recoverable from Git.
- README, design notes and tooling references now describe Astro; package-lock is retained and `.astro/` is ignored.
- Screenshots: `previews/astro-home.jpg`, `astro-discography.jpg`, `astro-newsletter.jpg` (ignored outputs).
- Final build/audit/Git whitespace checks should be rerun only after a new code change.

Future work, only when the user requests it: replace illustrative content with actual club records and music; test Safari/Firefox and real touch devices; refine motion from user feedback; consider Astro content collections and individual issue URLs. CanvasState export has NOT been migrated; do not claim otherwise. No deployment or push is authorized by this handoff.

## Git

Branch main; origin `https://github.com/koerimikan/ivorg-display-website.git`.
Earlier commits: f02d13b scaffold, b2b8f8e old single-file showcase, 1df57d0 remote documentation.
Migration code and this handoff are in the current project; use `git status` and `git log` for the authoritative latest commit state. Preserve concurrent user changes.

## Allowance checkpoint

Threshold crossed: latest observed five-hour remaining **47%**, weekly remaining **76%**. This document existed before crossing (draft at 51%) and was updated immediately after the next allowance reading. No reset credits used. Browser QA and integration continue; refresh the required-next-work list before a final handoff.
