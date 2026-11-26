import { describe, expect, it } from 'vitest';
import { buildKit, kitFileName, type KitKind } from './aiKits';
import {
  DESIGN_PROMPT_GUIDE,
  GRAPH_PROMPT_GUIDE,
  PROJECT_PROMPT_GUIDE,
  TOOLKIT_AGENT_PROMPT_GUIDE,
  TOOLKIT_CHAT_COMMANDS,
  TOOLKIT_CHAT_PROMPT_GUIDE,
  TRANSFORM_PROJECT_PROMPT_GUIDE,
  TRANSFORM_PROMPT_GUIDE,
} from './aiPrompt';
import { TUTORIAL_URL } from './links';

/**
 * The student tutorial (`tutorial/` at the repository root, owner 2026-11-25): plain HTML pages
 * that open by double-click and are also served by the app at `/tutorial/` (vite.config.ts).
 *
 * - Every prompt and command block (`<pre data-block="…">`) is word for word the app's own text
 *   (aiPrompt.ts), so the tutorial, the Guide and lab/docs/TOOLKITS.md never drift apart.
 * - Every relative link and file exists, and every page has the same navigation.
 * - The kits in `tutorial/kits/` are byte for byte what the app builds when a kit is downloaded.
 *   They are rewritten only with the explicit opt-in
 *     SGL_UPDATE_TUTORIAL_KITS=1 npx vitest --run lab/app/ui/guide/tutorial.test.ts
 */

interface NodeFs {
  readFileSync(path: URL): Uint8Array;
  readFileSync(path: URL, encoding: 'utf8'): string;
  writeFileSync(path: URL, data: Uint8Array): void;
  existsSync(path: URL): boolean;
  readdirSync(path: URL): string[];
}
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): NodeFs } }).process.getBuiltinModule('node:fs');
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const UPDATE_KITS = env['SGL_UPDATE_TUTORIAL_KITS'] === '1';

const TUTORIAL = new URL('../../../../tutorial/', import.meta.url);

/** The pages in reading order (owner 2026-11-26: numbered names, so a folder listing shows that order). */
const PAGES = [
  '01-start-here',
  '02-use-the-app',
  '03-your-own-analysis',
  '04-your-own-transform',
  '05-set-up-your-computer',
  '06-plan-your-toolkit',
  '07-toolkit-with-a-coding-agent',
  '08-toolkit-with-a-chat-assistant',
  '09-git-basics',
  '10-hand-in',
  '11-keep-working-and-update',
  '12-help',
].map((p) => `${p}.html`);

const read = (name: string): string => fs.readFileSync(new URL(name, TUTORIAL), 'utf8').replace(/\r\n/g, '\n');
const unescape = (html: string): string =>
  html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Every `id="…"` of a page. */
const ids = (html: string): Set<string> => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));

/** Every `<pre data-block="name">text</pre>` of a page. */
function blocks(html: string): { readonly name: string; readonly raw: string }[] {
  return [...html.matchAll(/<pre\b[^>]*\bdata-block="([^"]+)"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => ({ name: m[1]!, raw: m[2]! }));
}

const EXPECTED_BLOCKS: Readonly<Record<string, string>> = {
  'prompt:agent': TOOLKIT_AGENT_PROMPT_GUIDE.text,
  'prompt:chat': TOOLKIT_CHAT_PROMPT_GUIDE.text,
  'commands:chat': TOOLKIT_CHAT_COMMANDS,
  'prompt:graph': GRAPH_PROMPT_GUIDE.text,
  'prompt:design': DESIGN_PROMPT_GUIDE.text,
  'prompt:project': PROJECT_PROMPT_GUIDE.text,
  'prompt:transform': TRANSFORM_PROMPT_GUIDE.text,
  'prompt:transform-project': TRANSFORM_PROJECT_PROMPT_GUIDE.text,
};

