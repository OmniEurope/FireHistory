# AGENTS.md - FireHistory

> Canonical project instruction source for every agent. `CLAUDE.md` only imports this file.

Global rules (French output, zero fake, no Python tooling, git and test rules) come from the user-level
configuration and apply unchanged. Only project-specific rules live here. Project override: none.

## Project

Firefox extension (Manifest V3, TypeScript strict, Vite, vanilla DOM, no runtime dependency) that shows the
whole browsing history in a full-tab page: grouping (date, site, visit count), timeline, date and time range,
full-text search (title, URL, captured page content), multi-selection and deletion. Product decisions are in
`.claude/decisions.md`.

## Layout

- `public/manifest.json`: extension manifest (gecko id `firehistory@local`, fixed so IndexedDB survives reloads).
- `src/background/index.ts`: action button, content capture to IndexedDB, index cleanup on history deletion.
- `src/content/index.ts`: captures title, meta description and main text. Must stay import-free (content
  scripts cannot be ES modules).
- `src/history/`: the history page (`index.html` static markup, `main.ts` state and virtualized list built with DOM APIs, never `innerHTML`, `styles.css`).
- `src/shared/`: pure logic (`dates.ts`, `query.ts`, `text.ts`), IndexedDB store (`db.ts`), settings.
- `dev/`: dev-only preview with a FAKE `browser` API (`mock-browser.ts`). Never shipped, never a proof of
  Firefox behavior.
- `tests/*.test.ts`: vitest unit tests of the pure logic. `tests/e2e/firefox.mjs`: real Firefox check.

## Commands

```bash
npm run build      # typecheck + build to dist/
npm test           # unit tests (vitest)
npm run e2e        # real headless Firefox check (run npm run build first)
npm run package    # build + zip in web-ext-artifacts/
npm run sign       # build + AMO unlisted signing (WEB_EXT_API_KEY / WEB_EXT_API_SECRET, set by the user)
npm run lint:ext   # web-ext lint of dist/
PLACES_DB=<copy of places.sqlite> node tests/e2e/perf.mjs   # load timings on a real history copy
npm run preview    # dev preview at http://localhost:5178/dev/index.html (fake data)
```

Load in Firefox: `about:debugging#/runtime/this-firefox`, "Charger un module complementaire temporaire",
pick `dist/manifest.json`.

## Rules

- Firefox constraints to respect: no way to delete a single visit (delete a URL or a time range), no way to
  replace `about:history`, `Ctrl+Shift+H` and `Ctrl+H` are taken by Firefox (an extension `Ctrl+H` registers but never fires, checked
  on Firefox 160).
- Performance: the list is virtualized (fixed 44 px rows); never render all rows. Visits are fetched lazily
  per URL and only for URLs that can match the current filters.
- Privacy: private-browsing tabs are never indexed; the index stays local (IndexedDB of the extension).
