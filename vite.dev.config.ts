// Dev-only preview of the history page in a regular browser, with a FAKE `browser` API
// (dev/mock-browser.ts). Never part of the extension build.
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5178, strictPort: true, open: false },
});
