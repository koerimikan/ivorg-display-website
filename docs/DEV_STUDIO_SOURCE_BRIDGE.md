# Dev-Studio — Stage 3 source bridge

Run `npm run dev` on loopback. Open the displayed local URL, toggle the HUD
with `~` or `Alt+D`, choose **03 // SELECT & EDIT**, then Alt-click an element.
The homepage sentence **Synthesize it, then sing it together.** is a supported
static-text target. Preview is temporary; APPLY writes source. UNDO restores
the exact bytes if the file still has the committed revision.

## Supported boundary

- `.astro` static native elements under `src/`; opaque IDs exist only in dev
  compilation output. No IDs are written to source files.
- Plain static text, including Unicode and entities. Mixed markup, data-bound
  text, loop/expression-generated elements, clock/decoder text, scripts and
  styles are not text-editable.
- One inline CSS declaration, or insertion of one `style` attribute. Supported
  properties include physical margin/padding, gap, font-size, line-height,
  letter-spacing, width/height/min-width/max-width, border-radius, opacity and
  hex colors. P0 accepts simple numeric CSS units; it does not rewrite external
  CSS rules, Tailwind classes, `clamp()` or arbitrary expressions.
- A component definition edit affects its rendered instances; this is not a
  per-instance override or a Props/data editor.

## Safety and lifecycle

`astro:config:setup` installs the Vite plugin only for `command === 'dev'`.
The plugin uses both `enforce: 'pre'` and transform hook `order: 'pre'` because
Astro 7's compiler is itself a pre-plugin. The parser is the project's actual
`@astrojs/compiler-rs`, not the older compiler AST format.

All RPC endpoints are POST JSON under `/__dev_studio_api/`: `session`,
`resolve`, `commit`, `undo`. The server requires same-origin HTTP on loopback,
checks the peer address, caps request bodies and requires a session token for
non-bootstrap endpoints. Paths come from the server's source map, never from
client-supplied file paths. Real paths must remain under the project's `src/`.

Commits serialize within the server. They check the complete SHA-256 revision,
the mapped revision and the exact old source slice. `magic-string` edits only
the selected range. Candidate source is parsed before atomic file replacement;
the revision is checked again immediately before replacement. This does not
provide an OS-wide compare-and-swap lock against other applications.

Vite's native watcher handles source invalidation/HMR. Session storage and the
server's last transaction/outcome recover the commit/Undo status after reload.
Undo history is in memory, limited to 100 transactions, and expires when the
dev server restarts. A changed file causes HTTP 409 rather than a forced Undo.

Editor selection/preview/overlay is disposed on navigation or HMR. Source edit
mode freezes the homepage physics and stops live entrance/wipe animations.
There is no arbitrary filesystem endpoint, command execution or Agent task
export in this stage. Same-origin application scripts share the developer's
trust boundary; the token protects against cross-origin requests, not XSS.

## Verification without browser automation

```powershell
npm run build
node --test scripts/source-bridge.test.mjs
node --test scripts/dev-studio.test.mjs
node motion-baker.test.cjs
```

For a running dev server, the following HTTP smoke test temporarily changes
the real homepage heading, checks recompiled output and 409, then performs Undo
and verifies exact restoration. Pass the port printed by Astro:

```powershell
node scripts/source-bridge-smoke.mjs http://127.0.0.1:4322
```

Browser interactions remain a manual acceptance step; these scripts do not
launch or operate a browser.
