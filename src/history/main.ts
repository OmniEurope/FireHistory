import './styles.css';
import {
  clearPages, deletePages, getAllPages, getAllVisits, putVisits, type PageRecord, type VisitRecord,
} from '../shared/db';
import {
  formatDateTime, formatTime, rangeFromInputs, startOfDay, toDateInput, toTimeInput, type DateFilterInput, type TimeRange,
} from '../shared/dates';
import {
  buildRows, buildTimeline, entriesFromVisits, entryFromItem, filterEntries, sortEntries,
  type Entry, type GroupBy, type Row, type SortBy, type Timeline, type ViewMode,
} from '../shared/query';
import { ALL_URLS, loadSettings, saveSettings, type Settings } from '../shared/settings';

const ROW_H = 44;
const OVERSCAN = 10;
const VISIT_CONCURRENCY = 64;
const DELETE_CONCURRENCY = 16;

// ---------------------------------------------------------------- DOM

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const searchInput = $<HTMLInputElement>('search');
const dateInputs = {
  fromDate: $<HTMLInputElement>('fromDate'),
  fromTime: $<HTMLInputElement>('fromTime'),
  toDate: $<HTMLInputElement>('toDate'),
  toTime: $<HTMLInputElement>('toTime'),
};
const groupSelect = $<HTMLSelectElement>('group');
const sortSelect = $<HTMLSelectElement>('sort');
const viewport = $<HTMLElement>('viewport');
const spacer = $<HTMLDivElement>('spacer');
const emptyBox = $<HTMLDivElement>('empty');
const timelineBox = $<HTMLElement>('timeline');
const countLabel = $<HTMLSpanElement>('count');
const progress = $<HTMLSpanElement>('progress');
const selectAll = $<HTMLInputElement>('selectAll');
const selInfo = $<HTMLSpanElement>('selInfo');
const deleteBtn = $<HTMLButtonElement>('delete');
const clearSelBtn = $<HTMLButtonElement>('clearSel');
const confirmDialog = $<HTMLDialogElement>('confirm');

// ---------------------------------------------------------------- state

interface UiPrefs { mode: ViewMode; group: GroupBy; sort: SortBy; timeline: boolean }
const prefs: UiPrefs = { mode: 'urls', group: 'date', sort: 'recent', timeline: true };

/** One entry per URL, from `history.search`. */
let items: Entry[] = [];
/** Per-visit entries, fetched lazily with `history.getVisits` and cached per URL. */
const visitCache = new Map<string, Entry[]>();
/** Indexed page content (search text and description), by URL. */
let pages = new Map<string, PageRecord>();
let settings: Settings;

let filtered: Entry[] = [];
let rows: Row[] = [];
const collapsed = new Set<string>();
/** Selection is by URL: Firefox can only delete a URL with all its visits. */
const selected = new Set<string>();
let anchor: number | null = null;
let generation = 0;

// ---------------------------------------------------------------- data

async function loadItems(): Promise<void> {
  const res = await browser.history.search({ text: '', startTime: 0, maxResults: 10_000_000 });
  const next: Entry[] = [];
  for (const it of res) {
    const e = entryFromItem(it);
    if (e) next.push(e);
  }
  items = next;
}

async function loadPages(): Promise<void> {
  try {
    const all = await getAllPages();
    pages = new Map(all.map((p) => [p.url, p]));
  } catch (err) {
    console.error('FireHistory: content index unavailable', err);
    pages = new Map();
  }
}

const contentOf = (url: string) => pages.get(url)?.search;

async function pool<T>(list: readonly T[], size: number, work: (item: T) => Promise<void>, onTick?: (done: number) => void): Promise<void> {
  let i = 0;
  let finished = 0;
  const run = async () => {
    while (i < list.length) {
      const item = list[i++]!;
      await work(item);
      onTick?.(++finished);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, run));
}

function cachedVisits(candidates: readonly Entry[]): Entry[] {
  const out: Entry[] = [];
  for (const e of candidates) {
    const v = visitCache.get(e.url);
    if (v) for (const x of v) out.push(x);
  }
  return out;
}

/**
 * Visits saved by a previous opening of the page, loaded once on the first need. A record is used
 * only if its URL's last visit time and visit count are unchanged; stale records are refetched.
 */
