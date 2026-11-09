# Release Readiness Report

**Date:** 2026-11-06 · **Branch:** `release/readiness` (from `main` @ `de4d56c`) · nothing has been committed, pushed, deployed or merged.
Evidence lives in `verification/release-readiness/`. The final run is in `final/`.

**Verdict**
- **Track 1 (IVORG site): Public Production Ready.** The newsletter now carries the club's real Issue 01; no demo/sample content is left on any route. The production domain is **`https://ivorg.net`**, and the production build verifies against it (rows 51–53). The one remaining step is outside the repo: `ivorg.net` is on Cloudflare DNS but has no A/CNAME record yet, and no hosting is configured for this GitHub repo.
- **Track 2 (Atelier): Distributable Beta, with the real-LLM closed loop MEASURED.** It ran 17/17 against the live DeepSeek model (`final/e2e-live/e2e-report.json`, `modelMode: deepseek-live`), and also passes with the fixture model, including recorded failure cases. The installer was installed, smoke-tested and uninstalled cleanly.

**Evidence labels**
- **MEASURED (实测通过)**: ran in this session; output saved.
- **STATIC (静态推断)**: inferred from code or config; not executed.
- **BLOCKED (阻塞)**: needs a human-held resource.

---

## Phase 3 — Final gate (`final/`)

