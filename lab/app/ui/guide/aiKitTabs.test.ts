import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AiKitTabs, BASICS_HELP, BASICS_LABEL, type AiKitTabId } from './AiKitTabs';
import type { ProjectSheetInput } from './aiKits';
import { DESIGN_PROMPT_GUIDE, GRAPH_PROMPT_GUIDE, PROJECT_PROMPT_GUIDE } from './aiPrompt';
import { AiKitProjectContext } from './projectKit';

/**
 * The AI kit tabs (owner 2026-11-20): a shared line, then Any project (Include room basics, on by
 * default, explained in visible text) · This project (its toolkit, or "No toolkit") · Template. The
 * download and the prompt guide follow the tab and the checkbox; every guide asks for "Input:".
 */

const PROJECT: ProjectSheetInput = {
  toolkit: { id: 'house', name: 'House' },
  functions: [{ id: 'bedroom', label: 'Bedroom', origin: 'toolkit' }],
  nodeFields: [{ key: 'targetArea', label: 'Target area', kind: 'number', origin: 'toolkit', functionDefaults: [] }],
  edgeFields: [],
  metrics: [],
  cell: { horizontal: 3, vertical: 3 },
};

const render = (tab: AiKitTabId, options: { basics?: boolean; project?: ProjectSheetInput | null } = {}) =>
  renderToStaticMarkup(
    createElement(
      AiKitProjectContext.Provider,
      { value: options.project === undefined ? PROJECT : options.project },
      createElement(AiKitTabs, { initialTab: tab, initialBasics: options.basics ?? true }),
    ),
  );

describe('AI kit tabs', () => {
  it('a shared line, then three tabs: Any project, This project, Template', () => {
    const html = render('any');
    expect(html).toContain('Start with the simplest tab that can answer your idea.');
    expect([...html.matchAll(/role="tab"[^>]*>([^<]+)<\/button>/g)].map((m) => m[1])).toEqual(['Any project', 'This project', 'Template']);
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Any project</);
  });

  it('Any project: room basics on by default, explained in visible text; the design kit and its prompt', () => {
    const html = render('any');
    expect(html).toContain(BASICS_LABEL);
    const box = (h: string) => /<input[^>]*data-room-basics=""[^>]*>/.exec(h)?.[0] ?? '';
    expect(box(html)).toContain('checked=""');
    expect(html).toContain(BASICS_HELP);
    expect(html).toContain('data-download="spatial-graph-lab-design-kit.zip"');
    expect(html).toContain('the Spatial Graph Lab design kit');
    expect(html).not.toContain('title="Room basics');
  });

  it('Any project without room basics: the graph kit and its prompt', () => {
    const html = render('any', { basics: false });
    expect(/<input[^>]*data-room-basics=""[^>]*>/.exec(html)?.[0]).not.toContain('checked');
    expect(html).toContain('data-download="spatial-graph-lab-graph-kit.zip"');
    expect(html).toContain('the Spatial Graph Lab graph kit');
  });

  it('This project: names its toolkit (or says there is none) and offers the generated kit', () => {
    const html = render('project');
    expect(html).toContain('<strong>Toolkit: House</strong> — 1 Function, 1 custom field');
    expect(html).toContain('data-download="spatial-graph-lab-design-kit-house.zip"');
    expect(html).toContain('The kit never contains your design.');
    expect(html).toContain('Read PROMPT.md, PROJECT.md and every file');
    const none = render('project', { project: { ...PROJECT, toolkit: null, functions: [], nodeFields: [] } });
    expect(none).toContain('<strong>No toolkit</strong> — 0 Functions, 0 custom fields');
    expect(none).toContain('This project has no toolkit');
    expect(none).toContain('data-download="spatial-graph-lab-design-kit-project.zip"');
    expect(render('project', { project: null })).toContain('Open or create a project to download its kit.');
  });

  it('Template: the graph and the design template', () => {
    const html = render('template');
    expect(html).toContain('data-download="graph-analysis-template.ts"');
    expect(html).toContain('data-download="design-analysis-template.ts"');
  });

  it('every prompt guide asks for the idea, the Input and the answer', () => {
    for (const guide of [GRAPH_PROMPT_GUIDE, DESIGN_PROMPT_GUIDE, PROJECT_PROMPT_GUIDE]) {
      expect(guide.parts.map((p) => p.label)).toEqual(['1. Ask', '2. Idea', '3. Input', '4. Answer']);
      for (const line of ['My idea: ___', 'Input: ___', 'Show the answer as: ___']) expect(guide.text).toContain(line);
      expect(guide.text).not.toContain('I will pick');
      expect(guide.text).toContain('Read PROMPT.md');
    }
    expect(PROJECT_PROMPT_GUIDE.text).toContain('PROJECT.md');
  });
});
