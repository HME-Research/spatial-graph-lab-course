import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { validateDocument, type DesignDocument } from '@app/document';
import type { ActiveProject } from '@app/extensions';
import { labDoc, labProject } from '@app/extensions/test-fixtures';
import type { InspectorProps } from '@app/views/contracts';
import { buildProjectViewContext } from '@app/views/project';
import { selectEdge, selectNode, NO_SELECTION, type Selection } from '@core/viewer/selection';
import { Inspector } from './Inspector';
import { corridorRaw, fakePort } from './test-fixtures';

const noop = () => ({ ok: true }) as const;

function render(props: Partial<InspectorProps> & { readonly doc: DesignDocument; readonly selection: Selection }): string {
  return renderToStaticMarkup(createElement(Inspector, { onSelect: () => {}, onCommand: noop, ...props }));
}

/** Option elements of the select labelled `label`. */
function selectOptions(html: string, label: string): string[] {
  const select = new RegExp(`<select[^>]*aria-label="${label}"[^>]*>(.*?)</select>`).exec(html)?.[1] ?? '';
  return [...select.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]!);
}

describe('Properties panel, schema v1 (today)', () => {
  let project: ActiveProject;
  let doc: DesignDocument;
  beforeAll(async () => {
    project = await labProject();
    doc = labDoc();
  });

  it('offers the project types in a real dropdown with the current one selected', () => {
    const node = doc.nodes[0]!;
    const html = render({ doc, selection: selectNode(node.id), project: buildProjectViewContext(project, doc) });
    expect(selectOptions(html, 'Room type')).toEqual(['Gallery (gallery)', 'Studio (studio)']);
    expect(html).toMatch(new RegExp(`<option value="${node.typeId}" selected=""`));
    expect(html).not.toContain('<datalist');
  });

  it('edits the position directly, without Apply or Move buttons', () => {
    const html = render({ doc, selection: selectNode(doc.nodes[0]!.id) });
    expect(html).toContain('aria-label="Position (cell) x"');
    expect(html).toContain('aria-label="Position (cell) z (storey)"');
    expect(html).not.toMatch(/>(Apply|Move|Set)<\/button>/);
    // The explanation is reachable from the fields (tooltip + accessible description).
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).toContain('Moving a node in Graph 2D only rearranges the diagram');
    // Size is a schema-v2 feature: hidden without the port.
    expect(html).not.toContain('Size (cells)');
  });

  it('keeps an unknown type visible with a warning', async () => {
    const legacy = expectOk(validateDocument({ ...structuredClone(doc), nodes: doc.nodes.map((n, i) => (i === 0 ? { ...n, typeId: 'legacy-thing' } : n)) }));
    const html = render({ doc: legacy, selection: selectNode(legacy.nodes[0]!.id), project: buildProjectViewContext(project, legacy) });
    expect(selectOptions(html, 'Room type')[0]).toBe('legacy-thing: not defined in this project');
    expect(html).toContain('does not define the type “legacy-thing”');
  });

  it('shows the relationship kind and a remove action with an undo hint', () => {
    const edge = doc.edges[0]!;
    const html = render({ doc, selection: selectEdge(edge.id) });
    expect(html).toContain(`Relationship ${edge.source} ↔ ${edge.target}`);
    expect(html).toContain('aria-label="Relationship kind"');
    expect(html).toContain('>Remove connection</button>');
    expect(html).toContain('Ctrl+Z');
  });

  it('never says Inspector or Architecture', () => {
    for (const selection of [NO_SELECTION, selectNode(doc.nodes[0]!.id), selectEdge(doc.edges[0]!.id)]) {
      const html = render({ doc, selection });
      expect(html).not.toMatch(/Inspector|Architecture/);
    }
  });
});

describe('Properties panel, schema v2 (with the design port)', () => {
  const v1 = () => labDoc();

  it('shows display labels, position and size', () => {
    const design = fakePort();
    const html = render({ doc: v1(), design, selection: selectNode('a') });
    expect(html).toContain('Room <span class="sgl-room-label">01</span>');
    expect(html).toContain('aria-label="Size (cells) x"');
    expect(html).toMatch(/aria-label="Size \(cells\) y"[^>]*value="3"|value="3"[^>]*aria-label="Size \(cells\) y"/);
    expect(html).toContain('Position (lowest corner)');
    expect(html).not.toMatch(/>(Apply|Move|Set)<\/button>/);
  });

  it('lists relationships with their spatial status and offers Connect', () => {
    const design = fakePort();
    const html = render({ doc: v1(), design, selection: selectNode('a') });
    expect(html).toContain('room 02');
    expect(html).toContain('>Connected via route</span>');
    expect(selectOptions(html, 'Room to connect to')).toEqual(['Connect to room…', '03 (studio)']);
  });

  it('selected relationship: Access/Open, corridor style and plain status', () => {
    const design = fakePort();
    const html = render({ doc: v1(), design, selection: selectEdge('ab') });
    expect(html).toContain('Relationship 01 ↔ 02');
    expect(html).toMatch(/<input type="radio" name="kind-ab" checked="" value="access"\/>Access/);
    expect(html).toContain('>Open</label>');
    expect(selectOptions(html, 'Corridor style')).toEqual(['Enclosed', 'Covered', 'Deck']);
    expect(html).toContain('Joined by a generated enclosed corridor, 3 cells long, on storey 0.');
    expect(html).toContain('>Remove connection</button>');
  });

  it('an unresolved relationship is a non-blocking warning with technical details', () => {
    const raw = corridorRaw();
    const blocked = { ...raw, nodes: [...raw.nodes, { id: 'd', displayId: '04', grid: [3, 0, 0], size: [1, 1, 1], typeId: 'studio', attributes: {} }] };
    const design = fakePort(blocked);
    const html = render({ doc: v1(), design, selection: selectEdge('ab') });
    expect(html).toContain('Unresolved: nothing can be built yet. The relationship is kept.');
    expect(html).toContain('Another room is in the way of every straight corridor between these rooms.');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('Technical details');
    // No corridor, so no corridor style control.
    expect(html).not.toContain('aria-label="Corridor style"');
  });

  it('summarises the design when nothing is selected', () => {
    const design = fakePort();
    const html = render({ doc: v1(), design, selection: NO_SELECTION });
    expect(html).toContain('3 rooms · 1 relationships');
    expect(html).toContain('schema v2');
  });
});
