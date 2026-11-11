import { clearPages, deletePages, putPage, type PageMessage } from '../shared/db';
import { loadSettings } from '../shared/settings';
import { normalize } from '../shared/text';

const PAGE_PATH = 'src/history/index.html';
const MAX_TEXT = 4000;

/** Opens the history page, or focuses it when it is already open. */
async function openHistory(): Promise<void> {
  const url = browser.runtime.getURL(PAGE_PATH);
  const [existing] = await browser.tabs.query({ url });
  if (existing?.id !== undefined) {
    await browser.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await browser.windows.update(existing.windowId, { focused: true });
    return;
  }
  await browser.tabs.create({ url });
}

browser.action.onClicked.addListener(() => {
  void openHistory();
});

function isPageMessage(msg: unknown): msg is PageMessage {
  const m = msg as Partial<PageMessage> | null;
  return !!m && m.type === 'firehistory:page' && typeof m.url === 'string' && typeof m.text === 'string';
}

browser.runtime.onMessage.addListener((msg: unknown, sender: browser.runtime.MessageSender) => {
  if (!isPageMessage(msg)) return undefined;
  // Never index private browsing tabs, nor messages that do not come from a regular tab.
  if (!sender.tab || sender.tab.incognito) return undefined;
  return (async () => {
    const settings = await loadSettings();
    if (!settings.indexContent) return;
    const title = msg.title.slice(0, 500);
    const description = msg.description.slice(0, 1000);
    const text = msg.text.slice(0, MAX_TEXT);
    await putPage({
      url: msg.url,
      title,
      description,
      search: normalize(`${title} ${description} ${text}`),
      updatedAt: Date.now(),
    });
  })();
});

// Keep the content index in sync when history is deleted (here or from Firefox itself).
browser.history.onVisitRemoved.addListener((removed) => {
  if (removed.allHistory) void clearPages();
  else void deletePages(removed.urls ?? []);
});
