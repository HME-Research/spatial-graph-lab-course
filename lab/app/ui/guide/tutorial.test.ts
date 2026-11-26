import { describe, expect, it } from 'vitest';
import { buildKit, kitFileName, type KitKind } from './aiKits';
import {
  DESIGN_PROMPT_GUIDE,
  GRAPH_PROMPT_GUIDE,
  PROJECT_PROMPT_GUIDE,
  TOOLKIT_AGENT_PROMPT_GUIDE,
  TOOLKIT_BROWSER_PROMPT_GUIDE,
  TOOLKIT_CHAT_COMMANDS,
  TOOLKIT_CHAT_PROMPT_GUIDE,
  TRANSFORM_PROJECT_PROMPT_GUIDE,
  TRANSFORM_PROMPT_GUIDE,
} from './aiPrompt';
import { TUTORIAL_URL, tutorialPage } from './links';

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

/**
 * The pages in reading order (owner 2026-11-26, revision 3: numbered names, so a folder listing
 * shows that order). 01 Start, then three parts: In the browser (02–06), On your computer (07–14),
 * Help (15–16). Page 06 (2026-11-26, toolkit upload) is Exercise 2 in the browser: no Git, the toolkit
 * uploaded in the app as a zip; the pages after it moved up by one.
 */
const PAGES = [
  '01-start-here',
  '02-about-the-app',
  '03-use-the-app',
  '04-your-own-analysis',
  '05-your-own-transform',
  '06-toolkit-in-the-browser',
  '07-about-the-repository',
  '08-install-the-tools',
  '09-clone-the-repository',
  '10-make-your-branch',
  '11-toolkit-with-a-coding-agent',
  '12-toolkit-with-a-chat-assistant',
  '13-hand-in',
  '14-keep-working-and-update',
  '15-git-basics',
  '16-help',
].map((p) => `${p}.html`);
const PARTS: readonly (readonly [string, readonly string[]])[] = [
  ['Start', PAGES.slice(0, 1)],
  ['In the browser', PAGES.slice(1, 6)],
  ['On your computer', PAGES.slice(6, 14)],
  ['Help', PAGES.slice(14)],
];

const read = (name: string): string => fs.readFileSync(new URL(name, TUTORIAL), 'utf8').replace(/\r\n/g, '\n');
const unescape = (html: string): string =>
  html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
/** A page without the app's own prompt and command blocks (they are checked word for word elsewhere). */
const withoutBlocks = (html: string): string => html.replace(/<pre\b[^>]*data-block="[^"]+"[^>]*>[\s\S]*?<\/pre>/g, '');

/** Every `id="…"` of a page. */
const ids = (html: string): Set<string> => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));

/** Every `<pre data-block="name">text</pre>` of a page. */
function blocks(html: string): { readonly name: string; readonly raw: string }[] {
  return [...html.matchAll(/<pre\b[^>]*\bdata-block="([^"]+)"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => ({ name: m[1]!, raw: m[2]! }));
}

