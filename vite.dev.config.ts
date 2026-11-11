// Dev-only preview of the history page in a regular browser, with a FAKE `browser` API
// (dev/mock-browser.ts). Never part of the extension build.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/** Injects the history page markup (src/history/index.html, the single source) into dev/index.html. */
function historyLayout(): Plugin {
  return {
    name: 'firehistory-dev-layout',
    transformIndexHtml(html, ctx) {
      if (!ctx.path.startsWith('/dev/')) return html;
      const page = readFileSync(resolve(import.meta.dirname, 'src/history/index.html'), 'utf8');
      const app = page.match(/<div id="app">[\s\S]*?\n {4}<\/div>/)?.[0];
      if (!app) throw new Error('FireHistory dev preview: #app not found in src/history/index.html');
      return html.replace('<div id="app"></div>', app);
    },
  };
}

export default defineConfig({
  plugins: [historyLayout()],
  server: { port: 5178, strictPort: true, open: false },
});
