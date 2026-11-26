import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { activate, checkConformance, runAlgorithmV2, type ActiveToolkit } from '@app/extensions';
import { fakeGlobs } from '@app/extensions/test-fixtures';
import starterToolkit from '../../../docs/templates/toolkit/my-toolkit/toolkit';
import circulation from '../../../docs/templates/toolkit/my-toolkit/functions/circulation';
import room from '../../../docs/templates/toolkit/my-toolkit/functions/room';
import occupancyAround from '../../../docs/templates/toolkit/my-toolkit/algorithms/occupancy-around';
import occupancyFromArea from '../../../docs/templates/toolkit/my-toolkit/algorithms/occupancy-from-area';
import firstDesign from '../../../docs/templates/toolkit/my-toolkit/designs/first-design.json?raw';
import toolkitsGuide from '../../../docs/TOOLKITS.md?raw';
import kitPrompt from '../../../docs/ai-kit/toolkit/PROMPT.md?raw';
import { buildKit, kitFileName, STARTER_TOOLKIT_FILES, TOOLKIT_KIT_FILES } from './aiKits';
import { TOOLKIT_AGENT_PROMPT_GUIDE, TOOLKIT_BROWSER_PROMPT_GUIDE, TOOLKIT_CHAT_COMMANDS, TOOLKIT_CHAT_PROMPT_GUIDE } from './aiPrompt';
import { BROWSER_TUTORIAL_PAGE, ToolkitKitTabs, type ToolkitKitTabId } from './ToolkitKitTabs';
import { GUIDE_CONTENT } from './content';

/**
 * The toolkit kit (owner 2026-11-24): the starter `lab/docs/templates/toolkit/my-toolkit/` is a working
 * toolkit (activated exactly as the app activates a folder, every algorithm run as
 * `check:toolkit` runs it), the zip holds the kit, the starter and the reference toolkit (never a
 * façade file), and the prompts in the Guide are word for word those in lab/docs/TOOLKITS.md.
 */

const lf = (s: string) => s.replace(/\r\n/g, '\n');

/** Names and texts of a stored (uncompressed) zip, read from its central directory. */
function readStoredZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = new Map<string, string>();
  const text = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const localOffset = view.getUint32(at + 42, true);
    const name = text.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    out.set(name, text.decode(bytes.subarray(dataStart, dataStart + size)));
    at += 46 + nameLength;
  }
  return out;
}

/** The text between `<!-- marker -->` + a code fence and the closing fence in lab/docs/TOOLKITS.md. */
function fenced(marker: string): string {
  const m = new RegExp(`<!-- ${marker} -->\\n\`\`\`\\n([\\s\\S]*?)\\n\`\`\``).exec(lf(toolkitsGuide));
  if (!m) throw new Error(`lab/docs/TOOLKITS.md has no block <!-- ${marker} -->`);
  return m[1]!;
}

async function starter(): Promise<ActiveToolkit> {
  const { activation } = await activate(
    fakeGlobs({
      'toolkits/my-toolkit/toolkit.ts': { default: starterToolkit },
      'toolkits/my-toolkit/functions/circulation.ts': { default: circulation },
      'toolkits/my-toolkit/functions/room.ts': { default: room },
      'toolkits/my-toolkit/algorithms/occupancy-around.ts': { default: occupancyAround },
      'toolkits/my-toolkit/algorithms/occupancy-from-area.ts': { default: occupancyFromArea },
      'toolkits/my-toolkit/designs/first-design.json': firstDesign,
    }),
    { query: 'my-toolkit' },
  );
  if (activation.status !== 'active') throw new Error(`starter did not activate: ${JSON.stringify(activation)}`);
  return activation.toolkit;
}

describe('starter toolkit (lab/docs/templates/toolkit/my-toolkit/)', () => {
  it('activates with no errors; its default design is valid and conforms', async () => {
    const toolkit = await starter();
    expect(toolkit.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message)).toEqual([]);
    expect(toolkit.definition.defaultDesign).toBe('first-design');
    const design = toolkit.designs.find((d) => d.id === 'first-design')!;
    expect(design.result.ok).toBe(true);
    if (!design.result.ok) return;
    expect(checkConformance(design.result.value, toolkit).filter((d) => d.severity !== 'info').map((d) => d.message)).toEqual([]);
  });

  it('every algorithm runs on the default design as check:toolkit runs it (analyses on the first node)', async () => {
    const toolkit = await starter();
    const design = toolkit.designs.find((d) => d.id === 'first-design')!;
    if (!design.result.ok) throw new Error('invalid design');
    const doc = design.result.value;
    expect(toolkit.algorithms.map((a) => [a.id, a.status.ok])).toEqual([
      ['occupancy-around', true],
      ['occupancy-from-area', true],
    ]);
    const around = runAlgorithmV2(doc, toolkit, 'occupancy-around', undefined, { inputs: [doc.nodes[0]!.id] });
    expect(around.ok ? [] : around.issues.map((d) => d.message)).toEqual([]);
    // Circulation 1 (0) joined to Room 2 (2) and Room 3 (2): 4 people.
    if (around.ok && around.value.kind === 'analysis') expect(around.value.result.value).toBe(4);
    const fromArea = runAlgorithmV2(doc, toolkit, 'occupancy-from-area');
    expect(fromArea.ok ? [] : fromArea.issues.map((d) => d.message)).toEqual([]);
  });
});

