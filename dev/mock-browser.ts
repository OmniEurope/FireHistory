// FAKE WebExtension API for the dev preview (`npm run preview`, then /dev/index.html).
// Generates a deterministic synthetic history so the page can be checked in any browser.
// It is a test double: it never runs inside the extension.

interface FakeVisit { visitId: string; visitTime: number }
interface FakeItem { id: string; url: string; title: string; lastVisitTime: number; visitCount: number; visits: FakeVisit[] }

const PAGE_COUNT = Number(new URLSearchParams(location.search).get('pages') ?? 3000);
const sites = [
  ['github.com', ['mozilla/gecko-dev', 'microsoft/TypeScript', 'vitejs/vite', 'pulls', 'notifications']],
  ['developer.mozilla.org', ['fr/docs/Web/API/History_API', 'fr/docs/Mozilla/Add-ons/WebExtensions', 'fr/docs/Web/CSS/contain']],
  ['www.lemonde.fr', ['economie/article/ete-2026', 'international/', 'pixels/']],
  ['stackoverflow.com', ['questions/indexeddb-getall', 'questions/virtual-scroll', 'questions/firefox-mv3']],
  ['www.youtube.com', ['watch?v=abc', 'watch?v=def', 'feed/subscriptions']],
  ['fr.wikipedia.org', ['wiki/Firefox', 'wiki/Historique_(navigateur)', 'wiki/IndexedDB']],
  ['news.ycombinator.com', ['item?id=1', 'item?id=2', 'newest']],
  ['mail.google.com', ['mail/u/0/#inbox']],
] as const;

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const now = Date.now();
const fake: FakeItem[] = [];
for (let i = 0; i < PAGE_COUNT; i++) {
  const [host, paths] = sites[Math.floor(rnd() * sites.length)]!;
  const path = paths[Math.floor(rnd() * paths.length)]!;
  const url = `https://${host}/${path}${i > 30 ? `?p=${i}` : ''}`;
  const count = Math.max(1, Math.floor(rnd() ** 4 * 150));
  const visits: FakeVisit[] = [];
  for (let v = 0; v < count; v++) {
    visits.push({ visitId: `${i}-${v}`, visitTime: now - Math.floor(rnd() ** 2 * 90 * 86_400_000) });
  }
  visits.sort((a, b) => b.visitTime - a.visitTime);
  fake.push({ id: String(i), url, title: `${path.split('/').pop() || host} · ${host}`, lastVisitTime: visits[0]!.visitTime, visitCount: count, visits });
}

const store: Record<string, unknown> = {};
const noop = { addListener() {} };

(globalThis as unknown as { browser: unknown }).browser = {
  history: {
    async search() {
      return fake.map(({ visits: _v, ...rest }) => rest);
    },
    async getVisits({ url }: { url: string }) {
      return fake.find((f) => f.url === url)?.visits ?? [];
    },
    async deleteUrl({ url }: { url: string }) {
      const i = fake.findIndex((f) => f.url === url);
      if (i >= 0) fake.splice(i, 1);
    },
    onVisited: noop,
    onVisitRemoved: noop,
  },
  storage: {
    local: {
      async get(key: string) {
        return key in store ? { [key]: store[key] } : {};
      },
      async set(values: Record<string, unknown>) {
        Object.assign(store, values);
      },
    },
  },
  permissions: {
    async contains() { return true; },
    async request() { return true; },
  },
};