const EXPECTED_BLOCKS: Readonly<Record<string, string>> = {
  'prompt:agent': TOOLKIT_AGENT_PROMPT_GUIDE.text,
  'prompt:chat': TOOLKIT_CHAT_PROMPT_GUIDE.text,
  'prompt:browser': TOOLKIT_BROWSER_PROMPT_GUIDE.text,
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

      it('groups the pages under the three parts, whose names are headings, not links (owner 2026-11-26)', () => {
        const nav = /<nav class="site"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? '';
        const groups = [...nav.matchAll(/<div class="nav-group"><p class="nav-part">([^<]+)<\/p><div class="nav-links">([\s\S]*?)<\/div><\/div>/g)];
        expect(groups.map((g) => [g[1], [...g[2]!.matchAll(/href="([^"]+)"/g)].map((m) => m[1])])).toEqual(PARTS.map(([name, pages]) => [name, pages]));
        const part = PARTS.find(([, pages]) => pages.includes(page))!;
        if (part[0] === 'Start') {
          expect(html).not.toContain('class="part-nav"');
        } else {
          const side = /<nav class="part-nav"[^>]*><p class="part-title">([^<]+)<\/p><ol>([\s\S]*?)<\/ol><\/nav>/.exec(html);
          expect(side?.[1]).toBe(part[0]);
          expect([...side![2]!.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(part[1]);
        }
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
    expect(fs.existsSync(new URL(`../../../..${tutorialPage('05-your-own-transform')}`, import.meta.url))).toBe(true);
    expect(fs.existsSync(new URL(`../../../..${tutorialPage('06-toolkit-in-the-browser')}`, import.meta.url))).toBe(true);
  });

  it('are light mode only, and never tell students to change the PowerShell execution policy (owner 2026-11-26)', () => {
    expect(read('style.css')).not.toMatch(/prefers-color-scheme/);
    for (const file of fs.readdirSync(TUTORIAL).filter((f) => /.(html|css|js)$/.test(f))) {
      expect(read(file), file).not.toMatch(/Set-ExecutionPolicy/i);
    }
  });

  it('use the words of revision 3: your toolkit name, npm ci, no claim, no session, no library example (owner 2026-11-26)', () => {
    const files = [...fs.readdirSync(TUTORIAL).filter((f) => /\.(html|js)$/.test(f)), ...fs.readdirSync(new URL('img/', TUTORIAL)).filter((f) => f.endsWith('.svg')).map((f) => `img/${f}`)];
    for (const file of files) {
      const text = unescape(read(file));
      for (const banned of [/toolkit[ -]id/i, /\bclaim/i, /npm install/, /Session 2/i, /\bstacks\b/i, /\b(3|three) lines\b/i, /Tell Git who you are/i, /hk-small-library/, /Five ideas/]) {
        expect(text, `${file}: ${banned}`).not.toMatch(banned);
      }
    }
    for (const page of PAGES) {
      const text = unescape(read(page));
      for (const m of text.matchAll(/u\d{3}-[a-z]+-[a-z0-9-]+/g)) expect(m[0], page).toMatch(/^u123-hk-house/);
    }
  });

  it('have the name builder only on pages 06 (browser route) and 10 (repository route), and no "not set" chip anywhere (owner 2026-11-26)', () => {
    const NAMER_PAGES = ['06-toolkit-in-the-browser.html', '10-make-your-branch.html'];
    for (const page of PAGES) {
      const html = read(page);
      expect(html.includes('data-namer'), page).toBe(NAMER_PAGES.includes(page));
      expect(html, page).not.toContain('data-chip');
    }
    // The same form on both pages: one script (tutorial.js) and one stored value, so a name made on one page fills the other.
    // (Only what is shown under the fields differs: folder and branch on page 10, folder and zip on page 06.)
    const namer = (page: string) => /<div class="namer" data-namer>([\s\S]*?)<dl class="namer-out">/.exec(read(page))?.[1] ?? '';
    expect(namer(NAMER_PAGES[0]!)).toContain('data-namer-number');
    expect(namer(NAMER_PAGES[0]!)).toBe(namer(NAMER_PAGES[1]!));
    for (const page of NAMER_PAGES) {
      const plan = read(page);
      for (const attr of ['data-namer-number', 'data-namer-initials', 'data-namer-name', 'class="namer-prefix" aria-hidden="true">U<', 'u123-hk-house']) expect(plan, page).toContain(attr);
    }
    const js = read('tutorial.js');
    // Digits only; only the last 3 are kept.
    expect(js).toMatch(/replace\(\/\\D\/g, ''\)/);
    expect(js).toContain('slice(-3)');
    expect(js).toContain("'u' + d + '-' + a + '-' + b");
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

  it('make the branch and send it to GitHub in one place only: page 10 (owner 2026-11-26)', () => {
    const plan = read('10-make-your-branch.html');
    const order = [
      'git status',
      'git pull',
      'git switch -c toolkit/&lt;your-toolkit-name&gt;',
      'git commit --allow-empty -m "chore(&lt;your-toolkit-name&gt;): start my toolkit"',
      'git push -u origin toolkit/&lt;your-toolkit-name&gt;',
    ];
    let at = plan.indexOf('id="branch"');
    expect(at).toBeGreaterThan(0);
    for (const cmd of order) {
      const next = Math.max(plan.indexOf(`<pre data-fill>${cmd}</pre>`, at), plan.indexOf(`<pre>${cmd}</pre>`, at));
      expect(next, cmd).toBeGreaterThan(at);
      at = next;
    }
    expect(plan).toContain('* [new branch]');
    expect(plan).toContain('This puts your branch on GitHub.');
    // The "taken" case is folded troubleshooting.
    expect(plan).toMatch(/<details class="issue" id="taken"><summary>“rejected” or “Everything up-to-date”/);
    expect(plan).toContain('Never pull it.');
    // The app's own command list (commands:chat, a folded reference on page 11) is the one exception.
    for (const page of PAGES.filter((p) => p !== '10-make-your-branch.html')) {
      expect(withoutBlocks(read(page)), page).not.toContain('git commit --allow-empty');
      // Help › "I committed on main" rescues commits made on main into a new branch: the only other `switch -c`.
      const text = page === '16-help.html' ? read(page).replace(/<details class="issue" id="h-committed-main">[\s\S]*?<\/div><\/details>/, '') : read(page);
      expect(withoutBlocks(text), page).not.toContain('git switch -c toolkit/');
    }
  });

  it('merge without opening an editor, and get the course updates on the own branch (owner 2026-11-26)', () => {
    for (const page of PAGES) {
      const text = unescape(withoutBlocks(read(page)));
      expect(text, page).not.toMatch(/git merge (?!--no-edit|--abort)/);
      expect(text, page).not.toMatch(/git pull --no-rebase(?! --no-edit)/);
      if (!['10-make-your-branch.html', '16-help.html'].includes(page)) expect(text, page).not.toContain('git switch main');
    }
    for (const page of ['15-git-basics.html', '14-keep-working-and-update.html']) expect(read(page)).toContain('git pull --no-rebase --no-edit origin main');
  });

  it('judge the toolkit check by its PASSED line, never by "Tests N passed" (owner 2026-11-26)', () => {
    for (const page of PAGES) expect(read(page), page).not.toMatch(/Tests N passed|N more than 0/);
    for (const page of ['11-toolkit-with-a-coding-agent', '12-toolkit-with-a-chat-assistant', '13-hand-in', '14-keep-working-and-update']) {
      expect(read(`${page}.html`), page).toMatch(/PASSED: toolkit "/);
    }
  });

  it('fold every step and section, closed at first, with Expand / Collapse all and ticks in the title row (owner 2026-11-26)', () => {
    for (const page of PAGES) {
      const html = read(page);
      expect(html, page).not.toMatch(/<section class="(card|part)/);
      expect([...html.matchAll(/<details class="(?:card|part)[^"]*" id="[^"]+">\n<summary/g)].length, page).toBeGreaterThan(0);
      // Collapsed by default: no step or section is open in the HTML.
      expect(html, page).not.toMatch(/<details class="[^"]*\bfold\b[^"]*"[^>]*\sopen\b/);
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
    // What a student opens stays open: remembered per page, every storage access guarded.
    expect(js).toContain("'sgl-tutorial-opened-' + page");
    expect(js).toMatch(/function getJson[\s\S]*?try \{[\s\S]*?catch/);
    expect(js).toMatch(/function putJson[\s\S]*?try \{[\s\S]*?catch/);
    for (const line of js.split('\n').filter((l) => l.includes('localStorage.'))) expect(line).toContain('try {');
  });

  it('keep the must-know warnings inside the step, outside folded details', () => {
    const visible = (html: string) => html.replace(/<details class="(?:more|trouble|issue)[\s\S]*?<\/details>/g, '');
    const checks: [string, RegExp][] = [
      ['08-install-the-tools', /Use Command Prompt, not PowerShell/],
      ['09-clone-the-repository', /The terminal is busy while the app runs/],
      ['12-toolkit-with-a-chat-assistant', /Drag the folder that has <code>toolkit\.ts<\/code> directly inside it/],
      ['12-toolkit-with-a-chat-assistant', /only files in <code>toolkits\//],
      ['11-toolkit-with-a-coding-agent', /Say <b>no<\/b> if it wants to run <code>git push<\/code>/],
      ['03-use-the-app', /Export after every session/],
      ['02-about-the-app', /Export after every session/],
      ['07-about-the-repository', /Don't move, delete or commit them/],
      ['06-toolkit-in-the-browser', /Export after every session/],
    ];
    for (const [page, re] of checks) expect(visible(read(`${page}.html`)), page).toMatch(re);
  });

  it('start with what this is, the three ways in, and the contents (owner 2026-11-26)', () => {
    const html = read('01-start-here.html');
    expect(html).toContain('img/graph-to-building.svg');
    expect(html).toContain('What do you want to do?');
    for (const target of ['02-about-the-app.html', '07-about-the-repository.html', '16-help.html']) expect(html).toMatch(new RegExp(`<a class="goal[^"]*" href="${target}"`));
    expect(html).toContain('Exercise 2 has two routes.');
    expect(html).toContain('id="contents"');
  });

  it('say where the app and the repository are, and that Exercise 2 is the toolkit (owner 2026-11-26)', () => {
    expect(read('02-about-the-app.html')).toContain('https://spatial-graph-lab.vercel.app/');
    const repo = read('07-about-the-repository.html');
    for (const words of ['https://github.com/HME-Research/spatial-graph-lab-course', 'node_modules/', 'dist/', 'Exercise 2', 'id="designs"', 'toolkits/house/']) expect(repo).toContain(words);
    expect(read('10-make-your-branch.html')).toContain('Exercise 2');
    expect(read('05-your-own-transform.html')).toContain('Exercise 1');
  });

  it('Exercise 2 in the browser: kit, one prompt asking for one zip, upload, fix, try, keep, submit; no Git (owner 2026-11-26)', () => {
    const html = read('06-toolkit-in-the-browser.html');
    expect(html).toContain('<h1>Exercise 2 in the browser: your own toolkit</h1>');
    expect(blocks(html).map((b) => b.name)).toEqual(['prompt:browser']);
    expect(TOOLKIT_BROWSER_PROMPT_GUIDE.text).toContain('ask me your clarifying questions before you write any code');
    expect(TOOLKIT_BROWSER_PROMPT_GUIDE.text).toContain('give me ONE zip, <your-toolkit-name>.zip, with the folder <your-toolkit-name>/ inside it and toolkit.ts directly inside that folder');
    expect(TOOLKIT_BROWSER_PROMPT_GUIDE.text.startsWith('Rules: ')).toBe(true);
    // Shares the plan form (and so the stored plan) with page 10.
    expect(html).toContain('<form class="form" id="prompt-form" data-blanks');
    for (const words of [
      'href="kits/spatial-graph-lab-toolkit-kit.zip"',
      'img/app-welcome-upload-toolkit.svg',
      '<span class="ui">Upload toolkit (.zip)</span>',
      '<span class="ui">Project</span> › <span class="ui">Toolkit</span> › <span class="ui">Upload toolkit (.zip)</span>',
      '<span class="ui">Download toolkit (.zip)</span>',
      '<span class="ui">Remove uploaded toolkit</span>',
      '<span class="ui">Export project</span>',
      '<span class="ui">Open example…</span>',
      '(uploaded)',
      'href="13-hand-in.html#zip"',
    ]) {
      expect(html).toContain(words);
    }
    expect(unescape(withoutBlocks(html))).not.toMatch(/\bgit (status|pull|push|commit|switch|add)\b|npm (ci|run)/);
    // The landing pages, the start page, the chat route and Submit your work all know the browser route.
    for (const page of ['01-start-here', '02-about-the-app', '07-about-the-repository', '12-toolkit-with-a-chat-assistant', '13-hand-in']) {
      expect(withoutBlocks(read(`${page}.html`)).replace(/<nav[\s\S]*?<\/nav>|<div class="pager">[\s\S]*?<\/div>/g, ''), page).toContain('href="06-toolkit-in-the-browser.html');
    }
    expect(read('12-toolkit-with-a-chat-assistant.html')).toMatch(/<details class="more"><summary>Try the zip in the app first\?[\s\S]*?Upload toolkit \(\.zip\)/);
    expect(read('13-hand-in.html')).toContain('<span class="ui">Download toolkit (.zip)</span>');
  });

  it('clone into source/repos, in VS Code or the terminal, then npm ci (owner 2026-11-26)', () => {
    const html = read('09-clone-the-repository.html');
    for (const words of ['img/gh-code-button.svg', 'source', 'repos', 'Clone Repository', '<pre>git clone https://github.com/HME-Research/spatial-graph-lab-course.git</pre>', '<pre>npm ci</pre>', '<pre>npm run dev</pre>', 'File › Open Folder…']) {
      expect(html).toContain(words);
    }
    expect(html).not.toMatch(/Download ZIP|\.zip/i);
  });

  it('hand in: the branch or a zip of the folder, with a placeholder for where and when (owner 2026-11-26)', () => {
    const html = read('13-hand-in.html');
    expect(html).toContain('Your tutor will tell you:');
    expect(html).toContain('Compress to ZIP file');
    expect(html).toContain('Compressed (zipped) folder');
    expect(html).toMatch(/Compress "/);
    expect(html).not.toContain('No pull request is needed');
    for (const page of ['06-toolkit-in-the-browser', '07-about-the-repository', '10-make-your-branch', '13-hand-in']) expect(read(`${page}.html`), page).toMatch(/no full student number, passwords or keys/i);
  });

  it('keep the git identity out of the main path: a folded Help entry with two fields, linked from the commit steps (owner 2026-11-26)', () => {
    const help = read('16-help.html');
    const entry = /<details class="issue" id="h-identity">[\s\S]*?<\/div><\/details>/.exec(help)?.[0] ?? '';
    expect(entry).toContain('Please tell me who you are');
    expect(entry).toContain('data-var="your-github-username"');
    expect(entry).toContain('data-var="your-no-reply-email"');
    expect(entry).toContain('<pre data-fill>git config --global user.name "&lt;your-github-username&gt;"</pre>');
    expect(entry).toContain('<pre data-fill>git config --global user.email "&lt;your-no-reply-email&gt;"</pre>');
    for (const page of PAGES.filter((p) => p !== '16-help.html')) expect(read(page), page).not.toContain('git config --global');
    for (const page of ['10-make-your-branch', '12-toolkit-with-a-chat-assistant']) expect(read(`${page}.html`), page).toContain('href="16-help.html#h-identity"');
    expect(read('08-install-the-tools.html')).toContain('Sign in with GitHub');
    expect(read('tutorial.js')).toContain('users\\.noreply\\.github\\.com');
  });

  it('install page: accounts and installs only, with the five steps of the checklist', () => {
    const html = read('08-install-the-tools.html');
    for (const title of [
      'Create or check your GitHub account',
      'Install Visual Studio Code',
      'Install Git',
      'Install Node.js (LTS)',
      'Register for an AI coding agent',
    ]) {
      expect(html).toContain(`<h2>${title}</h2>`);
    }
    expect(html).not.toContain('git clone');
    expect(html).not.toContain('npm ci');
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