describe('toolkit kit zip', () => {
  it('holds the kit files, the starter and the reference toolkit, without façade files', async () => {
    const kit = await buildKit('toolkit');
    expect(kit.fileName).toBe('spatial-graph-lab-toolkit-kit.zip');
    expect(kitFileName('toolkit')).toBe(kit.fileName);
    const files = readStoredZip(kit.bytes);
    const names = [...files.keys()].map((n) => n.replace(/^spatial-graph-lab-toolkit-kit\//, ''));
    expect([...files.keys()].every((n) => n.startsWith('spatial-graph-lab-toolkit-kit/'))).toBe(true);
    for (const f of TOOLKIT_KIT_FILES) expect(names).toContain(f.path);
    for (const f of STARTER_TOOLKIT_FILES) expect(names).toContain(`starter/my-toolkit/${f.path}`);
    for (const f of ['examples/house/toolkit.ts', 'examples/house/README.md', 'examples/house/functions/kitchen.ts', 'examples/house/algorithms/grow-to-target-area.ts', 'examples/house/designs/simple-house.json']) {
      expect(names).toContain(f);
    }
    expect(names.some((n) => /\.3dm(bak)?$/.test(n) || n.endsWith('.test.ts'))).toBe(false);
    for (const [name, text] of files) expect(text.length, name).toBeGreaterThan(0);
  });

  it('PROMPT.md names every kit path it tells the assistant to read', () => {
    for (const path of ['TOOLKITS.md', 'STUDENT-API.md', 'starter/my-toolkit/', 'examples/house/']) expect(kitPrompt).toContain(`\`${path}\``);
    for (const path of ['lab/docs/TOOLKITS.md', 'lab/docs/STUDENT-API.md', 'lab/docs/templates/toolkit/my-toolkit/', 'toolkits/house/']) expect(kitPrompt).toContain(`\`${path}\``);
  });
});

describe('Guide › Make your own toolkit', () => {
  it('is a Toolkits & JSON entry that shows the toolkit kit tabs', () => {
    const tab = GUIDE_CONTENT.find((t) => t.tab === 'toolkits')!;
    const entry = tab.blocks.find((b) => b.id === 'make-a-toolkit');
    expect(entry?.toolkitKit).toBe(true);
  });

  it('copies the same prompts and commands as lab/docs/TOOLKITS.md, word for word', () => {
    expect(TOOLKIT_AGENT_PROMPT_GUIDE.text).toBe(fenced('prompt:agent'));
    expect(TOOLKIT_CHAT_PROMPT_GUIDE.text).toBe(fenced('prompt:chat'));
    expect(TOOLKIT_CHAT_COMMANDS).toBe(fenced('commands:chat'));
    expect(TOOLKIT_BROWSER_PROMPT_GUIDE.text).toBe(fenced('prompt:browser'));
  });

  const render = (tab: ToolkitKitTabId) => renderToStaticMarkup(createElement(ToolkitKitTabs, { initialTab: tab }));

  it('has three tabs: Coding agent, Chat assistant, Upload in the app (2026-11-26)', () => {
    const html = render('agent');
    expect([...html.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1])).toEqual(['Coding agent', 'Chat assistant', 'Upload in the app']);
    expect(html).toContain('data-toolkit-kit-tab="agent"');
    expect(render('chat')).toContain('data-toolkit-commands=""');
  });

  it('Upload in the app: the toolkit kit, the browser prompt (one zip), then Upload toolkit (.zip) on the Welcome screen or in Project; no git', () => {
    const html = render('upload');
    expect(html).toContain('data-toolkit-kit-tab="upload"');
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Upload in the app</);
    expect(html).toContain('data-download="spatial-graph-lab-toolkit-kit.zip"');
    const text = html.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    expect(text).toContain(TOOLKIT_BROWSER_PROMPT_GUIDE.text);
    const steps = /data-toolkit-upload-steps="">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
    for (const words of ['Upload toolkit (.zip)', 'Welcome screen', 'Project › Toolkit', 'Project › Export project', 'Download toolkit (.zip)']) expect(steps).toContain(words);
    expect(html).toContain(`href="${BROWSER_TUTORIAL_PAGE}"`);
    expect(BROWSER_TUTORIAL_PAGE).toBe('/tutorial/06-toolkit-in-the-browser.html');
    expect(html).not.toContain('data-toolkit-commands');
    expect(text).not.toMatch(/git (switch|push|commit)/);
  });

  it('never tells a student to push main', () => {
    for (const text of [TOOLKIT_AGENT_PROMPT_GUIDE.text, TOOLKIT_CHAT_PROMPT_GUIDE.text, TOOLKIT_BROWSER_PROMPT_GUIDE.text, TOOLKIT_CHAT_COMMANDS, toolkitsGuide, kitPrompt]) {
      // The command itself (up to a closing backtick or the line end) never names main.
      expect(text).not.toMatch(/git push[^`\n]*\bmain\b/);
    }
  });
});