let persisted: Promise<Map<string, VisitRecord>> | null = null;
function persistedVisits(): Promise<Map<string, VisitRecord>> {
  persisted ??= getAllVisits()
    .then((all) => new Map(all.map((r) => [r.url, r])))
    .catch((err) => {
      console.error('FireHistory: visit cache unavailable', err);
      return new Map<string, VisitRecord>();
    });
  return persisted;
}

function fromRecord(e: Entry, r: VisitRecord): Entry[] {
  return entriesFromVisits(e, r.ids.map((visitId, i) => ({ visitId, visitTime: r.times[i] })));
}

const PERSIST_BATCH = 2000;

/**
 * Visits of the candidate URLs, fetched only for URLs not cached yet. Returns null if superseded.
 * Firefox only offers one `getVisits` call per URL, so a cold load of a large history takes seconds:
 * URLs are fetched most recently visited first (a visit is never later than its URL's last visit,
 * so the newest part of the list is complete first) and `onPartial` shows the list as it fills.
 */
async function visitsFor(candidates: Entry[], gen: number, onPartial?: (visits: Entry[]) => void): Promise<Entry[] | null> {
  let missing = candidates.filter((e) => !visitCache.has(e.url));
  if (missing.length) {
    const saved = await persistedVisits();
    if (gen !== generation) return null;
    missing = missing.filter((e) => {
      const r = saved.get(e.url);
      if (!r || r.lastVisitTime !== e.lastVisitTime || r.visitCount !== e.visitCount) return true;
      visitCache.set(e.url, fromRecord(e, r));
      return false;
    });
  }
  missing.sort((a, b) => b.lastVisitTime - a.lastVisitTime);
  if (missing.length) {
    progress.hidden = false;
    let last = 0;
    let lastPartial = performance.now();
    let toSave: VisitRecord[] = [];
    const flush = () => {
      const batch = toSave;
      toSave = [];
      void putVisits(batch).catch((err) => console.error('FireHistory: visit cache write failed', err));
    };
    await pool(missing, VISIT_CONCURRENCY, async (e) => {
      if (gen !== generation) return;
      try {
        const visits = await browser.history.getVisits({ url: e.url });
        const timed = visits.filter((v) => v.visitTime !== undefined);
        visitCache.set(e.url, entriesFromVisits(e, visits));
        const record: VisitRecord = {
          url: e.url, lastVisitTime: e.lastVisitTime, visitCount: e.visitCount,
          ids: timed.map((v) => v.visitId), times: timed.map((v) => v.visitTime!),
        };
        toSave.push(record);
        if (toSave.length >= PERSIST_BATCH) flush();
      } catch {
        visitCache.set(e.url, []);
      }
    }, (done) => {
      const now = performance.now();
      if (now - last > 100 || done === missing.length) {
        last = now;
        progress.textContent = `Chargement des visites : ${fmt(done)} / ${fmt(missing.length)} pages`;
      }
      if (onPartial && now - lastPartial > 1000 && done < missing.length && gen === generation) {
        lastPartial = now;
        onPartial(cachedVisits(candidates));
      }
    });
    flush();
    progress.hidden = true;
    if (gen !== generation) return null;
  }
  return cachedVisits(candidates);
}

// ---------------------------------------------------------------- filters

function dateFilter(): DateFilterInput {
  return {
    fromDate: dateInputs.fromDate.value,
    fromTime: dateInputs.fromTime.value,
    toDate: dateInputs.toDate.value,
    toTime: dateInputs.toTime.value,
  };
}

/** Single-page view (all visits of one URL), opened from a row's visit count; filters are ignored. */
let focusUrl: string | null = null;
const viewMode = (): ViewMode => (focusUrl ? 'visits' : prefs.mode);

function openFocus(entry: Entry): void {
  focusUrl = entry.url;
  const page = pages.get(entry.url);
  $('focusTitle').textContent = entry.title || page?.title || entry.url;
  $('focusTitle').title = entry.url;
  $('focusBar').hidden = false;
  document.body.classList.add('focused');
  void recompute();
}