| # | Command | Result | Label |
| --- | --- | --- | --- |
| 10 | `npm run gate -- P4` | **ALL AUTOMATED GATES PASS** (build, residue, baseline-53, MotionBaker 27/693, bridge-static, P1–P4 = 126) | MEASURED |
| 11–12 | `npm run build` with no `IVORG_SITE_URL` → `verify-release` | exit 1 `NO_SITEMAP` (fails closed without a domain) | MEASURED |
| 13–14 | `IVORG_SITE_URL=https://ivorg.example npm run build` → `npm run verify:release` | `RELEASE_VERIFY PASS files=671 refsChecked=692 routes=3` | MEASURED (`.example` is a reserved test domain) |
| 15 | `npm run test:release` | 10/10 pass (8 release-site tests including 8 injected-defect falsifications, plus 2 Journal `replaceFile` tests) | MEASURED |
| 16 | `npm run test:bootstrap` | 2/2 pass | MEASURED |
| 17 | workspace-decoupling, visual-shell, rhine ×3, preview-interaction, dsh-adapter | 64/64 pass | MEASURED |
| 18 | `npm run test:dsh:runtime` (real SDK, local inference endpoint) | PASS | MEASURED (flaky under parallel load, see open items) |
| 19 | `scripts/e2e/site-smoke.mjs` (real headless Edge on the production build) | 3 routes: 0 console errors, 0 failed requests, 5 local font families loaded, no horizontal overflow, ClientRouter navigation works, 0 third-party requests | MEASURED |
| 20-live | `DEEPSEEK_API_KEY=… node scripts/e2e-live-harness.mjs` | **17/17 PASS against the real DeepSeek model** (`deepseek-v4-flash`). Explain correctly identified `div.matrix-heading` @ `discography.astro:27` (6.8 s); Modify returned a valid `replaceAttrLiteral` (3.9 s); apply drift 0 px; 13/13 anchors bound; Undo → `git status` empty; stale apply → 409 | MEASURED (`final/e2e-live/`) |
| 20 | `scripts/e2e-live-harness.mjs` (disposable host) | **17/17 PASS on two consecutive runs** (`20-e2e`, `20b-e2e-repeat`), fixture model + Agent failure cases | MEASURED (model quality BLOCKED) |
| — | `npm --prefix src-tauri run tauri:prepare` | stage rebuilt; inner P4 regression PASS; desktop worker tests 5/5 | MEASURED (`08-tauri-prepare.txt`) |
| — | `cargo check` | `Finished dev profile`, exit 0 | MEASURED (`07-cargo-check.txt`) |
| 21 | `npm --prefix src-tauri run tauri:build` (rebuilt after the Journal fix) | `IVORG Atelier Lab_1.0.0_x64-setup.exe` (403.97 MiB), SHA-256 `738630cc…310139` | MEASURED |
| 41–48 | Real newsletter Issue 01 (see below): `gate -- P4` → build (`IVORG_SITE_URL=https://ivorg.example`) → `verify:release` → `test:release` → site smoke → fixture E2E | gate **ALL AUTOMATED GATES PASS** (`48-…`); `RELEASE_VERIFY PASS files=671 refsChecked=692`; release tests 11/11; `SITE_SMOKE PASS` (3 routes, 0 errors, 0 failed requests); E2E 17/17 | MEASURED |
| 49–50 | Live DeepSeek E2E re-run **after** the newsletter change (`DEEPSEEK_API_KEY` as a process env var only) | Run 1: 14/15, FAIL at post-apply. The Journal commit, AST and anchors were all correct, but the preview iframe did not receive the HMR update within 15 s. Run 2: **17/17 PASS** (`modelMode: deepseek-live`). The key string was searched for across `verification/`, `apps/`, `scripts/` and `packages/`: 0 hits | MEASURED (`final/e2e-live-newsletter/`) |
| 51–53 | `IVORG_SITE_URL=https://ivorg.net` build → `verify:release` → site smoke | `RELEASE_VERIFY PASS files=671 refsChecked=692 routes=3 site=https://ivorg.net`. canonical/og:url/og:image and robots/sitemap point at `https://ivorg.net/…`. `SITE_SMOKE PASS` on 3 routes | MEASURED |
| — | DNS/HTTPS for `ivorg.net` (2026-11-06) | Cloudflare nameservers (`grannbo.ns.cloudflare.com`); **no A/AAAA/CNAME**; HTTPS does not resolve. `gh api …/pages` on `koerimikan/ivorg-display-website` → 404 (no Pages site) | MEASURED |
| 54 | GitHub Pages deploy, simulated: a clean copy of only the files git would push (12 MB, `verification/` excluded) → `npm ci` → `IVORG_SITE_URL=https://ivorg.net npm run build` → `verify:release` | `npm ci` 323 packages; build OK; `RELEASE_VERIFY PASS files=672` (includes `CNAME` = `ivorg.net`). The build needs no gitignored local resources | MEASURED (Windows; CI runs on ubuntu-latest, which is STATIC) |
| 55 | PR [#1](https://github.com/koerimikan/ivorg-display-website/pull/1) merged (`337a37f`), then the `deploy-pages.yml` run on `main` | build ✅ (incl. `verify:release`), deploy ✅. `koerimikan.github.io/ivorg-display-website/` → 301 `http://ivorg.net/`. `Host: ivorg.net` sent to `185.199.108.153` serves `/newsletter/` with `ISSUE 01` | MEASURED |
| 56–60 | Wipe poster delay fix. The posters were fetched only when a wipe started: 230–514 KB, up to 1700×2200, 0.15–0.71 s download measured on ivorg.net vs a 0.56 s cover. Fix: grayscale 1100 px wipe variants (`public/artwork/wipe/`, 1.33 MB → 365 KB total); `warmPosters()` fetches and decodes the deck on idle after the first page load (skipped when motion is off or Save-Data is on). Deck paths changed through Journal tx `f7c5239c`; `motion.js`/`app.js` line counts preserved | gate ALL PASS; `RELEASE_VERIFY PASS files=676`; release tests 11/11; `SITE_SMOKE PASS` | MEASURED |
| 61 | Go-live check after Cloudflare DNS (4 A records to GitHub Pages, `www` CNAME, DNS-only) | Pages cert `approved` for `ivorg.net`, `www.ivorg.net`; **Enforce HTTPS on**. `http://ivorg.net/` → 301 `https://`; `https://ivorg.net/`, `/discography/`, `/newsletter/`, `/robots.txt`, `/sitemap.xml` → 200; `https://www.ivorg.net/` → 301 apex. Live wipe deck: 4 × 82–97 KB fetched ~1.07 s after load, no refetch on wipe | MEASURED |
| 62–63 | Installer rebuilt from current `main` code (`13ef80a`: Issue 01, demo-label policy, wipe preload) and re-verified | `IVORG Atelier Lab_1.0.0_x64-setup.exe` 404.33 MiB, SHA-256 `64ee1d5a…beeeac` (2026-11-08). Silent install → native smoke PASS → bootstrap deleted → regenerated + rotated (owner v1→v2), auto-login PASS → uninstall clean, app data removed. **Supersedes rows 21–22** (installer `738630cc…`, built before the newsletter/policy changes) | MEASURED |
| 22 | `scripts/verify-installed-desktop.ps1` | Silent install into temp; **native smoke on the installed release exe**: HttpOnly cookie read-back, real window close, 4321/4323 released. Deleting `bootstrap-owner.txt` then relaunching: credentials regenerated and rotated (owner version 1→2), auto-login OK. Silent uninstall; app data, install dir and leftover NSIS key removed | MEASURED (`22-installed-desktop.json`) |

`npm run gate:release` chains gate → build → verify → release, bootstrap and E2E tests. It needs `IVORG_SITE_URL` to pass.

Baseline before any change: `npm run gate -- P4` on `de4d56c` passed (`00-baseline-P4-gate.txt`).

---

## Phase 0 — Hygiene & portability

| Item | Change | Label |
| --- | --- | --- |
| `Start-Wallpaper-Workbench.cmd` (workspace root) | Codex-cache Node path removed. Uses `%WALLPAPER_NODE%` or `node` on PATH; checks for Node ≥ 24 with an explicit message | MEASURED fail path on Node 22 (`01-wallpaper-launcher-node22.txt`); success path STATIC |
| `scripts/configure-dsh.mjs` | `--harness` → `DSH_HARNESS_PATH` / `COMPANION_DSH_ROOT`; exits 2 with `DSH_ROOT_REQUIRED` | STATIC |
| ivorg docs (`INTEGRATION_HANDOFF`, `DSH_AGENT_IMPLEMENTATION`, `PI_HANDOFF`, `PI_RESOURCE_ANALYSIS`) | Machine paths → env vars / repo-relative paths | STATIC |
| mint-atelier `README`, `wallpaper-workbench/README`, `HANDOFF-GPT`, `PENPOT-NATIVE-MOVE`, `GIT-HANDOFF`, `ARCHITECTURE` | `D:\壁纸`, `C:\Users\Alvin\…` removed from runnable instructions | STATIC |
| `.env.example` (new) | `IVORG_SITE_URL`, `DSH_HARNESS_PATH`, `COMPANION_DSH_ROOT`, `DEEPSEEK_*` | — |
| `scripts/preflight.mjs` (new) | Checks Node version, deps and ports; reports the owning PID; **never kills** anything; `--agent` warns about Harness/key | MEASURED OK + conflict (`01-preflight-*.txt`) |
| `npm run dev` / `dev:workbench` | Run preflight first; `workbench-dev.mjs` turns `EADDRINUSE` into a readable message; Astro `strictPort` | MEASURED (preflight) / STATIC (strictPort) |

Left untouched on purpose: frozen evidence logs, dated history in mint-atelier `STATUS.md`, `companion-research/`, and gitignored machine-local config. Rewriting recorded evidence would falsify it.

**mint-atelier:** on `feat/penpot-editor-probe` @ `abeb609` with Node 24.22.1: **73/73 tests, `tsc --noEmit`, `penpot:build` all pass** (MEASURED). **Not merged:** `feat/portable-sync` holds commit `b09bba2` (finished wallpapers + product plan), which the probe branch lacks. The two branches have diverged. The convergence plan is in `mint-atelier/BRANCH_STATUS.md` and needs the owner's approval.

---

## Phase 1 — IVORG public launch

| Item | What changed | Label |
| --- | --- | --- |
| Unconfirmed date | `releaseDateSpec()` shows `EDITION ℗ 2026` while `dateConfirmed=false`, and `RELEASED 2026.08.24` once the club confirms. The description cites the catalogue number instead of the printed date | MEASURED |
| Listen links | `LISTEN_LINKS` slot. Only `https` links without userinfo are rendered, as pills with `rel="noopener noreferrer"`. Empty today, so the page shows "out now on physical CD; streaming links will be listed here once published" | MEASURED |
| Preview player | `AUDIO_PREVIEWS` + `src/scripts/audio-preview.js`: one `<audio>`, a single active track, plays only on a user gesture; handles rejection, `ended` and `error`. Its lifecycle is owned by `app.js` (`astro:page-load` mount, `astro:before-swap` cleanup), so nothing keeps playing or stacks across ClientRouter swaps. **No control is rendered without a licensed file** | MEASURED with a fake `Audio`; real playback STATIC (no licensed audio exists) |
| Club credits + lyrics (2026-11-06) | From the club's "Song Info" doc: per-track MUSIC / LYRICS credits for all 7 tracks, Chinese subtitles (雨, 第零次重逢, 归乡, 月), expandable lyrics for the 4 tracks that have them, and a "Friends of IVORG" credit line. Rendered as one plain-text node each (`white-space: pre-line`), never as HTML. Source recorded in `docs/resources/content-draft.json` → `additionalSources` | MEASURED (`release-site.test.mjs`: 7 credits, 4 lyric panels, no child markup; screenshots `final/site/discography-*.png`; P4 gate `40-…` PASS) |
| Missing data left out | Following the owner's instruction "没有的就不写了" (leave out what doesn't exist): the "streaming links will be listed here" placeholder is gone, replaced by `IVORG Index Zero / physical CD release.` No date, player or link renders until real data exists | MEASURED |
| Newsletter | The three sample issues were replaced by the club's real **Issue 01** (VOCANEWS news, voicebank summaries + table, Vocaloid 7 article, Satokan no Kanzume essay by Alexandra Poulos). Sources: the Drive folder *IVORG Newsletter Designs* (pages 6–7) and the shared Docs/Sheet. No publish date exists, so none is shown. Unfinished material (TODO entries, meeting notes, the festival sheet whose rows all say "recheck before publication") was left out. Full source/omission/conflict list: `docs/resources/content-draft.json` → `newsletter-issue-01` | MEASURED |
| Newsletter transaction | `newsletter.astro` + Spec + canonical registry changed as **one Journal transaction** (`af0d5958…`, COMMITTED): isolated dry-run (static-ast; 99 objects, 13/13 anchors bound) → signed approval → per-file CAS. `data.js` and `reader-contract.js` are outside Atelier's writable surface (`.astro/.css` only) and were edited as host code | MEASURED |
| L3 policy | `adapters/ivorg/spec-policy.js` no longer hard-codes "demo": `contentNature` must be `illustrativeDemo` or `real`, natures may not be mixed, demo issues **require** a DEMO/ILLUSTRATIVE label and real issues **forbid** one (`DEMO_LABEL_STALE`); SSR-initial must be the first Issue. `inv.demoLabel` removed from the Spec. Tests: `spec-l3` (incl. mixed/stale/missing-label falsifications) | MEASURED |
| Reader contract | Optional date, per-table `columns`/`tableLabel`, no NEXT button when there is only one issue, footer `END OF ISSUE 01` (no "DEMO ARCHIVE"). Still text nodes only, no `innerHTML`/`set:html`. Parity test now compares DOM-normalised text runs: linkedom splits SSR text at `&amp;` ("R&B"), which a browser does not | MEASURED (`parity.test.mjs`) |
| Fonts | Google Fonts removed. `@fontsource/{syne,oswald,inter,noto-sans-sc,jetbrains-mono}` pinned and self-hosted (OFL), with `font-display: swap` and unicode-range subsets. dist is about 21 MB of small subset files; browsers fetch only the ranges each page uses | MEASURED (site smoke: 5 families loaded locally, 0 third-party requests) |
| SEO | `Seo.astro`: per-route description, OG/Twitter tags, a 1200×630 OG image, SVG favicon, canonical (when the domain is known), `lang="en"` (was `zh-CN` on English content). `src/integrations/seo-files.mjs` writes `robots.txt` and `sitemap.xml` | MEASURED |
| Spec identity | `discography.astro`, `newsletter.astro` and `SiteLayout.astro` edits keep their line counts, because the Spec uses line-based `sourceRef`s | STATIC (counts asserted) |
| Purity scanner | `scripts/verify-release.mjs`: engine/Bridge residue, credentials, third-party fonts, per-route metadata, every `href/src/srcset/data-preview/og:image/url()` checked under `trailingSlash=always`, unsafe `_blank`, sitemap completeness | MEASURED + 8 falsifications |

