import { describe, expect, it } from 'vitest';
import { dayLabel, inRange, rangeFromInputs } from '../src/shared/dates';

const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0) => new Date(y, mo - 1, d, h, mi, s, ms).getTime();
const empty = { fromDate: '', fromTime: '', toDate: '', toTime: '' };

describe('rangeFromInputs', () => {
  it('no input means no bounds', () => {
    expect(rangeFromInputs(empty)).toEqual({ start: null, end: null });
  });

  it('a lone "from" date covers that whole day', () => {
    const r = rangeFromInputs({ ...empty, fromDate: '2026-11-05' });
    expect(r.start).toBe(at(2026, 11, 5));
    expect(r.end).toBe(at(2026, 11, 5, 23, 59, 59, 999));
    expect(inRange(at(2026, 11, 5, 23, 30), r)).toBe(true);
    expect(inRange(at(2026, 11, 6, 0, 0), r)).toBe(false);
    expect(inRange(at(2026, 11, 4, 23, 59), r)).toBe(false);
  });

  it('from + to covers both whole days', () => {
    const r = rangeFromInputs({ ...empty, fromDate: '2026-11-01', toDate: '2026-11-03' });
    expect(r.start).toBe(at(2026, 11, 1));
    expect(r.end).toBe(at(2026, 11, 3, 23, 59, 59, 999));
  });

  it('times without a "to" date apply to the "from" day', () => {
    const r = rangeFromInputs({ fromDate: '2026-11-05', fromTime: '14:00', toDate: '', toTime: '16:00' });
    expect(r.start).toBe(at(2026, 11, 5, 14));
    expect(r.end).toBe(at(2026, 11, 5, 16, 0, 59, 999));
  });

  it('a lone "to" date means everything up to the end of that day', () => {
    const r = rangeFromInputs({ ...empty, toDate: '2026-11-05' });
    expect(r).toEqual({ start: null, end: at(2026, 11, 5, 23, 59, 59, 999) });
  });

  it('swapped dates are reordered', () => {
    const r = rangeFromInputs({ ...empty, fromDate: '2026-11-10', toDate: '2026-11-01' });
    expect(r.start! <= r.end!).toBe(true);
  });
});

describe('dayLabel', () => {
  const now = at(2026, 11, 11, 15);
  it('names today and yesterday', () => {
    expect(dayLabel(at(2026, 11, 11, 1), now)).toMatch(/^Aujourd'hui · /);
    expect(dayLabel(at(2026, 11, 10, 23), now)).toMatch(/^Hier · /);
    expect(dayLabel(at(2026, 11, 2, 9), now)).toMatch(/^Lundi 2 novembre 2026$/);
  });
});