function closeFocus(refresh = true): void {
  if (!focusUrl) return;
  focusUrl = null;
  $('focusBar').hidden = true;
  document.body.classList.remove('focused');
  if (refresh) void recompute();
}

async function recompute(keepScroll = false): Promise<void> {
  const gen = ++generation;
  const range = focusUrl ? { start: null, end: null } : rangeFromInputs(dateFilter());
  const search = searchInput.value;

  let result: Entry[];
  if (focusUrl) {
    const visits = await visitsFor(items.filter((e) => e.url === focusUrl), gen);
    if (visits === null) return;
    result = visits;
  } else if (prefs.mode === 'urls') {
    result = filterEntries(items, { search, range, content: contentOf });
  } else {
    // A visit inside the range belongs to a URL whose last visit is at or after the range start,
    // and visits share their URL's title: filter URLs on text first, fetch only their visits.
    const textOnly = filterEntries(items, { search, range: { start: null, end: null }, content: contentOf });
    const candidates = range.start === null ? textOnly : textOnly.filter((e) => e.lastVisitTime >= range.start!);
    let shown = false;
    const visits = await visitsFor(candidates, gen, (partial) => {
      show(filterEntries(partial, { search: '', range }), range, keepScroll || shown);
      shown = true;
    });
    if (visits === null) return;
    result = filterEntries(visits, { search: '', range });
    keepScroll ||= shown;
  }
  if (gen !== generation) return;
  show(result, range, keepScroll);
}

function show(result: Entry[], range: TimeRange, keepScroll: boolean): void {
  filtered = sortEntries(result, prefs.sort);
  rebuildRows(keepScroll);
  renderTimeline(buildTimeline(filtered, range));
  highlightQuick(range);
}

function rebuildRows(keepScroll: boolean): void {
  rows = buildRows(filtered, prefs.group, collapsed);
  anchor = null;
  spacer.style.height = `${rows.length * ROW_H}px`;
  if (!keepScroll) viewport.scrollTop = 0;
  emptyBox.hidden = rows.length > 0;
  if (!rows.length) {
    emptyBox.textContent = items.length ? 'Aucun résultat pour ces filtres.' : 'Historique vide.';
  }
  const pagesCount = viewMode() === 'visits' ? new Set(filtered.map((e) => e.url)).size : filtered.length;
  countLabel.textContent = viewMode() === 'visits'
    ? `${plural(filtered.length, 'visite')} (${plural(pagesCount, 'page')})`
    : plural(filtered.length, 'page');
  renderList();
  updateSelectionUi();
}

const fmt = (n: number) => n.toLocaleString('fr-FR');
const plural = (n: number, word: string) => `${fmt(n)} ${word}${n > 1 ? 's' : ''}`;

// ---------------------------------------------------------------- list rendering

let renderQueued = false;
function queueRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    renderList();
  });
}

/** Builds an element with properties set directly (no HTML parsing, so page data is never markup). */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}): HTMLElementTagNameMap[K] {
  return Object.assign(document.createElement(tag), props);
}

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function hue(host: string): number {
  let h = 0;
  for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) % 360;
  return h;
}

function groupState(entries: Entry[]): 'all' | 'some' | 'none' {
  let n = 0;
  for (const e of entries) if (selected.has(e.url)) n++;
  return n === 0 ? 'none' : n === entries.length ? 'all' : 'some';
}