Problems the gates caught along the way and fixed: (1) a host config module outside `src/` broke Atelier's isolated dry-run snapshot, so it was moved to `src/integrations/`. (2) Python edits turned some CRLF files into mixed line endings, so touched files were normalized to LF (the repo's `eol=lf`), and the byte-exact Spec XML was restored from git.

---

## Phase 2 — Atelier productization

### 2.1/2.2 Disposable-host E2E (`npm run test:e2e`)

The disposable host is a temp `git init` copy of the host (real repo never written). It runs the real control plane on 4323 and the real Astro + Bridge preview on 4321, driven by **real headless Edge over raw CDP**. The Agent goes through the real DeepSeek Harness SDK 0.1.0-rc.5 / Cordis loop / provider wire format, called via the workbench HTTP API.

| Step | Result |
| --- | --- |
| Real Alt+S + mouse drag in the 4321 iframe → parent receives `measure` + `selection`; `frameEpoch`/`sessionNonce` match `hello`; `source === #preview.contentWindow`; `fontsReady` | PASS |
| Captured genuine frame accepted; origin/source/epoch/nonce forgeries rejected (`ORIGIN/SOURCE/EPOCH/NONCE`) | PASS |
| Explain → evidence `src/pages/discography.astro:27`; Modify → one validated `replaceAttrLiteral` | PASS (fixture model) |
| Agent failure cases through the real SDK + HTTP API: malformed (non-JSON) output → `409 AGENT_JSON_REQUIRED`; invented evidence → `409 AGENT_EVIDENCE_REQUIRED`; extra `patch` key → `409 AGENT_RESULT_SCHEMA`; stale target revision → `409 AGENT_TARGET_EVIDENCE`; provider `429 Retry-After: 2` → quota recovery waits, probes, re-verifies facts and completes (~5.6 s; checkpoint cleared). Host unchanged throughout | PASS |
| Spatial plan → isolated dry-run (`static-ast`, `ssrExecuted=false`, static acknowledgement) → signed approval → Apply with fresh remeasure, drift **0/0/0/0 px** | PASS |
| After apply: AST has the class, **13/13 registry anchors bound**, HMR'd DOM shows the class, DOM drift **0 px** | PASS |
| Journal Undo after a new selection → `git status --porcelain` **empty** | PASS |
| Third-party edit between approve and apply → **409 `REVISION_STALE`**, foreign bytes preserved | PASS |

