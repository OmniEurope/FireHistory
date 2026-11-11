export interface Settings {
  /** Capture page content (title, description, text) for full-text search. */
  indexContent: boolean;
}

export const DEFAULT_SETTINGS: Settings = { indexContent: true };

export async function loadSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get('settings')) as { settings?: Partial<Settings> };
  return { ...DEFAULT_SETTINGS, ...stored.settings };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}

export const ALL_URLS = { origins: ['<all_urls>'] };