function renderList(): void {
  const top = viewport.scrollTop;
  const first = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
  const last = Math.min(rows.length - 1, Math.ceil((top + viewport.clientHeight) / ROW_H) + OVERSCAN);
  const showDate = prefs.group !== 'date';
  const out: HTMLElement[] = [];
  for (let i = first; i <= last; i++) {
    const r = rows[i]!;
    const row = el('div', { className: r.kind === 'header' ? 'row header' : 'row item' });
    row.style.transform = `translateY(${i * ROW_H}px)`;
    row.dataset.i = String(i);
    if (r.kind === 'header') {
      const st = groupState(r.entries);
      row.classList.toggle('collapsed', r.collapsed);
      const cb = el('input', { type: 'checkbox', className: 'sel', checked: st === 'all', indeterminate: st === 'some' });
      cb.setAttribute('aria-label', 'Sélectionner le groupe');
      const chevron = el('span', { className: 'chevron' });
      chevron.setAttribute('aria-hidden', 'true');
      row.append(cb, chevron, el('span', { className: 'glabel', textContent: r.label }), el('span', { className: 'gcount', textContent: fmt(r.count) }));
    } else {
      const e = r.entry;
      const sel = selected.has(e.url);
      const page = pages.get(e.url);
      const title = e.title || page?.title || e.url;
      row.classList.toggle('selected', sel);
      const cb = el('input', { type: 'checkbox', className: 'sel', checked: sel });
      cb.setAttribute('aria-label', 'Sélectionner');
      const badge = el('span', { className: 'badge', textContent: (e.host || '?').charAt(0).toUpperCase() });
      badge.style.setProperty('--h', String(hue(e.host)));
      const link = el('a', {
        className: 'title', href: e.url, target: '_blank', rel: 'noopener', textContent: title,
        title: [title, e.url, page?.description].filter(Boolean).join('\n'),
      });
      const remove = el('button', { type: 'button', className: 'remove', title: "Supprimer cette page de l'historique", textContent: '✕' });
      remove.setAttribute('aria-label', 'Supprimer');
      row.append(
        cb,
        el('span', { className: 'time', textContent: showDate ? formatDateTime(e.time) : formatTime(e.time) }),
        badge,
        link,
        el('button', { type: 'button', className: 'host', title: 'Filtrer sur ce site', textContent: e.host }),
        el('span', { className: 'desc', textContent: page?.description ?? '' }),
        el('button', {
          type: 'button', className: 'visits', textContent: fmt(e.visitCount),
          title: `${fmt(e.visitCount)} visite${e.visitCount > 1 ? 's' : ''} au total : voir toutes les visites de cette page`,
        }),
        remove,
      );
    }
    out.push(row);
  }
  // Rows live inside the spacer, which carries the full scroll height.
  spacer.replaceChildren(...out);
}

viewport.addEventListener('scroll', queueRender, { passive: true });
new ResizeObserver(queueRender).observe(viewport);

// ---------------------------------------------------------------- selection

function entryRowIndexes(from: number, to: number): Entry[] {
  const out: Entry[] = [];
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
    const r = rows[i];
    if (r?.kind === 'item') out.push(r.entry);
  }
  return out;
}

function setSelected(entries: Iterable<Entry>, on: boolean): void {
  for (const e of entries) {
    if (on) selected.add(e.url);
    else selected.delete(e.url);
  }
}

function toggleItem(index: number, shift: boolean): void {
  const r = rows[index];
  if (r?.kind !== 'item') return;
  const on = !selected.has(r.entry.url);
  if (shift && anchor !== null) setSelected(entryRowIndexes(anchor, index), on);
  else setSelected([r.entry], on);
  anchor = index;
  renderList();
  updateSelectionUi();
}

function updateSelectionUi(): void {
  const n = selected.size;
  selInfo.textContent = n ? `${fmt(n)} page${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''}` : '';
  deleteBtn.disabled = n === 0;
  clearSelBtn.disabled = n === 0;
  const st = filtered.length ? groupState(filtered) : 'none';
  selectAll.checked = st === 'all';
  selectAll.indeterminate = st === 'some';
}

function selectAllFiltered(on: boolean): void {
  setSelected(filtered, on);
  renderList();
  updateSelectionUi();
}

selectAll.addEventListener('change', () => selectAllFiltered(selectAll.checked));
clearSelBtn.addEventListener('click', () => {
  selected.clear();
  renderList();
  updateSelectionUi();
});

viewport.addEventListener('click', (ev) => {
  const target = ev.target as HTMLElement;
  const rowEl = target.closest<HTMLElement>('.row');
  if (!rowEl) return;
  const index = Number(rowEl.dataset.i);
  const r = rows[index];
  if (!r) return;

  if (r.kind === 'header') {
    if (target.classList.contains('sel')) {
      setSelected(r.entries, groupState(r.entries) !== 'all');
      renderList();
      updateSelectionUi();
      return;
    }
    if (collapsed.has(r.key)) collapsed.delete(r.key);
    else collapsed.add(r.key);
    rebuildRows(true);
    return;
  }

  if (target.closest('a.title')) return; // let the link open
  if (target.classList.contains('host')) {
    const q = searchInput.value.replace(/(^|\s)site:\S+/gi, '').trim();
    searchInput.value = `${q ? `${q} ` : ''}site:${r.entry.host}`;
    onSearchChanged(0);
    return;
  }
  if (target.classList.contains('visits')) {
    openFocus(r.entry);
    return;
  }
  if (target.classList.contains('remove')) {
    void confirmDelete([r.entry.url]);
    return;
  }
  if (target.classList.contains('sel')) ev.preventDefault();
  toggleItem(index, ev.shiftKey);
});