Every model exchange is recorded (`final/e2e/model-transcript.jsonl`, `tools=0`). Session cookies and tokens are excluded from the report.

**Real-model run — MEASURED PASS (2026-11-06):** the same harness against the live DeepSeek API, with the key supplied by the user only as a process environment variable. A scan confirms the key does not appear in the repo or the evidence. The real model's Explain and Modify outputs passed Atelier's schema, evidence and target validation without help, and the whole closed loop went green. Failure-case markers can't force a real model's output shape, so in live mode they are informational: two were refused (`AGENT_CAPABILITY`), and two came back as valid proposals that were never applied. The host was unchanged in all cases. Those failure paths are proven deterministically by the fixture run.

Not re-driven in the browser: crash recovery (`RECOVERY_REQUIRED`, read-only), which stays covered by the P2 crash-worker tests inside the gate. SSR dry-run with a container backend: none is configured here, so previews are `static-ast` only.

### 2.3 Desktop (Tauri)

- `prepare-desktop.cjs` now merges **host** `package.json` dependencies into the isolated runtime. Before this, the packaged app would have lacked `@fontsource/*`, a regression this release work had introduced. MEASURED: the stage contains all 5 font packages.
- The split-era layout (`apps/ivorg-website`, `packages/atelier`, `packages/client`) was already handled by prepare and `main.rs`. Verified by the prepare regression, the 5 desktop worker tests and `cargo check`.
- First run and repair: new `recoverBootstrapOwner()` (in `auth.js`), called by `tauri-runner.cjs` before the control server starts. If the account store exists but `bootstrap-owner.txt` is missing, it rotates the local owner password, bumps the user version (all old owner sessions are revoked), writes a new 0600 file and prints guidance. It fails closed when there is no enabled owner. `main.rs` now tells the user to restart instead of "restore the file". MEASURED by `test:bootstrap`. The Rust message change is checked by `cargo check` only.
- Installer built and **verified as installed** (row 22): WebView2 auto-login through the native cookie, a real window close releasing both ports, and bootstrap recovery on the installed app. Still manual: interactive use inside the desktop WebView (e.g. Alt+S by a person).

