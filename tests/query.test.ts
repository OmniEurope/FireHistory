import { describe, expect, it } from 'vitest';
import { buildRows, buildTimeline, entriesFromVisits, entryFromItem, filterEntries, sortEntries, type Entry } from '../src/shared/query';
import { parseSearch } from '../src/shared/text';

const at = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();
const e = (url: string, title: string, day: number, visits = 1, hour = 12): Entry =>
  entryFromItem({ url, title, lastVisitTime: at(day, hour), visitCount: visits })!;

const data = [
  e('https://github.com/mozilla/gecko', 'Gecko engine', 10, 30),
  e('https://www.lemonde.fr/economie/', "L'économie en été", 10, 2, 9),
  e('https://developer.mozilla.org/fr/docs/Web/API/History', 'History API', 9, 120),
  e('https://example.com/', '', 3, 1),
];
const noRange = { start: null, end: null };

describe('parseSearch', () => {
  it('splits terms, phrases and site filters', () => {
    expect(parseSearch('Été "Web API" site:www.GitHub.com')).toEqual({ terms: ['ete', 'web api'], sites: ['github.com'] });
  });
});

describe('filterEntries', () => {
  it('matches title and URL without accents and case', () => {
    expect(filterEntries(data, { search: 'ECONOMIE ete', range: noRange }).map((x) => x.host)).toEqual(['lemonde.fr']);
    expect(filterEntries(data, { search: 'docs/web', range: noRange }).map((x) => x.host)).toEqual(['developer.mozilla.org']);
  });

  it('falls back to indexed content when title and URL do not match', () => {
    const content = (url: string) => (url === 'https://example.com/' ? 'illustrative domain for documentation' : undefined);
    expect(filterEntries(data, { search: 'illustrative', range: noRange, content }).map((x) => x.host)).toEqual(['example.com']);
    // Pages without indexed content still match on title and URL.
    expect(filterEntries(data, { search: 'gecko', range: noRange, content }).length).toBe(1);
  });

  it('filters by site and by range', () => {
    expect(filterEntries(data, { search: 'site:mozilla', range: noRange }).length).toBe(1);
    const day10 = { start: new Date(2026, 10, 10).getTime(), end: new Date(2026, 10, 11).getTime() - 1 };
    expect(filterEntries(data, { search: '', range: day10 }).length).toBe(2);
  });
});

describe('visits mode', () => {
  it('creates one entry per visit with unique keys', () => {
    const v = entriesFromVisits(data[0]!, [{ visitId: '1', visitTime: at(1) }, { visitId: '2', visitTime: at(2) }, { visitId: '3' }]);
    expect(v.map((x) => x.key)).toEqual(['https://github.com/mozilla/gecko#1', 'https://github.com/mozilla/gecko#2']);
    expect(v[0]!.time).toBe(at(1));
  });
});

describe('buildRows', () => {
  it('groups by day, newest day first', () => {
    const rows = buildRows(sortEntries(data.slice(), 'recent'), 'date', new Set(), at(11));
    const headers = rows.filter((r) => r.kind === 'header');
    expect(headers.map((h) => h.count)).toEqual([2, 1, 1]);
    expect(headers[0]!.label).toMatch(/^Hier/);
  });

  it('groups by site, biggest group first, and hides collapsed groups', () => {
    const more = [...data, e('https://github.com/a', 'A', 1)];
    const rows = buildRows(sortEntries(more, 'recent'), 'site', new Set(['s:github.com']));
    expect(rows[0]).toMatchObject({ kind: 'header', label: 'github.com', count: 2, collapsed: true });
    expect(rows[1]!.kind).toBe('header');
  });

  it('groups by visit count buckets, most visited first', () => {
    const rows = buildRows(sortEntries(data.slice(), 'visits'), 'visits', new Set());
    expect(rows.filter((r) => r.kind === 'header').map((h) => h.kind === 'header' && h.label)).toEqual([
      '100 visites et plus', '21 à 99 visites', '2 à 5 visites', '1 visite',
    ]);
  });
});

describe('buildTimeline', () => {
  it('uses days for a multi-day span and counts every entry', () => {
    const t = buildTimeline(data, noRange, at(11));
    expect(t.unit).toBe('day');
    expect(t.buckets.reduce((s, b) => s + b.count, 0)).toBe(4);
    expect(t.max).toBe(2);
  });

  it('uses hours inside a single day', () => {
    const day = { start: new Date(2026, 10, 10).getTime(), end: new Date(2026, 10, 11).getTime() - 1 };
    const t = buildTimeline(data.slice(0, 2), day, at(11));
    expect(t.unit).toBe('hour');
    expect(t.buckets.length).toBe(24);
  });
});
