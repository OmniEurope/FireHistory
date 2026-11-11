import { dayKey, dayLabel, inRange, startOfDay, type TimeRange } from './dates';
import { hostOf, normalize, parseSearch } from './text';

/** `urls`: one row per URL dated by its last visit. `visits`: one row per visit. */
export type ViewMode = 'urls' | 'visits';
export type GroupBy = 'date' | 'site' | 'visits' | 'none';
export type SortBy = 'recent' | 'oldest' | 'visits' | 'title';

export interface Entry {
  /** Unique row id: the URL in `urls` mode, `url#visitId` in `visits` mode. */
  key: string;
  url: string;
  title: string;
  host: string;
  /** Date shown and filtered on: the visit time, or the last visit time in `urls` mode. */
  time: number;
  visitCount: number;
  lastVisitTime: number;
  /** Normalized "title url" used by the search. */
  hay: string;
}

export interface HistoryItemLike {
  url?: string;
  title?: string;
  lastVisitTime?: number;
  visitCount?: number;
}

export interface VisitLike {
  visitId: string;
  visitTime?: number;
}

export function entryFromItem(item: HistoryItemLike): Entry | null {
  if (!item.url) return null;
  const title = item.title?.trim() || '';
  const time = item.lastVisitTime ?? 0;
  return {
    key: item.url,
    url: item.url,
    title,
    host: hostOf(item.url),
    time,
    visitCount: item.visitCount ?? 0,
    lastVisitTime: time,
    hay: normalize(`${title} ${item.url}`),
  };
}

export function entriesFromVisits(base: Entry, visits: readonly VisitLike[]): Entry[] {
  const out: Entry[] = [];
  for (const v of visits) {
    if (v.visitTime === undefined) continue;
    out.push({ ...base, key: `${base.url}#${v.visitId}`, time: v.visitTime });
  }
  return out;
}

export interface FilterOptions {
  search: string;
  range: TimeRange;
  /** Normalized indexed page content for a URL; undefined when the page was never indexed. */
  content?: (url: string) => string | undefined;
}

/**
 * Keeps entries inside the range whose title, URL or indexed content contain every term.
 * Pages without indexed content are matched on title and URL only.
 */