// Shift+click on a checkbox must not start a text selection.
viewport.addEventListener('mousedown', (ev) => {
  if (ev.shiftKey) ev.preventDefault();
});

// ---------------------------------------------------------------- deletion

function ask(title: string, text: string): Promise<boolean> {
  $('confirmTitle').textContent = title;
  $('confirmText').textContent = text;
  confirmDialog.returnValue = '';
  confirmDialog.showModal();
  $<HTMLButtonElement>('confirmOk').focus();
  return new Promise((resolve) => {
    confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'ok'), { once: true });
  });
}

async function confirmDelete(urls: string[]): Promise<void> {
  if (!urls.length) return;
  const n = urls.length;
  const what = n === 1 ? 'cette page' : `ces ${fmt(n)} pages`;
  const visitsNote = focusUrl && n === 1 && urls[0] === focusUrl
    ? ` Ses ${plural(filtered.length, 'visite')} seront supprimées.`
    : viewMode() === 'visits'
    ? ' Firefox ne permet pas de supprimer une visite isolée : toutes les visites de ' + what + ' seront supprimées, y compris hors des filtres.'
    : ' Toutes leurs visites seront supprimées.';
  const ok = await ask(`Supprimer ${what} de l'historique ?`, `Cette action est définitive.${visitsNote}`);
  if (!ok) return;

  progress.hidden = false;
  const failed: string[] = [];
  await pool(urls, DELETE_CONCURRENCY, async (url) => {
    try {
      await browser.history.deleteUrl({ url });
    } catch {
      failed.push(url);
    }
  }, (done) => {
    progress.textContent = `Suppression : ${done} / ${n}`;
  });
  progress.hidden = true;

  const removed = new Set(urls.filter((u) => !failed.includes(u)));
  await deletePages([...removed]).catch(() => undefined);
  items = items.filter((e) => !removed.has(e.url));
  for (const u of removed) {
    visitCache.delete(u);
    pages.delete(u);
    selected.delete(u);
  }
  if (focusUrl && removed.has(focusUrl)) closeFocus(false);
  await recompute(true);
  await refreshIndexInfo();
  if (failed.length) alert(`${failed.length} page(s) n'ont pas pu être supprimées.`);
}

deleteBtn.addEventListener('click', () => void confirmDelete([...selected]));

document.addEventListener('keydown', (ev) => {
  const inField = (ev.target as HTMLElement).closest('input, select, textarea, dialog');
  if (ev.key === 'Escape' && !inField && selected.size) {
    selected.clear();
    renderList();
    updateSelectionUi();
  } else if (ev.key === 'Escape' && !inField && focusUrl) {
    closeFocus();
  } else if (ev.key === 'Delete' && !inField && selected.size) {
    ev.preventDefault();
    void confirmDelete([...selected]);
  } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'a' && !inField) {
    ev.preventDefault();
    selectAllFiltered(true);
  } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'f') {
    ev.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// ---------------------------------------------------------------- timeline

const bucketFormat = {
  hour: new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  day: new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
  month: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }),
};
let currentTimeline: Timeline | null = null;

