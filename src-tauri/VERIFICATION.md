# Tauri v2 desktop verification — 2026-10-20

## Implemented boundary

Only new files under `scripts/` and `src-tauri/` were added. Existing business, Workbench core/server, root package manifests and sealed frontend were not edited. The pre-existing user edit in `src/styles/shell.css` is preserved (SHA256 `dcef24ac0ec2ffdac1b936cc644c4bb33e9494e58c6f7807b6a71d11b8da2d5e`).

Configuration: `tauri.conf.json`, `Cargo.toml`, `Cargo.lock`, `build.rs`, `src/main.rs`, separate desktop npm manifest/lock, local application icons. Runtime resource preparation, Node supervisor, Windows packaging, native verification and five integration tests are under `../scripts/`.

## Executed checks

| Check | Actual result |
| --- | --- |
| Tauri debug build, `tauri build --debug --no-bundle` | PASS, executable built; Rust 1.99.1 / MSVC / WebView2 |
| Final optimized Release build | PASS, exit 0, `release-final-build.log` |
| NSIS offline installer | PASS, exit 0, `final-installer.log`, 326.71 MiB |
| Desktop Node integration tests | 5/5 PASS, exit 0 |
| Workbench P1/P2/P3/P4 | 30 + 31 + 33 + 32 = 126 PASS |
| Existing baseline | 53/53 PASS |
| MotionBaker | 27/27 groups, 693/693 assertions PASS |
| Astro production build, production residue and Bridge static checks | PASS through P4 gate, exit 0 |
| Native bootstrap login and CookieManager read-back | PASS, real native WebView2 HttpOnly session cookie matched before navigation |
| Native window close / Destroyed cleanup | PASS, process exit 0; zero listeners on both 4321 and 4323 |
| Fresh Release project / immutable resource snapshot | PASS, native cookie verified, real window closed, exit 0, zero remaining listeners; 2026-10-20T20:45:37Z |
| Supervisor unexpected death | PASS, real workers exited and isolated test ports could be rebound |
| Production dependency staging | Runtime compiler/esbuild/Mermaid/linkedom retained; dependency closure verified outside the repository |

Raw local logs: `verification-tests.txt`, `regression.log`, `native-build.log`, `release-final-build.log`, `final-installer.log`, `verification/final-release-smoke.log`, and `verification/latest-native-result.json` (ignored). The native test temporarily stopped only the verified `scripts/workbench-dev.mjs` process, then restored the original Web service; both ports subsequently listened under PID 35480. No `tauri-runner.cjs` worker/supervisor remained. No business Apply was performed.

The native smoke test creates a real WebView2 window, authenticates using the existing API, reads back the native cookie, navigates to the required HTTP origin and closes the window. It does not claim screenshot-based visual inspection or full manual desktop interaction acceptance.

## Reproduce

```powershell
npm ci --prefix src-tauri
npm --prefix src-tauri run tauri:dev
npm --prefix src-tauri run tauri:build
```

The development application refuses occupied 4321/4323 ports. Close the Web development server before running it. To repeat the native automated close test after building:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-desktop.ps1
```

First build requires network access and MSVC/Rust. Installed startup uses bundled Node and project resources; optional remote Pi providers still need their own network/configuration. The Windows installer is unsigned; code signing and upgrade migrations are outside this change.

## Installer

The first Release smoke test caught a missing runtime linkedom dependency; the production manifest was corrected and isolation tests moved outside the repository to prevent ancestor node_modules fallback. Native readiness was hardened with an atomically written launch nonce/PID/port proof, still requiring both TCP listeners within 30 seconds. Astro update checks and telemetry are disabled. A PowerShell 5 ExitCode handle-lifetime issue in the test harness was corrected.

First initialization copies roughly twenty thousand files. One run exceeded the harness's original 120-second total timeout while packaging ran concurrently, so the harness now allows five minutes for resource initialization plus startup and window close. The actual server readiness bound remains 30 seconds. A subsequent fresh-project Release run completed the entire chain successfully. Failed test-owned copies were preserved under the app data `projects/` directory, without overwriting a user project.

Final installer:

`target/release/bundle/nsis/IVORG Atelier Lab_1.0.0_x64-setup.exe`

- Size: **342,579,912 bytes (326.71 MiB)**.
- SHA256: `02f303f2d5d08a75a6bd9148b138fea1f27666dded8bd661f52f4797a958a464`.
- Includes Node 22.21.0, its matching upstream license, the isolated project/runtime dependency closure, and WebView2 offline installer.
- NSIS uses zlib compression; the earlier superseded LZMA packaging job was stopped rather than distributed.
- Release executable SHA256: `2ddbdd2b5dee25c71122fd01637a3ed64a702063a1d89b2406f7776a244e1af1`.

The final native test used a cache-free resource snapshot with the same layout as the installer. It verified fresh project initialization, native CookieManager read-back, navigation to the required HTTP entry, real window close, and both ports becoming free. The installer itself has not been installed on a clean Windows machine; installation UX, unsigned-binary trust prompts, and visual/manual interaction remain manual checks. A standalone copy of the Rust executable without its sidecar and project resources is not a portable distribution.

## New files

```text
scripts/build-desktop.ps1
scripts/create-desktop-icon.cjs
scripts/prepare-desktop.cjs
scripts/tauri-desktop.test.cjs
scripts/tauri-runner.cjs
scripts/verify-desktop.ps1
src-tauri/.gitignore
src-tauri/Cargo.toml
src-tauri/Cargo.lock
src-tauri/build.rs
src-tauri/tauri.conf.json
src-tauri/src/main.rs
src-tauri/package.json
src-tauri/package-lock.json
src-tauri/assets/index.html
src-tauri/icons/icon.ico
src-tauri/icons/icon.png
src-tauri/binaries/node-runtime.sha256.json
src-tauri/binaries/node-v22.21.0-LICENSE.txt
src-tauri/README.md
src-tauri/VERIFICATION.md
```

Large runtime binaries, build tools, staged resources, installers and raw logs are ignored. There are no task changes to existing tracked application files.
