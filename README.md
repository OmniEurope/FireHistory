# FireHistory

Firefox extension that shows your whole browsing history in a full-tab page.

- List by date (Today, Yesterday, then day by day), or grouped by site, by visit count, or ungrouped.
- "Last visit" view (one row per page) or "Every visit" view (one row per visit).
- Date filter: "From" alone means that whole day; "From" + "to" means the range; times are optional. Shortcuts for Today, Yesterday, 7 days, 30 days.
- Visit timeline (per hour, day or month depending on the period); clicking a bar zooms into that period.
- Search in titles, addresses and the content of pages visited since installation (`site:example.com`, `"exact phrase"`). Pages without indexed content are matched on title and address.
- Clicking a page's visit count shows that page alone with all its visits (Esc to go back), with a "Delete this page" button.
- Clear button in the search field (or Esc).
- Multi-selection (Shift+click for a range, Ctrl+A for all) and deletion (Del).

The interface is in French.

## Install

FireHistory is being published on addons.mozilla.org; the link will be added here once it is live.

## Development

```bash
npm install
npm run build      # typecheck + build to dist/
npm test           # unit tests (vitest)
npm run e2e        # real headless Firefox check (after npm run build)
npm run package    # build + zip in web-ext-artifacts/
npm run preview    # dev preview at http://localhost:5178/dev/index.html (fake data)
```

To load the build in Firefox: `about:debugging#/runtime/this-firefox`, "Load Temporary Add-on", pick `dist/manifest.json`. Open it with the toolbar button or `Alt+Shift+H`.

## Shortcut

`Alt+Shift+H` by default, configurable in `about:addons`, gear menu, "Manage Extension Shortcuts". `Ctrl+H` cannot be used: Firefox keeps it and opens its own history sidebar (checked on Firefox 160).

## Firefox limits

- The first "Every visit" display needs one call per page (about 9 s for a 50,000-page history; recent visits show up within the first second). Visits are then kept in the extension's local database, so later openings take under a second.
- A single visit cannot be deleted: deleting removes the page with all its visits.
- An extension cannot replace `about:history`.
- Page content is captured only from installation onwards, never in private browsing, and stays on your computer.
- Firefox for Android does not provide the `history` API to extensions, so FireHistory is desktop only.

## Licence

EUPL-1.2, see [LICENSE](LICENSE).
