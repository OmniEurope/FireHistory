// Load-time measurement on a COPY of a real Firefox history (places.sqlite), in a throwaway headless
// profile. Prints only counts and timings, never history content.
// Usage: PLACES_DB=<path to a copy of places.sqlite> node tests/e2e/perf.mjs   (after npm run build)
import { resolve } from 'node:path';
import { launchFirefox } from './marionette.mjs';

const db = process.env.PLACES_DB;
if (!db) {
  console.error('Set PLACES_DB to a copy of places.sqlite');
  process.exit(2);
}
const UUID = '6f1c2a4e-7b3d-4e8a-9c51-0f2d3e4a5b6c';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ff = await launchFirefox({
  executable: process.env.FIREFOX_PATH ?? 'C:/Program Files/Mozilla Firefox/firefox.exe',
  port: 2839,
  prefs: { 'extensions.webextensions.uuids': JSON.stringify({ 'firehistory@local': UUID }) },
  files: { 'places.sqlite': db },
});

/** Polls the page until `cond` (a JS expression) is true; returns elapsed ms. */
async function waitFor(cond, timeoutMs = 300_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await ff.exec(`return !!(${cond});`).catch(() => false)) return Date.now() - t0;
    await sleep(100);
  }
  throw new Error(`timeout waiting for ${cond}`);
}
const count = () => ff.exec(`return document.getElementById('count').textContent;`);

try {
  await ff.send('Addon:Install', { path: resolve(import.meta.dirname, '../../dist'), temporary: true });
  await ff.send('Marionette:SetContext', { value: 'chrome' });
  await ff.exec(`
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    win.gBrowser.selectedTab = win.gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`,
  [`moz-extension://${UUID}/src/history/index.html`]);
  await ff.send('Marionette:SetContext', { value: 'content' });
  const handles = await ff.send('WebDriver:GetWindowHandles');
  await ff.send('WebDriver:SwitchToWindow', { handle: handles.at(-1) });

  const tLoad = await waitFor(`/\\d page/.test(document.getElementById('count')?.textContent ?? '')`);
  console.log(`last-visit view: ${await count()} in ${tLoad} ms (includes page start)`);
  const oldest = await ff.exec(`return [...document.querySelectorAll('.tl-axis span')].map((s) => s.textContent)[0];`);
  console.log(`timeline starts at: ${oldest}`);

  await ff.exec(`document.querySelector('[data-mode="visits"]').click();`);
  const tFirst = await waitFor(`/visite/.test(document.getElementById('count').textContent) && document.querySelector('.row.item')`);
  console.log(`every-visit view, first rows shown: ${await count()} after ${tFirst} ms`);
  const tVisits = await waitFor(`/visite/.test(document.getElementById('count').textContent) && document.getElementById('progress').hidden`);
  console.log(`every-visit view: ${await count()} in ${tVisits} ms`);
  const oldestVisit = await ff.exec(`return [...document.querySelectorAll('.tl-axis span')].map((s) => s.textContent)[0];`);
  console.log(`timeline starts at: ${oldestVisit}`);

  await ff.exec(`const i = document.getElementById('search'); i.value = 'github'; i.dispatchEvent(new Event('input'));`);
  const tSearch = await waitFor(`/github/.test('') || document.getElementById('count').textContent !== arguments[0]`.replace('arguments[0]', JSON.stringify(await count())));
  console.log(`search (every-visit view, cached): ${tSearch} ms incl. 150 ms debounce`);

  await ff.exec(`document.querySelector('[data-mode="urls"]').click();`);
  await sleep(500);

  // Second opening of the page: visits come from the extension database, not from getVisits.
  await sleep(3000); // let the last visit-cache writes land
  await ff.send('Marionette:SetContext', { value: 'chrome' });
  await ff.exec(`
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    win.gBrowser.selectedTab = win.gBrowser.addTab(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`,
  [`moz-extension://${UUID}/src/history/index.html`]);
  await ff.send('Marionette:SetContext', { value: 'content' });
  const handles2 = await ff.send('WebDriver:GetWindowHandles');
  await ff.send('WebDriver:SwitchToWindow', { handle: handles2.at(-1) });
  await waitFor(`/\\d page/.test(document.getElementById('count')?.textContent ?? '')`);
  await ff.exec(`document.querySelector('[data-mode="visits"]').click();`);
  const tCached = await waitFor(`/visite/.test(document.getElementById('count').textContent) && document.getElementById('progress').hidden`);
  console.log(`every-visit view, second opening: ${await count()} in ${tCached} ms`);
  await ff.exec(`document.querySelector('[data-mode="urls"]').click();`);
  await sleep(500);
} catch (e) {
  console.log('ERROR', e.message);
} finally {
  await ff.close();
}
