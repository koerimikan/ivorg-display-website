# Stage 4 — Agent scope task proposals

Choose **04 // AGENT SCOPE** in the dev HUD. Drag a rectangle outside the HUD;
the page is read-only while selecting. Up selects bounded parents; Down selects
a representative child. The side panel shows associated paths and a conservative
budget estimate. Enter an intent, then use EXPORT TASK, COPY JSON or COPY MARKDOWN.

EXPORT TASK writes only these fixed, ignored local artifacts:

- `.dev-studio/tasks/latest.json` — canonical task, published last
- `.dev-studio/tasks/dev-studio.task.json` — standard named JSON copy
- `.dev-studio/tasks/task.md` — human-readable equivalent

All output targets are preflighted before bytes are prepared. Directory/file
symlinks are rejected. Publishing three files is not an OS-wide atomic operation;
`latest.json` is the final commit point. No Agent is invoked and no source is edited.

## Context contract

- At most eight semantic roots, 80 DOM nodes, six levels. Large ancestors are
  rejected; blank selection is reported rather than falling back to the body.
- Repeated list rows retain one representative subtree and up to 24 short data
  summaries. Hidden content, input values, HUDs, scripts and style elements are
  excluded. Repeated data intentionally represents the user's selected content.
- Styles use a whitelist; transform/clip-path/layout take priority. Only CSS
  variables referenced by inline or matching accessible stylesheet rules are
  included. Cross-origin stylesheet rules may be unavailable.
- Loop-generated rows fall back to their nearest mapped template ancestor.
  Server-side sourceId resolution and hashes gate source reads. Selected template
  ranges, relevant frontmatter bindings and direct local data imports supply code
  context; associated CSS is editable and data is read-only.
- A development-only motion registry adds actual entrance/decode/parallax/wipe
  interface constraints. Unregistered effects are not claimed to be understood.
- No sourceId means a DOM-only task with an empty editable scope.
- Source changes expire a context with HTTP 409; context IDs also expire after
  ten minutes and the server retains at most 16 contexts.

## Budget

Both exported formats are individually capped at 6,000 conservative estimated
tokens. The estimator uses UTF-8 bytes as a conservative upper-bound proxy, not
a particular model's tokenizer. Send either JSON or Markdown to the Agent;
they contain equivalent context and are not intended to be pasted together.
The final serialized output (including intent, scope and constraints) is checked.
Clipped source/DOM/styles/data are explicitly flagged and counted. A request
whose essential metadata cannot fit is rejected rather than silently oversized.

```powershell
npm run build
node --test scripts/agent-scope.test.mjs scripts/source-bridge.test.mjs scripts/dev-studio.test.mjs
```

Tests use Node, synthetic DOM objects, temporary files and loopback HTTP only.
They do not launch or control a browser. Pointer/keyboard/clipboard appearance
and interaction remain manual acceptance checks.
