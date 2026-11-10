# Atelier Collaboration Design: Merge-Safe Registry and Shared Memory

Status: P1 implemented 2026-11-08 (registry v2, Journal tx 0568ff89, PR verify workflow). P2–P4 not started.

## 1. Goal

Two club members clone or pull the same `main`. Each opens Atelier, or connects Codex or Claude Code to it. Their agent already knows:

- what the project is,
- which decisions were made and why,
- which of those decisions still hold.

The agent learns this without re-reading the whole repo.

The acceptance scenario that every phase is measured against:

> A and B branch from the same `main`. A changes the newsletter Spec object and records a decision in chat. B changes a discography object and records a different decision. Both merge with **zero git conflicts**. After `git pull`, B's agent can find A's decision. The agent sees that A's decision is `current`, and it sees that any memory bound to the object A changed is `stale`. None of this needs a full repo read.

Non-goals for v1:

- real-time co-editing,
- a server or hosted sync (git is the transport),
- Mac builds,
- code signing (§8 covers these separately).

## 2. What blocks this today (verified in code)

| # | Fact | Where | Consequence |
|---|---|---|---|
| F1 | The committed registry holds `graph` + `anchors`. `graph` must byte-equal `specToGraph(spec, hash(spec))`. Otherwise load fails with `REGISTRY_DRIFT`. | `workbench-server/server.js:38`, `canonical-registry.js:8` | 2,919 of the registry's 3,079 lines (95%) are a derived copy of the Spec. |
| F2 | Every object's `provenance.specHash` is the hash of the **whole** Spec. | `workbench-core/objects/spec.js:71` | Any one-character Spec edit rewrites ~100 lines spread through the registry. Two branches that each touch the Spec always conflict. |
| F3 | Anchors store `range: [start, end]` byte offsets. Resolution uses `fingerprint`, not `range`. | `workbench-core/objects/anchors.js:19` | Unrelated edits above an anchored element change committed offsets. This churns the file and can cause conflicts. |
| F4 | All memory lives in gitignored `.companion/`: slots JSON, event log JSONL, SQLite FTS index. | `memory.js`, `event-log.js`, `.gitignore` | Memory never leaves one machine. |
| F5 | A memory entry is bound to the whole-Spec digest. Search excludes entries whose digest differs, unless `includeStale` is set. | `memory.js` `search` / `remember` | After any Spec edit, **every** memory goes stale. That is far too coarse to share. |
| F6 | `sourceRef="file:line"` (60 in the Spec) is never checked against file content. | `spec.js`, `graph.js` | References rot silently after edits. They don't cause conflicts, but they mislead agents. |
| F7 | External agents can only reach Atelier through the cookie-authenticated HTTP API on 127.0.0.1:4323. There is no MCP server. | `security-api.js`, `change-api.js` | Codex or Claude Code cannot plug in without custom glue. |

## 3. Design A: derive the registry, commit only identity

**Change.** The committed registry file keeps only the data that cannot be derived:

```json
{ "schemaVersion": 2,
  "anchors": [ { "objectId": "page.home",
                 "anchor": { "file": "src/pages/index.astro", "kind": "structural",
                             "path": "/SiteLayout:0", "tag": "SiteLayout", "text": "",
                             "fingerprint": "8e0c…" } } ] }
```

- `graph` is removed from disk. `loadProject` / `readCanonicalRegistry` compute it from the Spec at load time; they already compute it to compare against, so the cost doesn't change.
- `range` is removed from committed anchors. `resolveAnchor` already returns the live range, and callers use the resolved value.
- `provenance.specHash` stays **in memory only**. Nothing on disk carries the whole-Spec hash per object.
- The `REGISTRY_DRIFT` check becomes: every anchor's `objectId` exists in the derived graph, and every fingerprint resolves. Both checks are already there; the byte-compare is the only part removed.

**Migration** is one reviewed Journal transaction. It rewrites the registry to v2. The `canonical` safeTarget path already permits the registry file, so CAS and the Journal stay the only write path. The v1 reader is kept for one release so that old branches still load and report "needs migration" instead of crashing.

**Why not just drop specHash and keep the graph committed?** The graph would still duplicate the Spec. Every Spec edit would then need a second, mechanical edit in another file, and parallel branches would conflict on that copy. A derived value has no business in version control.

**Tests to update:**
- spec-l1 and spec-l3 (object count via derived graph, unchanged at 99);
- preview-safety;
- any test that reads `registry.graph` directly;
- add a test where an edit to the Spec alone changes **zero** registry bytes.

## 4. Design B: shared project memory, committed one file per entry

