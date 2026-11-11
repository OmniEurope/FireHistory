export interface TimeRange {
  /** Inclusive start (epoch ms), or null for "since the beginning". */
  start: number | null;
  /** Inclusive end (epoch ms), or null for "until now". */
  end: number | null;
}

export interface DateFilterInput {
  fromDate: string; // yyyy-mm-dd or ''
  fromTime: string; // hh:mm or ''
  toDate: string;
  toTime: string;
}

const DAY_MS = 86_400_000;

function parseDate(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

function parseTime(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return (Number(m[1]) * 60 + Number(m[2])) * 60_000;
}

function withTime(dayStart: number, offset: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, offset).getTime();
}

function endOfDay(dayStart: number): number {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
}

/**
 * Turns the date/time inputs into a range:
 * - "from" alone: that whole day (or from the given time to the end of that day);
 * - "from" + "to": from the start of the first day (or its time) to the end of the last day (or its time);
 * - "to" alone: everything up to the end of that day (or its time);
 * - times without a "to" date apply to the "from" day ("on Nov 5 between 14:00 and 16:00").
 * Swapped bounds are put back in order.
 */
export function rangeFromInputs(input: DateFilterInput): TimeRange {
  const fromDay = parseDate(input.fromDate);
  const toDay = parseDate(input.toDate);
  const fromTime = parseTime(input.fromTime);
  const toTime = parseTime(input.toTime);

  let start: number | null = null;
  let end: number | null = null;

  if (fromDay !== null) {
    start = fromTime !== null ? withTime(fromDay, fromTime) : fromDay;
    const lastDay = toDay ?? fromDay;
    end = toTime !== null ? withTime(lastDay, toTime + 59_999) : endOfDay(lastDay);
  } else if (toDay !== null) {
    end = toTime !== null ? withTime(toDay, toTime + 59_999) : endOfDay(toDay);
  }

  if (start !== null && end !== null && end < start) [start, end] = [end, start];
  return { start, end };
}

export function inRange(time: number, range: TimeRange): boolean {
  return (range.start === null || time >= range.start) && (range.end === null || time <= range.end);
}

export function startOfDay(time: number): number {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dayKey(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const shortDateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** "Aujourd'hui · mardi 11 novembre 2026", "Hier · ...", or the plain long date. */
export function dayLabel(time: number, now: number = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(time)) / DAY_MS);
  const long = dayFormat.format(time);
  const capital = long.charAt(0).toUpperCase() + long.slice(1);
  if (diff === 0) return `Aujourd'hui · ${long}`;
  if (diff === 1) return `Hier · ${long}`;
  return capital;
}

export function formatTime(time: number): string {
  return timeFormat.format(time);
}

export function formatDateTime(time: number): string {
  return `${shortDateFormat.format(time)} ${timeFormat.format(time)}`;
}

/** yyyy-mm-dd of a timestamp, for <input type="date">. */
export function toDateInput(time: number): string {
  return dayKey(time);
}

/** hh:mm of a timestamp, for <input type="time">. */
export function toTimeInput(time: number): string {
  const d = new Date(time);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
