// Minimal Chrome DevTools Protocol client for the smoke harness.
// Uses only Node >= 22 built-ins (child_process, fetch, WebSocket): no new dependencies.
// It launches ONE private headless Edge/Chromium with a throw-away profile and only ever stops the
// process it started itself. It never touches Node or Vite processes.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Candidate browser executables on Windows / macOS / Linux, in preference order. */
export function browserCandidates(env = process.env, platform = process.platform) {
  if (platform === 'win32') {
    const pf86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const pf = env.ProgramFiles ?? 'C:\\Program Files';
    const local = env.LOCALAPPDATA ?? '';
    return [
      join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ...(local ? [join(local, 'Google', 'Chrome', 'Application', 'chrome.exe')] : []),
    ];
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  return ['/usr/bin/microsoft-edge', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}

export function findBrowser(explicit) {
  if (explicit) return existsSync(explicit) ? explicit : null;
  return browserCandidates().find((p) => existsSync(p)) ?? null;
}

class Connection {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'));
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p.resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
      }
    });
    ws.addEventListener('close', () => {
      for (const p of this.pending.values()) p.reject(new Error(`${p.method}: connection closed`));
      this.pending.clear();
    });
  }

  static open(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new Connection(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error(`cannot open DevTools socket ${url}`)), { once: true });
    });
  }

  send(method, params = {}, timeoutMs = 30_000) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: no reply within ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already closed */
    }
  }
}

/**
 * Launch a private headless browser. Returns `{ browser, page, close }` where `browser` and `page`
 * are CDP connections. `close()` asks the browser to quit, then stops only that child process.
 */
export async function launch({ executable, headless = true, log = () => {} }) {
  const profile = mkdtempSync(join(tmpdir(), 'sgl-smoke-profile-'));
  const args = [
    ...(headless ? ['--headless=new'] : []),
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-features=msEdgeSidebarV2,EdgeCollections,Translate',
    '--hide-scrollbars=false',
    'about:blank',
  ];
  log(`launching ${executable}`);
  const child = spawn(executable, args, { stdio: 'ignore', windowsHide: true });
  let exited = false;
  child.on('exit', () => (exited = true));

  const portFile = join(profile, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 150 && port === null; i++) {
    if (exited) throw new Error('the browser exited during start-up');
    if (existsSync(portFile)) {
      const [p] = readFileSync(portFile, 'utf8').split(/\r?\n/);
      if (p && /^\d+$/.test(p)) port = Number(p);
    }
    if (port === null) await delay(100);
  }
  if (port === null) {
    child.kill();
    throw new Error('the browser did not open a DevTools port within 15 s');
  }
  const base = `http://127.0.0.1:${port}`;
  const version = await (await fetch(`${base}/json/version`)).json();
  const browser = await Connection.open(version.webSocketDebuggerUrl);
  const targets = await (await fetch(`${base}/json/list`)).json();
  let target = targets.find((t) => t.type === 'page');
  if (!target) target = await (await fetch(`${base}/json/new?about:blank`, { method: 'PUT' })).json();
  const page = await Connection.open(target.webSocketDebuggerUrl);

  const close = async () => {
    page.close();
    try {
      await browser.send('Browser.close', {}, 5_000);
    } catch {
      /* fall through to kill */
    }
    browser.close();
    for (let i = 0; i < 50 && !exited; i++) await delay(100);
    if (!exited) child.kill(); // only the process this script spawned
    for (let i = 0; i < 10; i++) {
      try {
        rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await delay(200);
      }
    }
  };
  return { browser, page, close, version: version.Browser };
}
