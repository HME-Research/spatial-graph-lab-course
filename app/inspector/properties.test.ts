import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import type { ActiveToolkit } from '@app/extensions';
import { labDoc, labToolkit } from '@app/extensions/test-fixtures';
import type { InspectorProps } from '@app/views/contracts';
import { buildProjectViewContext } from '@app/views/project';
import { selectEdge, selectNode, NO_SELECTION, type Selection } from '@core/viewer/selection';
import { OpenAttributesContext } from '@app/attributes/navigation';
import { EnabledMetricsContext } from '@app/views/three/enabledMetrics';
import { resolveRelationships } from '@app/spatial';
import { Inspector } from './Inspector';
import { corridorRaw, fakePort } from './test-fixtures';

/** Renders Properties for `doc` (through a port on it unless `design` is given). */
function render(props: Partial<InspectorProps> & { readonly doc: DesignDocumentV2; readonly selection: Selection }): string {
  const { doc, ...rest } = props;
  return renderToStaticMarkup(createElement(Inspector, { onSelect: () => {}, design: fakePort(doc, resolveRelationships), ...rest }));
}

/** Option elements of the select labelled `label`. */
function selectOptions(html: string, label: string): string[] {
  const select = new RegExp(`<select[^>]*aria-label="${label}"[^>]*>(.*?)</select>`).exec(html)?.[1] ?? '';
  return [...select.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]!);
}

describe('Properties panel: one-cell rooms', () => {
  let project: ActiveToolkit;
  let doc: DesignDocumentV2;
  beforeAll(async () => {
    project = await labToolkit();
    doc = labDoc();
  });

  it('offers the project types in a real dropdown with the current one selected', () => {
    const node = doc.nodes[0]!;
    const html = render({ doc, selection: selectNode(node.id), project: buildProjectViewContext(project, doc) });
    expect(selectOptions(html, 'Room type')).toEqual(['Gallery', 'Studio']);
    expect(html).toMatch(new RegExp(`<option value="${node.typeId}" selected=""`));
    expect(html).not.toContain('<datalist');
  });

  it('edits the position directly, without Apply or Move buttons', () => {
    const html = render({ doc, selection: selectNode(doc.nodes[0]!.id) });
    expect(html).toContain('aria-label="Position (lowest corner) x"');
    expect(html).toContain('aria-label="Position (lowest corner) z (storey)"');
    expect(html).not.toMatch(/>(Apply|Move|Set)<\/button>/);
    // The explanation is reachable from the fields (tooltip + accessible description).
    expect(html).toMatch(/aria-describedby="[^"]+"/);
    expect(html).toContain('Dragging its node in Graph 2D only tidies the diagram'); // phase 08 (O02): one sentence
  });

  it('keeps an unknown type visible with a warning', async () => {
    const legacy = expectOk(validateDocumentV2({ ...structuredClone(doc), nodes: doc.nodes.map((n, i) => (i === 0 ? { ...n, typeId: 'legacy-thing' } : n)) }));
    const html = render({ doc: legacy, selection: selectNode(legacy.nodes[0]!.id), project: buildProjectViewContext(project, legacy) });
    expect(selectOptions(html, 'Room type')[0]).toBe('legacy-thing: not defined in this project');
    expect(html).toContain('does not offer the function “legacy-thing”');
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
    const html = render({ doc: v1(), design, selection: selectNode(1) });
    expect(html).toContain('Room <span class="sgl-room-label">1</span>');
    expect(html).toContain('aria-label="Size (cells) x"');
    expect(html).toMatch(/aria-label="Size \(cells\) y"[^>]*value="3"|value="3"[^>]*aria-label="Size \(cells\) y"/);
    expect(html).toContain('Position (lowest corner)');
    expect(html).not.toMatch(/>(Apply|Move|Set)<\/button>/);
  });

  it('lists relationships with their spatial status and offers Connect', () => {
    const design = fakePort();
    const html = render({ doc: v1(), design, selection: selectNode(1) });
    expect(html).toContain('room 2');
    expect(html).toContain('>Connected via route</span>');
    expect(selectOptions(html, 'Room to connect to')).toEqual(['Connect to room…', '3 (studio)']);
  });

  it('selected relationship: Access/Open, corridor style and plain status', () => {
    const design = fakePort();
    const html = render({ doc: v1(), design, selection: selectEdge(1) });
    expect(html).toContain('Relationship 1 ↔ 2');
    expect(html).toMatch(/<input type="radio" name="kind-1" checked="" value="access"\/>Access/);
    expect(html).toContain('>Open</label>');
    expect(selectOptions(html, 'Corridor style')).toEqual(['Enclosed', 'Covered', 'Deck']);
    expect(html).toContain('Joined by a generated enclosed corridor, 3 cells long, on storey 0.');
    expect(html).toContain('>Remove connection</button>');
  });

  it('an unresolved relationship is a non-blocking warning with technical details', () => {
    const raw = corridorRaw();
    const blocked = { ...raw, nodes: [...raw.nodes, { id: 4, grid: [3, 0, 0], size: [1, 1, 1], typeId: 'studio', attributes: {} }] };
    const design = fakePort(blocked);
    const html = render({ doc: v1(), design, selection: selectEdge(1) });
    expect(html).toContain('Unresolved: nothing can be built yet. The relationship is kept.');
    expect(html).toContain('Another room is in the way of every straight corridor between these rooms.');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('Technical details');
    // No corridor, so no corridor style control.
    expect(html).not.toContain('aria-label="Corridor style"');
  });

  it('summarises the scenario when nothing is selected (student vocabulary; the schema only as a tooltip)', () => {
    const design = fakePort();
    const html = render({ doc: v1(), design, selection: NO_SELECTION });
    expect(html).toContain('This scenario');
    expect(html).toContain('3 nodes · 1 edge');
    expect(html).toContain('title="Stored as schema v2"');
    expect(html).not.toContain('>Design<');
  });
});

