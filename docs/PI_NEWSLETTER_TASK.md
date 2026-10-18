# Delegated task: independent Astro newsletter page

You are the user's requested DeepSeek Flash Pi coding agent collaborating with Codex in this repository.

Implement ONLY:
- src/pages/newsletter.astro
- src/scripts/newsletter.js
- src/styles/newsletter.css (only if required for your page)

Do not modify other files, dependencies, Git configuration, commit or push. Do not read credentials or unrelated projects.

Context: user explicitly migrated the former single-file prototype to Astro 7.3.8 + GSAP 3.15.0, with separate HOME, DISCOGRAPHY, NEWSLETTER routes. The album player is page-local, not global. Codex is implementing the shared layout, navigation lifecycle and audio.

Read src/layouts/SiteLayout.astro, src/components/Ruler.astro, src/lib/data.js, src/lib/ui.js and src/styles/newsletter.css first.

Your newsletter page:
- Use SiteLayout with title="Newsletter" page="newsletter"; import Ruler, ISSUES, and newsletter.css.
- Render left index and right editorial reader as SSR HTML with usable content before JS.
- Use ISSUES from data.js (3 realistic illustrative issues, sections with text and technical parameter tables).
- Visual classes already exist: view-bar, newsletter-layout, issue-index, index-title, issue-button, issue-top, issue-tags, index-foot, editorial, paper, reader-toolbar, theme-toggle, reader-body, reader-kicker, reader-deck, article-section, technical-table, reader-end.
- Index buttons data-issue=index and aria-pressed; IDs issue-list, editorial, reader-body, reader-position, theme-toggle.
- Include strong pull quote, numbered sections, actual <table> with column headers. Clear demo label.
- Switching issue updates the complete reader and aria state; preserve theme and update ?issue=04 query via replaceState if useful. Parse initial issue query for static-built site.
- Paper #F2F2EE mode and dark #090A0C mode via editorial.paper and aria-pressed.
- Newsletter JS export function mountNewsletter(root) returning cleanup. Do not register global astro events: Codex's app.js calls mount on astro:page-load and cleanup before astro:before-swap. Use AbortController for events. No permanent timers/rAF.
- Dispatch window Event('ivorg:layout') after content changes so global grid can refresh.
- GSAP is managed by Codex; no need to import it in your page interaction module.

Use actual files, finish the implementation, and return a concise summary of files changed and limitations. No placeholder TODOs. No build command necessary: Codex will build and browser-test the entire site.
