# Companion Workbench pipeline

Authority: `companion-research/companion-workbench-plan.md` in the parent workspace. Canonical architecture is copied without modification to `workbench/specs/ivorg.spec.xml`; objects and anchors are versioned separately. `.companion/` contains derived local state, logs, previews and journals and is ignored by Git.

Run `npm run dev:workbench` for loopback control 4323 and preview 4321. The preview exposes measurement only; old Dev-Studio write RPCs return 403. The control process refuses occupied ports. Production build uses neither development integration nor editor assets.

## P1 verified

26 tests / 255 assertion calls; baseline 53 tests and 27 groups / 693 assertions passed. Actual dual-origin HTTP smoke passed. Three pages, four directed reading-order adjacencies, fifteen enabled intermediate binding nodes. Twelve bindings reuse `td.wipeCover`; three page-local HOME→DISCO entrances. Navigation cycles are legal; inheritance/containment use three-color DFS. Fixture frames are normalized vectors, not production GSAP pixel equivalence, and never navigate. Human browser acceptance has not been performed (Computer Use is prohibited).

## P2 automated gate

`npm run gate -- P2` runs production build, residue scanner, both old baselines, bridge static checks and all P1/P2 suites. P2 includes real subprocess crash/recovery and disposable-checkout HTTP plan→build-preview→approve→apply→registry remap→Undo tests. No test edits the real website source. Journal is a recoverable multi-file protocol, not filesystem ACID; cooperating writers serialize using an exclusive lock and each rename rechecks live hashes. Foreign bytes force `RECOVERY_REQUIRED` without overwriting them. Undo creates an inverse transaction and refuses later edits.

Select in preview with Alt+S and drag; coordinates exist even for empty regions. Measurement is refreshed every 500ms while the selection is live, and writes require recent geometry within 1 CSS px. Transformed/animated/dense/unsupported containers are conservatively refused. Automatic insertion currently appends an explicit static root to the chosen container; grid and neighbor inference are observations, not automatic layout rewrites. The plan API also accepts before/after typed operations. Expression interiors, component interiors and range-only anchors cannot be written.

Approvals bind byte digest, file baselines, actor, expiry and policy. Snapshot builds use copied source and a shared dependency directory, not a security sandbox for arbitrary code. Only trusted project build code runs there. Untrusted CodeAct requires the separate P4 isolation policy.

## Checkpoints and recovery

`.companion/pipeline-state.json` is the local checkpoint; `.companion/gates/Px.json` and matching text files retain exact command output and exit codes. `scripts/pipeline-checkpoint.mjs` writes state then commits only explicit task paths. Existing user edits to `src/styles/shell.css` are deliberately excluded. A platform interruption of this Codex session cannot be caught by a local JavaScript process; resume by reading state, Git status and the last gate. Never infer PASS from an interrupted command.

## P3 verified

25 automatic tests cover full L1/L2/L3 XML validation, Spec literal/prose separation, eight merge conflict classes, actual SSR/CSR parity for all three issues, RPC replay failures/backpressure and real three-file Spec transactions. The full P3 gate passed. Installed Pi 1.3.0 and its local rpc.md/rpc-commands.md are the RPC authority. A live deepseek-flash analyze probe and live modify/explain smoke passed; the model proposal went through a real snapshot build, signed approval, disposable-checkout commit and byte-exact Undo. No live model wrote website files. One malformed initial model operation was refused before compilation; the explicit operation schema was then tightened. Evidence: .companion/pi-live-smoke.json (local, ignored).