function renderTimeline(t: Timeline): void {
  currentTimeline = t;
  if (!prefs.timeline) {
    timelineBox.hidden = true;
    return;
  }
  timelineBox.hidden = false;
  const n = t.buckets.length;
  if (!n || t.max === 0) {
    timelineBox.replaceChildren(el('div', { className: 'tl-empty', textContent: 'Aucune visite sur la période.' }));
    return;
  }
  const W = 1000;
  const H = 64;
  const bw = W / n;
  const gap = Math.min(2, bw * 0.2);
  const fmtB = bucketFormat[t.unit];
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Timeline des visites' });
  t.buckets.forEach((b, i) => {
    const h = b.count ? Math.max(2, (b.count / t.max) * (H - 4)) : 0;
    const g = svgEl('g', { 'data-b': i });
    g.append(svgEl('rect', { class: 'hit', x: i * bw, y: 0, width: bw, height: H }));
    if (h) g.append(svgEl('rect', { class: 'bar', x: i * bw + gap / 2, y: H - h, width: Math.max(0.5, bw - gap), height: h, rx: 1 }));
    const tip = svgEl('title', {});
    tip.textContent = `${fmtB.format(b.start)} : ${fmt(b.count)}`;
    g.append(tip);
    svg.append(g);
  });
  const labelIdx = [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
  const unitName = { hour: 'par heure', day: 'par jour', month: 'par mois' }[t.unit];
  const head = el('div', { className: 'tl-head' });
  head.append(el('span', { textContent: `Visites ${unitName}` }), el('span', { textContent: `max ${fmt(t.max)}` }));
  const axis = el('div', { className: 'tl-axis' });
  axis.append(...labelIdx.map((i) => el('span', { textContent: fmtB.format(t.buckets[i]!.start) })));
  timelineBox.replaceChildren(head, svg, axis);
}

timelineBox.addEventListener('click', (ev) => {
  const g = (ev.target as Element).closest('g[data-b]');
  if (!g || !currentTimeline) return;
  const b = currentTimeline.buckets[Number(g.getAttribute('data-b'))];
  if (!b) return;
  // Zoom into the clicked bucket: a month becomes its days, a day its hours.
  dateInputs.fromDate.value = toDateInput(b.start);
  dateInputs.toDate.value = currentTimeline.unit === 'month' ? toDateInput(b.end) : '';
  dateInputs.fromTime.value = currentTimeline.unit === 'hour' ? toTimeInput(b.start) : '';
  dateInputs.toTime.value = currentTimeline.unit === 'hour' ? toTimeInput(b.end) : '';
  closeFocus(false);
  void recompute();
});

// ---------------------------------------------------------------- quick ranges

function setDates(from: number | null, to: number | null): void {
  dateInputs.fromDate.value = from === null ? '' : toDateInput(from);
  dateInputs.toDate.value = to === null ? '' : toDateInput(to);
  dateInputs.fromTime.value = '';
  dateInputs.toTime.value = '';
}

function quickRange(kind: string): [number | null, number | null] {
  const today = startOfDay(Date.now());
  const day = (offset: number) => new Date(new Date(today).setDate(new Date(today).getDate() + offset)).getTime();
  switch (kind) {
    case 'today': return [today, null];
    case 'yesterday': return [day(-1), null];
    case '7': return [day(-6), today];
    case '30': return [day(-29), today];
    default: return [null, null];
  }
}

function highlightQuick(range: TimeRange): void {
  for (const btn of document.querySelectorAll<HTMLButtonElement>('#quick button')) {
    const [from, to] = quickRange(btn.dataset.quick!);
    const expected = rangeFromInputs({
      fromDate: from === null ? '' : toDateInput(from), fromTime: '',
      toDate: to === null ? '' : toDateInput(to), toTime: '',
    });
    btn.classList.toggle('active', expected.start === range.start && expected.end === range.end);
  }
}

$('quick').addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-quick]');
  if (!btn) return;
  const [from, to] = quickRange(btn.dataset.quick!);
  setDates(from, to);
  closeFocus(false);
  void recompute();
});

// ---------------------------------------------------------------- controls

const clearSearchBtn = $<HTMLButtonElement>('clearSearch');
let searchTimer = 0;
function onSearchChanged(delay: number): void {
  clearSearchBtn.hidden = searchInput.value === '';
  closeFocus(false);
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void recompute(), delay);
}
searchInput.addEventListener('input', () => onSearchChanged(150));
searchInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && searchInput.value) {
    ev.preventDefault();
    searchInput.value = '';
    onSearchChanged(0);
  }
});
clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  onSearchChanged(0);
  searchInput.focus();
});
$('focusClose').addEventListener('click', () => closeFocus());
$('focusDelete').addEventListener('click', () => {
  if (focusUrl) void confirmDelete([focusUrl]);
});
for (const input of Object.values(dateInputs)) {
  input.addEventListener('change', () => {
    closeFocus(false);
    void recompute();
  });
}