---

## Problems found and fixed during verification

| Finding | Evidence | Resolution |
| --- | --- | --- |
| `workspace-decoupling` Vite test hung or failed 2/3 on the branch vs 0/3 on clean `main` (`hookFailed ENOTEMPTY`) | alternating runs (logged in this session) | Latent bug: `t.after` hooks run FIFO, so the test deleted its temp root while Vite was still live. Fixed by closing the server before `rm` (with retries). **No assertion changed.** Now 5/5, and 64/64 in the suite |
| E2E Undo failed once with `EPERM` renaming the Journal's `.json` over the existing file. Windows refuses to replace a file another process holds open (AV, indexer, Vite watcher) | E2E run log; reproduced with a plain `rename` over an open handle → `EPERM` | Fail-closed held: the throw happened before any source rename, and the PREPARED record forces `RECOVERY_REQUIRED`. Fixed with `replaceFile()`: bounded retry (≤8 tries, ~1.6 s) only on `EPERM/EACCES/EBUSY`, used for both the Journal record and the host-source swap. CAS checks unchanged. Tested (`journal-replace.test.mjs`), then P4 gate + E2E ×2 re-run green |
| Live E2E run 1 after the newsletter change: post-apply HMR did not deliver the class within 15 s (source already committed correctly) | `49-e2e-live-newsletter.txt`, `e2e-report-run1.json` | **Open, flaky.** Next run 17/17; 6 earlier fixture/live runs passed. This is the preview-refresh wait, not the CAS/Journal path. Not patched: lengthening the wait would hide a real HMR regression |
| `test:dsh:runtime` failed 1 of 3 runs under parallel load (`…/users/alice/sessions` missing) | `05-dsh-runtime-smoke-*` | **Open.** Passes alone (3/3 incl. final). Session-log persistence evidently lags `client.close()` under load. Not patched, because the assertion protects a real property |