describe('tutorial pages', () => {
  it('are exactly the pages of the navigation, and sort by name in reading order (no page missing, none unlisted)', () => {
    const html = fs
      .readdirSync(TUTORIAL)
      .filter((f) => f.endsWith('.html'))
      .sort();
    expect(html).toEqual(PAGES);
  });

  for (const page of PAGES) {
    describe(page, () => {
      const html = read(page);

      it('has a title, the shared stylesheet and script, and the full navigation with itself as current', () => {
        expect(html).toMatch(/<title>[^<]+ · Spatial Graph Lab tutorial<\/title>/);
        expect(html).toContain('<link rel="stylesheet" href="style.css">');
        expect(html).toContain('<script src="tutorial.js"></script>');
        const nav = /<nav class="site"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? '';
        expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(PAGES);
        expect([...nav.matchAll(/<a href="([^"]+)" aria-current="page">/g)].map((m) => m[1])).toEqual([page]);
      });

      it('links only to files that exist', () => {
        const missing = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)]
          .map((m) => m[1]!)
          .filter((target) => !/^(https?:|mailto:|#)/.test(target))
          .map((target) => target.split('#')[0]!)
          .filter((target) => !fs.existsSync(new URL(target, TUTORIAL)));
        expect(missing).toEqual([]);
      });

      it('links only to anchors that exist, on this page and on the other pages', () => {
        const missing = [...html.matchAll(/\bhref="([^"]*#[^"]+)"/g)]
          .map((m) => m[1]!)
          .filter((target) => !/^(https?:|mailto:)/.test(target))
          .filter((target) => {
            const [file, id] = target.split('#') as [string, string];
            return !ids(file === '' ? html : read(file)).has(id);
          });
        expect(missing).toEqual([]);
      });

      it('has the side menu "On this page", linking to sections of this page', () => {
        const toc = /<nav class="toc" aria-label="On this page">([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? '';
        expect(toc).toContain('On this page');
        const links = [...toc.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!);
        expect(links.length).toBeGreaterThan(0);
        expect(links.filter((id) => !ids(html).has(id))).toEqual([]);
      });

      it('copies every prompt and command block word for word from the app', () => {
        for (const block of blocks(html)) {
          expect(Object.keys(EXPECTED_BLOCKS), `unknown block ${block.name}`).toContain(block.name);
          expect(block.raw, `${block.name} holds markup`).not.toMatch(/<[a-z/]/i);
          expect(unescape(block.raw), `${page} ${block.name}`).toBe(EXPECTED_BLOCKS[block.name]);
        }
      });
    });
  }

  it('are where the app links to them (Welcome, Guide › Make your own toolkit)', () => {
    expect(TUTORIAL_URL).toBe('/tutorial/01-start-here.html');
    expect(fs.existsSync(new URL(`../../../..${TUTORIAL_URL}`, import.meta.url))).toBe(true);
  });

  it('are light mode only, and never tell students to change the PowerShell execution policy (owner 2026-11-26)', () => {
    expect(read('style.css')).not.toMatch(/prefers-color-scheme/);
    for (const file of fs.readdirSync(TUTORIAL).filter((f) => /.(html|css|js)$/.test(f))) {
      expect(read(file), file).not.toMatch(/Set-ExecutionPolicy/i);
    }
  });

  it('have the full naming form only on page 6, and the one-line id chip where the id is used (owner 2026-11-26)', () => {
    for (const page of PAGES) {
      const hasForm = read(page).includes('data-namer-initials');
      expect(hasForm, page).toBe(page === '06-plan-your-toolkit.html');
    }
    const plan = read('06-plan-your-toolkit.html');
    for (const attr of ['data-namer', 'data-namer-initials', 'data-namer-name', 'hk-small-library']) expect(plan).toContain(attr);
    for (const page of ['07-toolkit-with-a-coding-agent', '08-toolkit-with-a-chat-assistant', '09-git-basics', '10-hand-in', '11-keep-working-and-update']) {
      const html = read(`${page}.html`);
      expect(html, page).toContain('data-chip');
      expect(html, page).toContain('data-chip-input');
      expect(html, page).toContain('href="06-plan-your-toolkit.html#your-id"');
    }
  });

  it('show pictures that exist, each with alt text (and a caption when it is a figure)', () => {
    for (const page of PAGES) {
      const html = read(page);
      for (const m of html.matchAll(/<img\b[^>]*>/g)) {
        const tag = m[0];
        const src = /\bsrc="([^"]+)"/.exec(tag)?.[1] ?? '';
        expect(src, `${page}: ${tag}`).toMatch(/^img\/[a-z0-9-]+\.(svg|webp|png)$/);
        expect(fs.existsSync(new URL(src, TUTORIAL)), `${page}: ${src}`).toBe(true);
        expect(/\balt="[^"]{10,}"/.test(tag), `${page}: ${src} needs alt text`).toBe(true);
      }
      for (const fig of html.matchAll(/<figure\b[\s\S]*?<\/figure>/g)) expect(fig[0], page).toContain('<figcaption>');
    }
  });

  it('put one command in each Copy box: several lines only in prompts and in marked reference lists', () => {
    for (const page of PAGES) {
      for (const m of read(page).matchAll(/<div class="code[^"]*">(?:<div class="label">[\s\S]*?<\/div>)?<pre\b([^>]*)>([\s\S]*?)<\/pre>/g)) {
        const attrs = m[1]!;
        const lines = unescape(m[2]!).split('\n');
        if (lines.length === 1) continue;
        const ok = /data-block="prompt:/.test(attrs) || /\bdata-ref\b/.test(attrs);
        expect(ok, `${page}: a multi-line Copy box: ${lines[0]}`).toBe(true);
      }
    }
  });

  it('claim the toolkit name with an empty commit, on page 6 only (owner 2026-11-26)', () => {
    const plan = read('06-plan-your-toolkit.html');
    const order = [
      'git status',
      'git pull',
      'git switch -c toolkit/&lt;toolkit-id&gt;',
      'git commit --allow-empty -m "chore(&lt;toolkit-id&gt;): claim the toolkit name"',
      'git push -u origin toolkit/&lt;toolkit-id&gt;',
    ];
    let at = plan.indexOf('id="claim"');
    expect(at).toBeGreaterThan(0);
    for (const cmd of order) {
      const next = Math.max(plan.indexOf(`<pre data-fill>${cmd}</pre>`, at), plan.indexOf(`<pre>${cmd}</pre>`, at));
      expect(next, cmd).toBeGreaterThan(at);
      at = next;
    }
    expect(plan).toContain('* [new branch]');
    expect(plan).toContain('Everything up-to-date');
    // The app's own command list (commands:chat, a folded reference on page 8) is the one exception.
    const withoutBlocks = (html: string) => html.replace(/<pre\b[^>]*data-block="[^"]+"[^>]*>[\s\S]*?<\/pre>/g, '');
    for (const page of PAGES.filter((p) => p !== '06-plan-your-toolkit.html')) expect(withoutBlocks(read(page)), page).not.toContain('git commit --allow-empty');
  });

  it('merge without opening an editor, and get the course updates on the own branch (owner 2026-11-26)', () => {
    for (const page of PAGES) {
      const text = unescape(read(page).replace(/<pre\b[^>]*data-block="[^"]+"[^>]*>[\s\S]*?<\/pre>/g, ''));
      expect(text, page).not.toMatch(/git merge (?!--no-edit|--abort)/);
      expect(text, page).not.toMatch(/git pull --no-rebase(?! --no-edit)/);
      if (!['06-plan-your-toolkit.html', '12-help.html'].includes(page)) expect(text, page).not.toContain('git switch main');
    }
    for (const page of ['09-git-basics.html', '11-keep-working-and-update.html']) expect(read(page)).toContain('git pull --no-rebase --no-edit origin main');
  });

  it('judge the toolkit check by its PASSED line, never by "Tests N passed" (owner 2026-11-26)', () => {
    for (const page of PAGES) expect(read(page), page).not.toMatch(/Tests N passed|N more than 0/);
    for (const page of ['07-toolkit-with-a-coding-agent', '08-toolkit-with-a-chat-assistant', '10-hand-in', '11-keep-working-and-update']) {
      expect(read(`${page}.html`), page).toMatch(/PASSED: toolkit "/);
    }
  });

  it('make every step card and main section foldable, with Expand / Collapse all, and ticks in the title row', () => {
    for (const page of PAGES) {
      const html = read(page);
      expect(html, page).not.toMatch(/<section class="(card|part)/);
      expect([...html.matchAll(/<details class="(?:card|part)[^"]*" id="[^"]+" open>\n<summary/g)].length, page).toBeGreaterThan(0);
      expect(html, page).toContain('data-fold="open"');
      expect(html, page).toContain('data-fold="close"');
      expect(html, page).toContain('data-fold-details');
      // A tick-box sits in its step's summary, so it stays usable when the step is folded.
      for (const m of html.matchAll(/<input type="checkbox" data-check="([^"]+)"[^>]*>/g)) {
        const before = html.slice(0, m.index);
        expect(before.lastIndexOf('<summary') > before.lastIndexOf('</summary>'), `${page}: ${m[1]}`).toBe(true);
        expect(m[0], page).toMatch(/aria-label="Done: /);
      }
    }
    const js = read('tutorial.js');
    expect(js).toContain("addEventListener('hashchange', openTarget)");
    expect(js).toMatch(/function openTarget\(\)[\s\S]*?d\.open = true/);
  });

  it('keep the must-never-hide items outside folded details', () => {
    const visible = (html: string) => html.replace(/<details class="(?:more|trouble|issue|before-details)[\s\S]*?<\/details>/g, '');
    const checks: [string, RegExp][] = [
      ['05-set-up-your-computer', /Use Command Prompt, not PowerShell/],
      ['05-set-up-your-computer', /Use your GitHub username and your GitHub no-reply e-mail/],
      ['05-set-up-your-computer', /The terminal is busy while the app runs/],
      ['08-toolkit-with-a-chat-assistant', /Drag the folder that has <code>toolkit\.ts<\/code> directly inside it/],
      ['08-toolkit-with-a-chat-assistant', /only files in <code>toolkits\//],
      ['06-plan-your-toolkit', /Never pull it/],
      ['02-use-the-app', /Export after every session/],
    ];
    for (const [page, re] of checks) expect(visible(read(`${page}.html`)), page).toMatch(re);
  });

  it('hand in: the branch or a zip of the folder, with a placeholder for where and when (owner 2026-11-26)', () => {
    const html = read('10-hand-in.html');
    expect(html).toContain('Your tutor will tell you:');
    expect(html).toContain('Compress to ZIP file');
    expect(html).toContain('Compressed (zipped) folder');
    expect(html).toMatch(/Compress "/);
    expect(html).not.toContain('No pull request is needed');
    for (const page of ['01-start-here', '05-set-up-your-computer', '10-hand-in']) expect(read(`${page}.html`), page).toMatch(/no student number, passwords or keys/i);
  });

  it('set the git identity from two fields: GitHub username and no-reply e-mail (owner 2026-11-26)', () => {
    const html = read('05-set-up-your-computer.html');
    expect(html).toContain('data-var="your-github-username"');
    expect(html).toContain('data-var="your-no-reply-email"');
    expect(html).toContain('<pre data-fill>git config --global user.name "&lt;your-github-username&gt;"</pre>');
    expect(html).toContain('<pre data-fill>git config --global user.email "&lt;your-no-reply-email&gt;"</pre>');
    expect(read('tutorial.js')).toContain('users\\.noreply\\.github\\.com');
  });

  it('set-up page contains the five steps of the Before Session 2 guide', () => {
    const html = read('05-set-up-your-computer.html');
    for (const title of [
      'Create or check your GitHub account',
      'Install Visual Studio Code',
      'Install Git',
      'Install Node.js (LTS)',
      'Register for an AI coding agent',
    ]) {
      expect(html).toContain(`<h2>${title}</h2>`);
    }
  });

  it('show every prompt and command block of the app somewhere', () => {
    const shown = new Set(PAGES.flatMap((p) => blocks(read(p)).map((b) => b.name)));
    expect([...shown].sort()).toEqual(Object.keys(EXPECTED_BLOCKS).sort());
  });
});

describe('tutorial kits (tutorial/kits/)', () => {
  const kinds: readonly KitKind[] = ['graph', 'design', 'toolkit', 'transform'];
  for (const kind of kinds) {
    it(`${kitFileName(kind)} is what the app builds`, async () => {
      const kit = await buildKit(kind);
      const file = new URL(`kits/${kit.fileName}`, TUTORIAL);
      if (UPDATE_KITS) fs.writeFileSync(file, kit.bytes);
      expect(fs.existsSync(file), `${kit.fileName} is missing (only SGL_UPDATE_TUTORIAL_KITS=1 may write it)`).toBe(true);
      const saved = fs.readFileSync(file);
      const same = saved.length === kit.bytes.length && saved.every((b, i) => b === kit.bytes[i]);
      expect(same, `${kit.fileName} is out of date: rerun with SGL_UPDATE_TUTORIAL_KITS=1`).toBe(true);
    });
  }
});