// Wave 1 (A): Properties are grouped Identity / Geometry / Attributes / Calculated; calculated values
// are read-only text in a distinct box (from the root metric contract), and there is a direct link
// to the attribute manager.
describe('Properties grouping (wave 1)', () => {
  const v1 = () => labDoc();
  const sectionBody = (html: string, id: string): string => {
    const start = html.indexOf(`data-section="${id}"`);
    expect(start, `section ${id}`).toBeGreaterThanOrEqual(0);
    const next = html.indexOf('data-section="', start + 1);
    return html.slice(start, next < 0 ? undefined : next);
  };

  /** The data-attribute ids of the unified list, in order. */
  const attributeIds = (html: string): string[] => [...sectionBody(html, 'attributes').matchAll(/data-attribute="([^"]+)"/g)].map((m) => m[1]!);
  const rowOf = (html: string, id: string): string => {
    const body = sectionBody(html, 'attributes');
    const start = body.indexOf(`data-attribute="${id}"`);
    expect(start, `row ${id}`).toBeGreaterThanOrEqual(0);
    const next = body.indexOf('data-attribute="', start + 1);
    return body.slice(start, next < 0 ? undefined : next);
  };

  it('a room shows Attributes first, then Geometry and Relationships, all collapsed', () => {
    const html = render({ doc: v1(), design: fakePort(), selection: selectNode(1) });
    const order = ['attributes', 'geometry', 'relationships'].map((id) => html.indexOf(`data-section="${id}"`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(html).not.toContain('data-section="identity"');
    expect(html).not.toContain('data-section="calculated"');
    // Each group is a disclosure, collapsed by default: a heading button that controls a mounted body.
    expect(html).toMatch(/<h3 class="sgl-csection-title"><button type="button" class="sgl-csection-toggle" aria-expanded="false" aria-controls="[^"]+"/);
    expect(html).not.toMatch(/sgl-csection-toggle" aria-expanded="true"/);
  });

  it('one attribute list: Function and Level first, then calculated values (read-only text)', () => {
    const html = render({ doc: v1(), design: fakePort(), selection: selectNode(1) });
    const ids = attributeIds(html);
    expect(ids.slice(0, 2)).toEqual(['function', 'level']);
    expect(ids).toContain('area');
    expect(ids).toContain('degree');
    expect(ids.indexOf('area')).toBeGreaterThan(1);
    const area = rowOf(html, 'area');
    expect(area).toContain('data-attribute-kind="calculated"');
    expect(area).toMatch(/sgl-field-value">\d+(\.\d+)? m²</);
    expect(area).not.toMatch(/<input|<select|<textarea/);
    expect(rowOf(html, 'degree')).toMatch(/sgl-field-value">\d+</);
    // Level is a required attribute, never a duplicated calculated row.
    expect(ids.filter((id) => id === 'level')).toHaveLength(1);
    // Geometry stays editable.
    expect(sectionBody(html, 'geometry')).toContain('<input');
  });

  it('shows only the project’s enabled calculated values (I1), and none when nothing is enabled', () => {
    const withIds = (ids: readonly string[]) =>
      renderToStaticMarkup(
        createElement(
          EnabledMetricsContext.Provider,
          { value: ids },
          createElement(Inspector, { onSelect: () => {}, design: fakePort(), selection: selectNode(1) }),
        ),
      );
    const html = withIds(['volume', 'has-exterior-facade']);
    expect(attributeIds(html)).toEqual(['function', 'level', 'volume', 'has-exterior-facade']);
    expect(rowOf(html, 'has-exterior-facade')).toMatch(/sgl-field-value">(yes|no)</);
    expect(withIds([])).not.toContain('data-attribute-kind="calculated"');
  });

  it('Function and Level are editable in the attribute list (Level = z)', () => {
    const design = fakePort();
    const node = design.doc.nodes.find((n) => n.id === 1)!;
    const html = render({ doc: v1(), design, selection: selectNode(1) });
    expect(rowOf(html, 'function')).toContain('aria-label="Room type"');
    const level = rowOf(html, 'level');
    expect(level).toMatch(new RegExp(`<input aria-label="Level" type="number"[^>]*value="${node.grid[2]}"`));
  });

  it('offers "Manage attributes" in the Attributes group header when a project is active', async () => {
    const project = await labToolkit();
    const design = fakePort();
    const context = buildProjectViewContext(project, v1());
    const html = renderToStaticMarkup(
      createElement(
        OpenAttributesContext.Provider,
        { value: () => {} },
        createElement(Inspector, { onSelect: () => {}, design, project: context, selection: selectNode(1) }),
      ),
    );
    const attributes = sectionBody(html, 'attributes');
    expect(attributes).toMatch(/sgl-csection-actions"><button type="button" class="sgl-link sgl-manage-link"[^>]*>Manage attributes<\/button>/);
    expect(attributes.match(/Manage attributes<\/button>/g)).toHaveLength(1);
  });

  it('a relationship explains Access/Open with an `i` concept dialog instead of a tooltip', () => {
    const html = render({ doc: v1(), design: fakePort(), selection: selectEdge(1) });
    const row = rowOf(html, 'relationship');
    expect(attributeIds(html)[0]).toBe('relationship');
    expect(row).toContain('aria-label="About Access and Open"');
    expect(row).toContain('aria-haspopup="dialog"');
    expect(row).not.toContain('data-help-topic="access-open"');
  });
});