---

## Changed files (`release/readiness`, uncommitted)

**Modified:** `README.md`, `package.json`, `package-lock.json`, `apps/ivorg-website/{astro.config.mjs,package.json}`, `apps/ivorg-website/src/{layouts/SiteLayout.astro,lib/release.js,pages/discography.astro,pages/newsletter.astro,scripts/app.js,styles/discography.css}`, `apps/ivorg-website/src/lib/{data.js,reader-contract.js}`, `apps/ivorg-website/workbench/{specs/ivorg.spec.xml,objects/ivorg.object.json}` (via Journal), `docs/{DSH_AGENT_IMPLEMENTATION,INTEGRATION_HANDOFF,IVORG_WEBSITE_SPEC,PI_HANDOFF,PI_RESOURCE_ANALYSIS}.md`, `packages/atelier/src/adapters/ivorg/spec-policy.js`, `packages/atelier/src/workbench-server/{auth.js,journal.js}`, `scripts/{configure-dsh.mjs,prepare-desktop.cjs,tauri-runner.cjs,workbench-dev.mjs,workspace-decoupling.test.mjs,spec-l1.test.mjs,spec-l3.test.mjs,parity.test.mjs,preview-safety.test.mjs,agent-context.test.mjs}` (test counts 104→99 objects, 9→8 invariants; no other assertion changed), `src-tauri/{README.md,src/main.rs}`.
**New:** `.env.example`, `RELEASE_READINESS_REPORT.md`, `apps/ivorg-website/public/{favicon.svg,og/ivorg-og.jpg}`, `apps/ivorg-website/src/{components/Seo.astro,integrations/seo-files.mjs,scripts/audio-preview.js,styles/fonts.css}`, `scripts/{preflight.mjs,verify-release.mjs,release-site.test.mjs,bootstrap-recovery.test.mjs,journal-replace.test.mjs,spec-text-change.mjs,e2e-live-harness.mjs,verify-installed-desktop.ps1}`, `scripts/e2e/{disposable-host,servers,cdp,model-fixture,site-smoke}.mjs`, `verification/release-readiness/**`.
**Outside this repo:** `../Start-Wallpaper-Workbench.cmd`; mint-atelier docs + `BRANCH_STATUS.md` (uncommitted on `feat/penpot-editor-probe`).

