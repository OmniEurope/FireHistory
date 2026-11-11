// Real end-to-end check in the installed Firefox (headless, throwaway profile, Marionette).
// Run `npm run build` first, then `npm run e2e`. It installs dist/ as a temporary add-on,
// visits local test pages, then drives the history page and checks Firefox's own history.
// WebDriver BiDi cannot open moz-extension:// pages, hence the chrome-context tab opening below
// (needs MOZ_REMOTE_ALLOW_SYSTEM_ACCESS, set only for this test Firefox by marionette.mjs).
import http from 'node:http';
import { resolve } from 'node:path';
import { launchFirefox } from './marionette.mjs';

const FIREFOX = process.env.FIREFOX_PATH ?? 'C:/Program Files/Mozilla Firefox/firefox.exe';
const UUID = '6f1c2a4e-7b3d-4e8a-9c51-0f2d3e4a5b6c';
const PORT = 5199;
const DIST = resolve(import.meta.dirname, '../../dist');
const HISTORY_URL = `moz-extension://${UUID}/src/history/index.html`;

const pages = {
  '/alpha': { title: 'Page Alpha', desc: 'Description alpha pour le test', body: 'Texte avec le mot quasarlexique uniquement dans le contenu.' },
  '/beta': { title: 'Page Beta', desc: '', body: 'Autre page sans le mot recherche.' },
};
const server = http.createServer((req, res) => {
  const p = pages[req.url ?? ''];
  if (!p) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><title>${p.title}</title><meta name="description" content="${p.desc}"></head><body><main><p>${p.body}</p></main></body></html>`);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ff = await launchFirefox({
  executable: FIREFOX,
  port: 2839,
  prefs: {
    'extensions.webextensions.uuids': JSON.stringify({ 'firehistory@local': UUID }),
    'extensions.originControls.grantByDefault': true,
  },
});

/** Visible state of the history page (content context). */
const state = () => ff.exec(`return {
  count: document.getElementById('count').textContent,
  titles: [...document.querySelectorAll('.row.item .title')].map((a) => a.textContent),
  descs: [...document.querySelectorAll('.row.item .desc')].map((d) => d.textContent),
  index: document.getElementById('indexInfo').textContent,
};`);

/** Number of visits Firefox itself records for a URL (chrome context, Places database). */
async function firefoxVisits(url) {
  await ff.send('Marionette:SetContext', { value: 'chrome' });
  const n = await ff.exec(`
    const info = await PlacesUtils.history.fetch(arguments[0], { includeVisits: true });
    return info ? info.visits.length : 0;`, [url]);
  await ff.send('Marionette:SetContext', { value: 'content' });
  return n;
}

try {
  const installed = await ff.send('Addon:Install', { path: DIST, temporary: true });
  check('extension installs as a temporary add-on', installed?.value === 'firehistory@local', JSON.stringify(installed));

  for (const path of ['/alpha', '/beta', '/alpha']) {
    await ff.send('WebDriver:Navigate', { url: `http://localhost:${PORT}${path}` });
    await sleep(1200); // content script runs at document_idle, then the background writes IndexedDB
  }
  check('Firefox recorded the visits', (await firefoxVisits(`http://localhost:${PORT}/alpha`)) === 2);

  await ff.send('Marionette:SetContext', { value: 'chrome' });
  await ff.exec(`
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    win.gBrowser.selectedTab = win.gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`, [HISTORY_URL]);
  await ff.send('Marionette:SetContext', { value: 'content' });
  const handles = await ff.send('WebDriver:GetWindowHandles');
  await ff.send('WebDriver:SwitchToWindow', { handle: handles.at(-1) });
  await sleep(1500);

  let s = await state();
  check('history page lists the visited pages', s.titles.includes('Page Alpha') && s.titles.includes('Page Beta'), s.count);
  check('content index captured the pages', /^[1-9]\d* pages index/.test(s.index), s.index);
  check('meta description is shown', s.descs.includes('Description alpha pour le test'));

  const search = async (text) => {
    await ff.exec(`const i = document.getElementById('search'); i.value = arguments[0]; i.dispatchEvent(new Event('input'));`, [text]);
    await sleep(500);
    return state();
  };
  s = await search('quasarlexique');
  check('search finds a word present only in page content', s.titles.length === 1 && s.titles[0] === 'Page Alpha', JSON.stringify(s.titles));
  s = await search('page beta');
  check('search on title still works', s.titles.length === 1 && s.titles[0] === 'Page Beta', JSON.stringify(s.titles));
  s = await search('site:localhost');
  check('site: filter', s.titles.length === 2, JSON.stringify(s.titles));
  await search('page beta');
  const clearShown = await ff.exec(`return !document.getElementById('clearSearch').hidden;`);
  await ff.exec(`document.getElementById('clearSearch').click();`);
  await sleep(400);
  s = await state();
  const cleared = await ff.exec(`return { value: document.getElementById('search').value, hidden: document.getElementById('clearSearch').hidden };`);
  check('search clear button empties the search', clearShown && cleared.value === '' && cleared.hidden && s.titles.length === 2, `${JSON.stringify(cleared)} ${s.count}`);

  // Clicking a page's visit count shows only that page with all its visits.
  await ff.exec(`
    const row = [...document.querySelectorAll('.row.item')].find((r) => r.querySelector('.title').textContent === 'Page Alpha');
    row.querySelector('button.visits').click();`);
  await sleep(800);
  s = await state();
  const focus = await ff.exec(`return { shown: !document.getElementById('focusBar').hidden, title: document.getElementById('focusTitle').textContent };`);
  if (process.env.E2E_SCREENSHOT) {
    const png = await ff.send('WebDriver:TakeScreenshot', { full: false });
    (await import('node:fs')).writeFileSync(process.env.E2E_SCREENSHOT, Buffer.from(png.value, 'base64'));
  }
  check('visit count opens the single-page view with all its visits',
    focus.shown && focus.title === 'Page Alpha' && s.titles.length === 2 && s.titles.every((t) => t === 'Page Alpha'), `${JSON.stringify(focus)} ${s.count}`);
  await ff.exec(`document.getElementById('focusClose').click();`);
  await sleep(600);
  s = await state();
  check('closing the single-page view restores the list', s.titles.length === 2 && s.count === '2 pages', s.count);

  await ff.exec(`document.querySelector('[data-mode="visits"]').click();`);
  await sleep(800);
  s = await state();
  check('visits mode shows one row per visit', s.titles.filter((t) => t === 'Page Alpha').length === 2, s.count);

  await ff.exec(`const d = document.getElementById('fromDate'); d.value = '2001-01-01'; d.dispatchEvent(new Event('change'));`);
  await sleep(500);
  s = await state();
  check('a "from" date alone filters on that day only', s.titles.length === 0, s.count);
  await ff.exec(`document.getElementById('quick').querySelector('[data-quick="today"]').click();`);
  await sleep(500);
  s = await state();
  check('"Aujourd\'hui" shows today\'s visits', s.titles.length === 3, s.count);
  await ff.exec(`document.getElementById('reset').click(); document.querySelector('[data-mode="urls"]').click();`);
  await sleep(600);

  // Select Page Beta and delete it through the UI.
  await ff.exec(`
    const row = [...document.querySelectorAll('.row.item')].find((r) => r.querySelector('.title').textContent === 'Page Beta');
    row.querySelector('input.sel').click();
    document.getElementById('delete').click();`);
  await sleep(300);
  const dialog = await ff.exec(`return document.getElementById('confirm').open && document.getElementById('confirmTitle').textContent;`);
  check('delete asks for confirmation', typeof dialog === 'string' && dialog.includes('cette page'), String(dialog));
  await ff.exec(`document.getElementById('confirmOk').click();`);
  await sleep(1200);
  s = await state();
  check('deleted page is gone from the list', !s.titles.includes('Page Beta') && s.titles.includes('Page Alpha'), JSON.stringify(s.titles));
  check('deleted page is gone from Firefox history', (await firefoxVisits(`http://localhost:${PORT}/beta`)) === 0);
  check('other pages are kept in Firefox history', (await firefoxVisits(`http://localhost:${PORT}/alpha`)) === 2);
} catch (err) {
  check('e2e run completed', false, err.message);
} finally {
  await ff.close();
  server.close();
}

console.log(failures.length ? `RESULT: FAIL (${failures.length})` : 'RESULT: PASS');
process.exit(failures.length ? 1 : 0);
