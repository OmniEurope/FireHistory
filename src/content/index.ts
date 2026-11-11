// Content script: captures the page title, meta description and main text so the history
// page can search inside page content. Self-contained on purpose (content scripts cannot be
// ES modules, so this file must not import anything).

const MAX_TEXT = 4000;

function meta(selector: string): string {
  const el = document.querySelector<HTMLMetaElement>(selector);
  return el?.content?.trim() ?? '';
}

function mainText(): string {
  const root = document.querySelector<HTMLElement>('article, main, [role="main"]') ?? document.body;
  if (!root) return '';
  return (root.innerText || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

function capture(): number {
  if (document.contentType && !/html/i.test(document.contentType)) return 0;
  const text = mainText();
  void browser.runtime
    .sendMessage({
      type: 'firehistory:page',
      url: location.href,
      title: document.title || '',
      description: meta('meta[name="description" i]') || meta('meta[property="og:description" i]'),
      text,
    })
    .catch(() => undefined);
  return text.length;
}

if (capture() < 200) {
  // Late-rendered pages (single-page apps): try once more after the content settles.
  setTimeout(capture, 4000);
}