### 4.1 Storage

Project memory lives in `.atelier/memory/`, which is committed. User-scope memory and slots stay local in `.companion/`. One entry per file:

```
.atelier/memory/2026-11-08-newsletter-real-content-k3f9q2.md
---
id: 2026-11-08-newsletter-real-content-k3f9q2
author: Alvin <alvinshi0327@hotmail.com>   # from git config at write time
created: 2026-11-08T22:40:00Z
kind: decision            # decision | convention | fact | todo
binds:
  - object: iss.01                 # Spec object
    hash: 4b1c…                    # hash of that object's canonical projection
  - file: apps/ivorg-website/src/lib/data.js
    hash: 9e02…                    # content hash at write time
supersedes: []                     # ids this entry replaces
---
Issue 01 is real club writing. Conflicting facts in the source (SeeU preorders,
MEW price) are shown as "To be announced"/"To be confirmed", never guessed.
```

Why one file per entry with a random suffix:
- Two branches that each add memories touch different paths, so git merges them with no conflict, ever.
- Entries are never edited in place. A correction is a new entry with `supersedes: [old-id]`, so the history stays reviewable in `git log`.

The SQLite FTS index stays as it is: a **local cache** rebuilt from `.atelier/memory/*.md` whenever the directory's content hash changes. It already rebuilds from the event log on drift (`ensure`), so the data source changes but the mechanism is reused.

### 4.2 Staleness: per binding, not per Spec

This replaces F5. At read time, each binding is recomputed:

| Binding | Hash input | Result |
|---|---|---|
| `object: X` | canonical JSON of X from the derived graph, without `provenance` | match → `current`; mismatch → `stale`; X missing → `orphaned` |
| `file: P` | file bytes | same rule |
| none | — | `unbound`: always shown, labelled as unverified |

Search returns `current` entries first, then `stale` and `orphaned` entries with their status and the binding that changed. Stale entries are never silently dropped, because "this decision may be outdated" is itself useful context.

When two entries supersede the same id (A and B corrected it in parallel), both show, flagged `conflicting-successors`. A human resolves it by writing a third entry that supersedes both.

### 4.3 Write path (from chat, as decided)

1. In agent chat, the agent or the user calls `memory.remember` with `scope: "project"`.
2. The server validates the entry:
   - schema check,
   - 8 KiB limit (as now),
   - **secret scan**: reject API-key, token and password patterns, using the existing `redact()` rules plus a key-shape regex. The entry will be pushed to git, so rejecting beats redacting.
3. The server computes `binds` hashes from the current tree and creates the file exclusively (`open(..., 'wx')`). A name collision fails instead of overwriting.
4. Atelier **auto-commits** the entry (owner decision, 2026-11-08). The commit contains only that file (`git commit --only -- <path>`), so the member's staged or unstaged work is never swept in. The message is `memory: <id>`, and the author is the member's git identity. Atelier never pushes; the entry travels with the member's next push. If the working tree is mid-merge or mid-rebase, or git is missing, the file is left uncommitted and the reply says so.

Memory files are project knowledge, not host source, so they don't go through the Journal. The invariant holds because host source is still written only through CAS + Journal. `safeTarget` is unchanged: it doesn't allow `.atelier/` for change plans, and memory has its own writer.

### 4.4 Context without a full re-read

`context.get` returns a budgeted bundle. It reuses `agent-context.js`, which already enforces `maxBytes`. The bundle contains:

- project summary: pages, components and invariants, from the derived graph;
- the top-N `current` memories by kind (`decision` and `convention` always included);
- `stale` memories that touch the requested target;
- for an object target, the existing target, sibling and source-snippet bundle.

This is the "no re-read" mechanism. The Spec, memory and anchors index the repo, so an agent reads the parts it needs instead of scanning everything.

## 5. Design C: Codex and Claude Code integration (MCP)

Add `atelier mcp`, a stdio MCP server in `packages/atelier`. It is a thin client over the existing control API, with no new logic:

| MCP tool | Maps to | Notes |
|---|---|---|
| `atelier_context` | `context.get` | Start of every session |
| `atelier_memory_search` | `/api/memory/search` | Returns status per entry |
| `atelier_memory_remember` | `/api/memory/remember` (project scope) | Writes a file; doesn't commit |
| `atelier_spec_read` | `/api/change/spec-read` | |
| `atelier_change_plan` / `_preview` | `/api/change/plan`, `/preview` | Dry run plus `validateSnapshot` |
| `atelier_change_apply` | `/api/change/apply` | Succeeds only with an approval token |