function applyPrefsToUi(): void {
  groupSelect.value = prefs.group;
  sortSelect.value = prefs.sort;
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
    const on = b.dataset.mode === prefs.mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  }
  $('timelineToggle').setAttribute('aria-pressed', String(prefs.timeline));
}

function savePrefs(): void {
  applyPrefsToUi();
  void browser.storage.local.set({ ui: prefs });
}

for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
  b.addEventListener('click', () => {
    prefs.mode = b.dataset.mode as ViewMode;
    closeFocus(false);
    savePrefs();
    void recompute();
  });
}
groupSelect.addEventListener('change', () => {
  prefs.group = groupSelect.value as GroupBy;
  collapsed.clear();
  savePrefs();
  void recompute();
});
sortSelect.addEventListener('change', () => {
  prefs.sort = sortSelect.value as SortBy;
  savePrefs();
  void recompute();
});
$('timelineToggle').addEventListener('click', () => {
  prefs.timeline = !prefs.timeline;
  savePrefs();
  if (currentTimeline) renderTimeline(currentTimeline);
});
$('reset').addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.hidden = true;
  closeFocus(false);
  setDates(null, null);
  collapsed.clear();
  void recompute();
});

// ---------------------------------------------------------------- content index status

async function refreshIndexInfo(): Promise<void> {
  const granted = await browser.permissions.contains(ALL_URLS).catch(() => false);
  $<HTMLInputElement>('indexToggle').checked = settings.indexContent;
  $('grant').hidden = granted || !settings.indexContent;
  const info = $('indexInfo');
  if (!settings.indexContent) info.textContent = 'Recherche limitée aux titres et adresses.';
  else if (!granted) info.textContent = "Firefox n'a pas encore donné l'accès aux pages : rien n'est indexé.";
  else info.textContent = `${fmt(pages.size)} pages indexées (contenu des pages visitées depuis l'installation).`;
}

$('indexToggle').addEventListener('change', async (ev) => {
  settings = { ...settings, indexContent: (ev.target as HTMLInputElement).checked };
  await saveSettings(settings);
  await refreshIndexInfo();
});
$('grant').addEventListener('click', async () => {
  await browser.permissions.request(ALL_URLS).catch(() => false);
  await refreshIndexInfo();
});
$('clearIndex').addEventListener('click', async () => {
  const ok = await ask("Vider l'index du contenu ?", "Le texte capturé des pages est effacé. L'historique de Firefox n'est pas touché.");
  if (!ok) return;
  await clearPages();
  pages.clear();
  await refreshIndexInfo();
  await recompute(true);
});

// ---------------------------------------------------------------- live updates

let liveTimer = 0;
function scheduleLiveRefresh(): void {
  clearTimeout(liveTimer);
  liveTimer = window.setTimeout(async () => {
    await Promise.all([loadItems(), loadPages()]);
    await recompute(true);
    await refreshIndexInfo();
  }, 1500);
}

browser.history.onVisited.addListener((item) => {
  if (item.url) visitCache.delete(item.url);
  scheduleLiveRefresh();
});
browser.history.onVisitRemoved.addListener((removed) => {
  if (removed.allHistory) visitCache.clear();
  else for (const u of removed.urls ?? []) visitCache.delete(u);
  scheduleLiveRefresh();
});

// ---------------------------------------------------------------- boot

async function boot(): Promise<void> {
  const stored = (await browser.storage.local.get('ui')) as { ui?: Partial<UiPrefs> };
  Object.assign(prefs, stored.ui);
  applyPrefsToUi();
  settings = await loadSettings();
  const t0 = performance.now();
  await Promise.all([loadItems(), loadPages()]);
  await recompute();
  await refreshIndexInfo();
  console.info(`FireHistory: ${items.length} pages, ${pages.size} indexed, first render in ${Math.round(performance.now() - t0)} ms`);
  searchInput.focus();
}

void boot().catch((err) => {
  console.error(err);
  countLabel.textContent = `Erreur de chargement : ${String(err)}`;
});

