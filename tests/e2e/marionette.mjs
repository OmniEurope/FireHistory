// Minimal Marionette client (Firefox's native automation protocol). Used by the e2e check because
// WebDriver BiDi refuses to navigate to moz-extension:// pages. Frames are `<length>:<json>`.
import net from 'node:net';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** `files`: { nameInProfile: sourcePath } copied into the fresh profile before start. */
export async function launchFirefox({ executable, port, prefs = {}, files = {} }) {
  const profile = mkdtempSync(join(tmpdir(), 'firehistory-e2e-'));
  for (const [name, src] of Object.entries(files)) copyFileSync(src, join(profile, name));
  const all = {
    'marionette.port': port,
    'browser.shell.checkDefaultBrowser': false,
    'browser.startup.homepage_override.mstone': 'ignore',
    'datareporting.policy.dataSubmissionEnabled': false,
    'toolkit.telemetry.reportingpolicy.firstRun': false,
    'app.update.disabledForTesting': true,
    ...prefs,
  };
  writeFileSync(join(profile, 'user.js'), Object.entries(all).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n'));
  const proc = spawn(executable, ['--marionette', '--headless', '--no-remote', '--profile', profile], { stdio: 'ignore', env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1' } });

  let socket;
  for (let i = 0; i < 100 && !socket; i++) {
    socket = await new Promise((resolve) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => resolve(s));
      s.once('error', () => resolve(undefined));
    });
    if (!socket) await new Promise((r) => setTimeout(r, 200));
  }
  if (!socket) {
    proc.kill();
    throw new Error('Marionette did not start');
  }

  let buffer = Buffer.alloc(0);
  let id = 0;
  const pending = new Map();
  let greeting;
  const greeted = new Promise((r) => (greeting = r));
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const colon = buffer.indexOf(0x3a); // ':'
      if (colon < 0) return;
      const len = Number(buffer.subarray(0, colon).toString('ascii')); // byte length
      if (buffer.length < colon + 1 + len) return;
      const json = buffer.subarray(colon + 1, colon + 1 + len).toString('utf8');
      buffer = buffer.subarray(colon + 1 + len);
      const msg = JSON.parse(json);
      if (!Array.isArray(msg)) {
        greeting(msg);
        continue;
      }
      const [, msgId, error, result] = msg;
      const p = pending.get(msgId);
      pending.delete(msgId);
      if (error) p?.reject(new Error(`${error.error}: ${error.message}`));
      else p?.resolve(result);
    }
  });
  await greeted;

  const send = (name, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    const json = JSON.stringify([0, msgId, name, params]);
    socket.write(`${Buffer.byteLength(json)}:${json}`);
  });

  await send('WebDriver:NewSession', { capabilities: {} });

  return {
    send,
    /** Runs `body` (a function body, may use `arguments`) in the current context and returns its value. */
    exec: async (body, args = []) => (await send('WebDriver:ExecuteAsyncScript', {
      script: `const done = arguments[arguments.length - 1]; (async () => { ${body} })().then(done, (e) => done({ __error: String(e) }));`,
      args,
    })).value,
    async close() {
      try {
        await send('Marionette:Quit', { flags: ['eForceQuit'] });
      } catch { /* the socket closes on quit */ }
      socket.destroy();
      if (proc.exitCode === null) {
        await Promise.race([new Promise((r) => proc.once('exit', r)), new Promise((r) => setTimeout(r, 5000))]);
        if (proc.exitCode === null) proc.kill();
      }
      // Child processes may hold profile files a little longer: retry, and only warn if it still fails.
      for (let i = 0; i < 10; i++) {
        try {
          rmSync(profile, { recursive: true, force: true });
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      console.warn(`warning: could not remove the test profile ${profile}`);
    },
  };
}
