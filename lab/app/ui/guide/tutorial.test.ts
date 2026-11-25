import { describe, expect, it } from 'vitest';
import { buildKit, kitFileName, type KitKind } from './aiKits';
import {
  DESIGN_PROMPT_GUIDE,
  GRAPH_PROMPT_GUIDE,
  PROJECT_PROMPT_GUIDE,
  TOOLKIT_AGENT_PROMPT_GUIDE,
  TOOLKIT_CHAT_COMMANDS,
  TOOLKIT_CHAT_PROMPT_GUIDE,
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

/** The pages in navigation order. */
const PAGES = ['index', 'setup', 'browser', 'analysis', 'plan', 'agent', 'chat', 'git', 'hand-in', 'update', 'help'].map((p) => `${p}.html`);

const read = (name: string): string => fs.readFileSync(new URL(name, TUTORIAL), 'utf8').replace(/\r\n/g, '\n');
const unescape = (html: string): string =>
  html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

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
};

describe('tutorial pages', () => {
  it('are exactly the pages of the navigation (no page missing, no page unlisted)', () => {
    const html = fs
      .readdirSync(TUTORIAL)
      .filter((f) => f.endsWith('.html'))
      .sort();
    expect(html).toEqual([...PAGES].sort());
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
    expect(TUTORIAL_URL).toBe('/tutorial/index.html');
    expect(fs.existsSync(new URL(`../../../..${TUTORIAL_URL}`, import.meta.url))).toBe(true);
  });

  it('show every prompt and command block of the app somewhere', () => {
    const shown = new Set(PAGES.flatMap((p) => blocks(read(p)).map((b) => b.name)));
    expect([...shown].sort()).toEqual(Object.keys(EXPECTED_BLOCKS).sort());
  });
});

describe('tutorial kits (tutorial/kits/)', () => {
  const kinds: readonly KitKind[] = ['graph', 'design', 'toolkit'];
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
