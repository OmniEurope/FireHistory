/** Lowercases and strips diacritics so "Éte" matches "ete". Used for every searchable string. */
export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Hostname of a URL without a leading "www.", or '' when the URL cannot be parsed. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export interface ParsedSearch {
  /** Normalized terms that must all match (title, URL or indexed content). */
  terms: string[];
  /** Normalized `site:` filters; an entry matches when its host contains one of them. */
  sites: string[];
}

/**
 * Splits a search box value into terms. Supports quoted phrases ("exact phrase") and
 * `site:example.com` filters. Every term must match (AND).
 */
export function parseSearch(input: string): ParsedSearch {
  const terms: string[] = [];
  const sites: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    const raw = m[1] ?? m[2] ?? '';
    if (m[2] !== undefined && /^site:/i.test(raw)) {
      const site = normalize(raw.slice(5)).replace(/^www\./, '');
      if (site) sites.push(site);
      continue;
    }
    const term = normalize(raw.trim());
    if (term) terms.push(term);
  }
  return { terms, sites };
}