export function filterEntries(entries: readonly Entry[], opts: FilterOptions): Entry[] {
  const { terms, sites } = parseSearch(opts.search);
  const { range, content } = opts;
  const hasRange = range.start !== null || range.end !== null;
  if (!hasRange && terms.length === 0 && sites.length === 0) return entries.slice();

  const out: Entry[] = [];
  for (const e of entries) {
    if (hasRange && !inRange(e.time, range)) continue;
    if (sites.length && !sites.some((s) => e.host.includes(s))) continue;
    if (terms.length) {
      let text: string | undefined;
      let ok = true;
      for (const t of terms) {
        if (e.hay.includes(t)) continue;
        if (text === undefined) text = content?.(e.url) ?? '';
        if (!text.includes(t)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
    }
    out.push(e);
  }
  return out;
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

export function sortEntries(entries: Entry[], sort: SortBy): Entry[] {
  switch (sort) {
    case 'recent':
      return entries.sort((a, b) => b.time - a.time);
    case 'oldest':
      return entries.sort((a, b) => a.time - b.time);
    case 'visits':
      return entries.sort((a, b) => b.visitCount - a.visitCount || b.time - a.time);
    case 'title':
      return entries.sort((a, b) => collator.compare(a.title || a.url, b.title || b.url) || b.time - a.time);
  }
}

export interface HeaderRow {
  kind: 'header';
  key: string;
  label: string;
  count: number;
  collapsed: boolean;
  /** Every entry of the group, also when the group is collapsed (used by the group checkbox). */
  entries: Entry[];
}

export interface ItemRow {
  kind: 'item';
  entry: Entry;
  group: string;
}

export type Row = HeaderRow | ItemRow;

const VISIT_BUCKETS: ReadonlyArray<{ min: number; label: string }> = [
  { min: 100, label: '100 visites et plus' },
  { min: 21, label: '21 à 99 visites' },
  { min: 6, label: '6 à 20 visites' },
  { min: 2, label: '2 à 5 visites' },
  { min: 0, label: '1 visite' },
];

function visitBucket(count: number): { key: string; label: string; order: number } {
  const i = VISIT_BUCKETS.findIndex((b) => count >= b.min);
  const b = VISIT_BUCKETS[i < 0 ? VISIT_BUCKETS.length - 1 : i]!;
  return { key: `v${b.min}`, label: b.label, order: i };
}

/**
 * Groups already sorted entries into header + item rows. Group order: newest day first for
 * `date`, most entries first for `site`, most visited bucket first for `visits`. Entry order
 * inside a group keeps the sort order.
 */
export function buildRows(sorted: readonly Entry[], group: GroupBy, collapsed: ReadonlySet<string>, now = Date.now()): Row[] {
  if (group === 'none') return sorted.map((entry) => ({ kind: 'item', entry, group: '' }));

  interface G { key: string; label: string; order: number; entries: Entry[] }
  const groups = new Map<string, G>();
  for (const e of sorted) {
    let key: string;
    let label: string;
    let order: number;
    if (group === 'date') {
      key = dayKey(e.time);
      label = '';
      order = -startOfDay(e.time);
    } else if (group === 'site') {
      key = `s:${e.host}`;
      label = e.host || '(sans domaine)';
      order = 0;
    } else {
      const b = visitBucket(e.visitCount);
      key = b.key;
      label = b.label;
      order = b.order;
    }
    let g = groups.get(key);
    if (!g) {
      g = { key, label: group === 'date' ? dayLabel(e.time, now) : label, order, entries: [] };
      groups.set(key, g);
    }
    g.entries.push(e);
  }

  const list = [...groups.values()];
  if (group === 'site') list.sort((a, b) => b.entries.length - a.entries.length || collator.compare(a.label, b.label));
  else list.sort((a, b) => a.order - b.order);

  const rows: Row[] = [];
  for (const g of list) {
    const isCollapsed = collapsed.has(g.key);
    rows.push({ kind: 'header', key: g.key, label: g.label, count: g.entries.length, collapsed: isCollapsed, entries: g.entries });
    if (!isCollapsed) for (const entry of g.entries) rows.push({ kind: 'item', entry, group: g.key });
  }
  return rows;
}

export type TimelineUnit = 'hour' | 'day' | 'month';

export interface TimelineBucket {
  start: number;
  end: number;
  count: number;
}

export interface Timeline {
  unit: TimelineUnit;
  buckets: TimelineBucket[];
  max: number;
}

function floorTo(time: number, unit: TimelineUnit): number {
  const d = new Date(time);
  if (unit === 'hour') return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
  if (unit === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

function next(time: number, unit: TimelineUnit): number {
  const d = new Date(time);
  if (unit === 'hour') return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
  if (unit === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

/**
 * Histogram of entry times. The unit follows the covered span: hours up to 2 days,
 * days up to 6 months, months beyond. The span is the filter range when set, else the data span.
 */
export function buildTimeline(entries: readonly Entry[], range: TimeRange, now = Date.now()): Timeline {
  let min = Infinity;
  let max = -Infinity;
  for (const e of entries) {
    if (e.time < min) min = e.time;
    if (e.time > max) max = e.time;
  }
  if (entries.length === 0) {
    min = range.start ?? now;
    max = range.end ?? now;
  }
  const from = range.start ?? min;
  const to = Math.min(range.end ?? Math.max(max, from), Math.max(now, max));
  const span = to - from;
  const unit: TimelineUnit = span <= 2 * 86_400_000 ? 'hour' : span <= 183 * 86_400_000 ? 'day' : 'month';

  const buckets: TimelineBucket[] = [];
  const index = new Map<number, number>();
  for (let t = floorTo(from, unit); t <= to; t = next(t, unit)) {
    index.set(t, buckets.length);
    buckets.push({ start: t, end: next(t, unit) - 1, count: 0 });
  }
  let top = 0;
  for (const e of entries) {
    const i = index.get(floorTo(e.time, unit));
    if (i === undefined) continue;
    const b = buckets[i]!;
    b.count++;
    if (b.count > top) top = b.count;
  }
  return { unit, buckets, max: top };
}