---

## Decisions only a human can make

Per the owner's instruction "没有的就不写了", data that doesn't exist (a confirmed release date, streaming links, preview audio) is simply not shown. Those are no longer launch blockers: each one appears automatically once filled in (`RELEASE.dateConfirmed`, `LISTEN_LINKS`, `AUDIO_PREVIEWS`).

1. **Go live on `ivorg.net` (GitHub Pages, chosen by the owner).** `.github/workflows/deploy-pages.yml` builds with `IVORG_SITE_URL=https://ivorg.net`, runs `verify:release`, then deploys. It triggers on push to `main` and on manual dispatch. `apps/ivorg-website/public/CNAME` contains `ivorg.net`. Steps still needing the owner:
   - ~~Approve the commit/push, merge to `main`, enable Pages.~~ Done: merged `337a37f`, Pages live on GitHub with custom domain `ivorg.net`.
   - In Cloudflare DNS for `ivorg.net`, add A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`. Optionally add AAAA `2606:50c0:8000::153` through `8003::153`, and `www` CNAME `koerimikan.github.io`. Set them to **DNS only (grey cloud)** until GitHub issues the HTTPS certificate, then tick "Enforce HTTPS".
   - A **Cloudflare Workers project** (`ivorg-display-website`) is also connected to this repo. Its build failed on PR #1; the log is only visible in the Cloudflare dashboard, and the repo has no `wrangler` config. Either disconnect it, since GitHub Pages is the chosen host, or say if Cloudflare should host instead.
2. **Newsletter Issue 01 content check** (live now; these are editorial, not release blockers):
   - Two source conflicts were left blank on purpose. SeeU Re:Voice preorders: the draft says November 10, the designed page says December 10. MEW price: 12,980 vs 12,890 JPY.
   - Three copy fixes were applied. In the V7 article, "V7 also has … 51 voicebanks" became "V6" (the article itself says V6 two sentences later). "Re:Voi." became "Re:Voice". "Machigeita" became "Machigerita".
   - Optional additions: a publish date, the festival list once re-verified, and the unfinished voicebank/software items.
3. **Commit / PR** for `release/readiness` (nothing has been committed).
4. **mint-atelier** branch convergence (`BRANCH_STATUS.md`).
5. **Before each release**: re-run `npm run test:e2e` with `DEEPSEEK_API_KEY`; consider code-signing the installer.
