import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SourceTag } from '@app/ui/SourceTag';
import { analysisItems, designNeeds, designTag } from './analyseModel';
import { uploadEntries, type LoadedUpload } from './uploads';

/**
 * Design analyses in the Analyse tab (owner 2026-11-20): tagged "Any project" or "This project"
 * (what they use, in the tag's title), and disabled with the plain reason where the open project
 * lacks a Function or field they use. Graph analyses get no such tag.
 */

const stored = (id: string) => ({ id, fileName: `${id}.ts`, source: '', addedAt: '2026-11-20T00:00:00.000Z' });

describe('design analyses in Analyse', () => {
  it('describe what they need in plain words, and tag themselves by it', () => {
    expect(designNeeds(undefined)).toEqual({ needs: [] });
    const needs = designNeeds({ functions: ['bedroom'], nodeFields: ['targetArea'], edgeFields: ['width'] });
    expect(needs.needs).toEqual(['Function “bedroom”', 'node field “targetArea”', 'edge field “width”']);
    expect(designTag({ needs: [] })).toEqual({ text: 'Any project', title: 'Reads the nodes (Function, size, position, calculated values). Works in any project.' });
    expect(designTag(needs)).toEqual({
      text: 'This project',
      title: 'Reads the nodes and uses Function “bedroom”, node field “targetArea”, edge field “width”. Works only in projects that have them.',
    });
    expect(renderToStaticMarkup(createElement(SourceTag, designTag(needs)))).toContain('>This project</span>');
  });

  it('an uploaded design analysis is disabled with the reason where the project lacks what it uses; a graph analysis is untouched', () => {
    const loaded: LoadedUpload[] = [
      { stored: stored('g'), status: { ok: true, code: '', definition: { scope: 'graph', id: 'g', label: 'Graph one', inputs: [] } } },
      { stored: stored('d'), status: { ok: true, code: '', definition: { scope: 'design', id: 'd', label: 'Design one', inputs: [], uses: { functions: ['cafe'] } } } },
      { stored: stored('a'), status: { ok: true, code: '', definition: { scope: 'design', id: 'a', label: 'Anywhere', inputs: [{ kind: 'node', label: 'Room' }] } } },
    ];
    const missing = (uses: { functions?: readonly string[] } | undefined) => ((uses?.functions ?? []).includes('cafe') ? ['Needs the Function “cafe”, which this project does not have.'] : []);
    const entries = uploadEntries(loaded, missing);
    expect(entries.map((e) => [e.label, e.enabled, e.problems, e.design])).toEqual([
      ['Graph one', true, [], undefined],
      ['Design one', false, ['Needs the Function “cafe”, which this project does not have.'], { needs: ['Function “cafe”'] }],
      ['Anywhere', true, [], { needs: [] }],
    ]);
    // The design needs reach the listed items (Network for no inputs, Node for one room).
    const items = analysisItems([], null, entries);
    expect(items.map((i) => [i.name, i.section, i.design?.needs.length ?? null])).toEqual([
      ['Graph one', 'network', null],
      ['Design one', 'network', 1],
      ['Anywhere', 'node', 0],
    ]);
  });
});