**Approval stays human.** `journal.approve` signs with HMAC through the authenticated session. The MCP server never holds that key. An external agent can plan and preview, then it must ask the human to approve in the Atelier UI, where the plan ID shows up. Without this, an external agent could write host source with no review, which would bypass the Journal's purpose.

**Auth.** At login, the running app writes a short-lived local token file (0600) to `.companion/mcp.token`. That token is scoped to read, plan, preview, remember and apply-with-approval. `atelier mcp` reads it. If the app isn't running, the tools return a clear "start Atelier" error.

**Discovery.** `atelier init-agents` writes a short block into `AGENTS.md` (Codex) and `CLAUDE.md` (Claude Code). The block says: call `atelier_context` first, record decisions with `atelier_memory_remember`, never edit `src/**` directly, use plan → preview → approval. It also registers the MCP server in each tool's config. Both files are committed, so every member's agent gets the same instructions after they pull.

**Trust.** A teammate's memory is data, not instructions. The MCP tool descriptions say so, and `context.get` labels each memory with its author, so an agent can weigh the entry and never treats it as a command.

## 6. sourceRef drift (F6)

v1 adds `atelier check`, which also runs inside `verify:release` and in CI. For each `file:line[-line]` sourceRef, it confirms the file exists and the range is in bounds. Failures are reported as warnings with the object ID; they don't block merges.

Later, refs can migrate to `file#symbol`, which tolerates edits. That migration waits until warnings show the line refs actually rot. YAGNI.

## 7. Falsification: merge scenarios

| Scenario | Today | After A+B |
|---|---|---|
| A and B edit different Spec objects | Registry conflicts (~100 specHash lines) | Spec merges line-wise; registry untouched |
| Both add memories | Not shared | Different files: clean merge |
| A edits object X; B wrote memory bound to X | — | After merge, B's entry is `stale` with X named |
| A deletes X | — | Entries bound to X are `orphaned` |
| Both supersede entry M | — | `conflicting-successors`, flagged for a human |
| Both add an `ssrInitial` Issue (clean git merge, semantically invalid) | Caught only on deploy | **Must be caught before merge.** Run `verify:release` on `pull_request` as well as `push` |
| Edit above an anchored element | `range` churn in registry | No committed change; fingerprint still resolves |
| A inserts a sibling *before* an element that a structural anchor points at (the path is index-based, e.g. `/SiteLayout:0`) | Anchor goes `unbound` and loading fails | **Unchanged by this design.** `atelier check` reports it; the fix is re-anchoring through a Journal tx, or preferring `attr` anchors (`domId`) where an id exists |
| Member pastes an API key in chat and it reaches `remember` | Stays local | Rejected by the secret scan before any file is written |
| Old branch with registry v1 | — | Loads, reports "needs migration", no crash |

The semantic-merge row is the one real hole: git can't see L3 invariants. The fix is cheap. Add `pull_request:` to the workflow trigger (deploy steps gated on `main`), or better, a separate `verify.yml` that has no deploy permissions.

## 8. Onboarding gaps (not design, still blocking hand-off)

1. **Per-member LLM key.** Each member supplies their own DeepSeek key. The first-run screen already exists; the docs need one paragraph.
2. **Unsigned installer.** Members see a SmartScreen warning. Either accept it and document it, or buy an OV certificate.
3. **Windows only.** There is no Mac build. That is fine if all members use Windows; ask before doing any Mac work.
4. **Repo access.** Members need GitHub write access, or a fork plus PR workflow, and `main` branch protection that requires the verify check (§7).

## 9. Phases and acceptance

| Phase | Scope | Done when |
|---|---|---|
| P1 ✅ | Design A (derived registry v2 + migration tx) and `verify` on PRs. Registry 3,080 → 142 lines; tested by `scripts/collab-merge.test.mjs` | Spec-only edit changes 0 registry bytes; full gate passes; two-branch Spec merge test is conflict-free |
| P2 | Design B (committed memory, per-binding staleness, secret scan) | The §1 scenario passes as an automated two-worktree test |
| P3 | Design C (`atelier mcp` + `init-agents`) | Claude Code and Codex each run context → remember → plan → preview against a live app; apply without approval is refused |
| P4 | `atelier check` + onboarding docs | A second member installs and completes the §1 scenario on their own machine |

P1 is the gate. P2 depends on the derived graph for object hashes. P3 depends only on the existing API plus P2's memory tools.

## 10. Decisions needed from the owner

1. ~~Memory review~~: decided 2026-11-08. `remember` auto-commits (§4.3).
2. ~~Mac support~~: decided 2026-11-08. Out of scope for now; Windows only.
