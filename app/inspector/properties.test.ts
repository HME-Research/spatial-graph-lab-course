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
import { NODE_BUILT_IN_ATTRIBUTES } from '@app/attributes/sections';
import { MAX_ROOM_SIZE } from '@app/document';
import { geometryDraftEdit, planGeometryEdit } from './propertiesModel';
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
    expect(selectOptions(html, 'Node function')).toEqual(['Gallery', 'Studio']);
    expect(html).toMatch(new RegExp(`<option value="${node.function}" selected=""`));
    expect(html).not.toContain('<datalist');
  });

  it('edits the position directly, without Apply or Move buttons', () => {
    const html = render({ doc, selection: selectNode(doc.nodes[0]!.id) });
    expect(html).toContain('aria-label="Position x"');
    expect(html).toContain('aria-label="Level"');
    // Position is ONE attribute row with three values: x | y | z (Level).
    expect(html).toMatch(/data-attribute="position"[\s\S]*?<span class="sgl-axis-label">x<\/span>[\s\S]*?<span class="sgl-axis-label">y<\/span>[\s\S]*?<span class="sgl-axis-label">z \(Level\)<\/span>/);
    expect(html).not.toMatch(/>(Apply|Move|Set)<\/button>/);
    // The explanation is reachable from the fields (tooltip + one help line).
    expect(html).toContain('title="Where the room’s lowest corner is, in cells: x, y and z (z is the Level, the storey it stands on). Changing it moves the room."');
    expect(html).toContain('Dragging its node in Graph 2D only tidies the diagram'); // phase 08 (O02): one sentence
  });

  it('keeps an unknown type visible with a warning', async () => {
    const legacy = expectOk(validateDocumentV2({ ...structuredClone(doc), nodes: doc.nodes.map((n, i) => (i === 0 ? { ...n, function: 'legacy-thing' } : n)) }));
    const html = render({ doc: legacy, selection: selectNode(legacy.nodes[0]!.id), project: buildProjectViewContext(project, legacy) });
    expect(selectOptions(html, 'Node function')[0]).toBe('legacy-thing: not defined in this project');
    expect(html).toContain('does not offer the function “legacy-thing”');
  });

  it('shows the relationship kind and a remove action with an undo hint', () => {
    const edge = doc.edges[0]!;
    const html = render({ doc, selection: selectEdge(edge.id) });
    expect(html).toContain(`Edge ${edge.source} ↔ ${edge.target}`);
    expect(html).toContain('aria-label="Relationship kind"');
    expect(html).toContain('>Delete edge</button>');
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
    // The title is the Function (2026-11-20; without a project its id, "gallery"), with the room id small after it.
    expect(html).toMatch(/<div class="sgl-title"><span class="sgl-swatch"[^>]*><\/span><span class="sgl-room-function">gallery<\/span><span class="sgl-id"[^>]*>Node <span class="sgl-room-label">1<\/span><\/span><\/div>/);
    expect(html).toContain('aria-label="Size x"');
    expect(html).toMatch(/aria-label="Size y"[^>]*value="3"|value="3"[^>]*aria-label="Size y"/);
    expect(html).toContain('aria-label="Floors"');
    expect(html).toContain('aria-label="Position y"');
    expect(html).toContain('<span class="sgl-axis-label">z (Floors)</span>');
    expect(html).not.toMatch(/>(Apply|Move|Set)<\/button>/);
  });

  it('lists relationships with their spatial status and offers Connect', () => {
    const design = fakePort();
    const html = render({ doc: v1(), design, selection: selectNode(1) });
    expect(html).toContain('node 2');
    expect(html).toContain('>Connected via route</span>');
    expect(selectOptions(html, 'Node to connect to')).toEqual(['Connect to node…', '3 (studio)']);
  });

  it('selected relationship: Access/Open, corridor walls and roof, and plain status', () => {
    const design = fakePort();
    const html = render({ doc: v1(), design, selection: selectEdge(1) });
    expect(html).toContain('Edge 1 ↔ 2');
    expect(html).toMatch(/<input type="radio" name="kind-1" checked="" value="access"\/>Access/);
    expect(html).toContain('>Open</label>');
    expect(selectOptions(html, 'Corridor walls')).toEqual(['Design default (Open)', 'Enclosed', 'Open']);
    expect(selectOptions(html, 'Corridor roof')).toEqual(['Design default (Flat)', 'Flat', 'Pergola (open slats)', 'None (open top)']);
    expect(html).toContain('Joined by a generated corridor (1.5 m wide, open sides and a flat roof), 3 cells long, on storey 0.');
    expect(html).toContain('>Delete edge</button>');
  });

  it('an unresolved relationship is a non-blocking warning with technical details', () => {
    const raw = corridorRaw();
    const blocked = { ...raw, nodes: [...raw.nodes, { id: 4, position: [3, 0, 0], size: [1, 1, 1], function: 'studio', custom: {} }] };
    const design = fakePort(blocked);
    const html = render({ doc: v1(), design, selection: selectEdge(1) });
    expect(html).toContain('Unresolved: nothing can be built yet. The edge is kept.');
    expect(html).toContain('Another room is in the way of every straight corridor between these rooms.');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('Technical details');
    // No corridor now, yet its walls / roof stay editable (Geometry), with a note that they are unused.
    expect(selectOptions(html, 'Corridor walls')).toEqual(['Design default (Open)', 'Enclosed', 'Open']);
    expect(html).toContain('No corridor is generated for this edge now; these values are used only if one is.');
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

// Programme P4 (item C): Properties shows the five attribute sections of sections.ts — Identity,
// Required by the app, Geometry (nodes: Position, Size; edges: Corridor), Custom (tagged by source), Calculated — not
// collapsible, each with a small title and an ⓘ; then the relationships (collapsible).
describe('Properties sections (P4)', () => {
  const v1 = () => labDoc();
  const sections = (html: string): string[] => [...html.matchAll(/data-attribute-section="([^"]+)"/g)].map((m) => m[1]!);
  const sectionBody = (html: string, id: string): string => {
    const start = html.indexOf(`data-attribute-section="${id}"`);
    expect(start, `section ${id}`).toBeGreaterThanOrEqual(0);
    const next = html.indexOf('data-attribute-section="', start + 1);
    return html.slice(start, next < 0 ? html.indexOf('data-section="relationships"') : next);
  };
  /** The data-attribute ids of all section rows, in order. */
  const attributeIds = (html: string): string[] => {
    const start = html.indexOf('data-section="attributes"');
    const end = html.indexOf('data-section="', start + 1);
    return [...html.slice(start, end < 0 ? undefined : end).matchAll(/data-attribute="([^"]+)"/g)].map((m) => m[1]!);
  };
  const rowOf = (html: string, id: string): string => {
    const start = html.indexOf(`data-attribute="${id}"`);
    expect(start, `row ${id}`).toBeGreaterThanOrEqual(0);
    const ends = [html.indexOf('data-attribute="', start + 1), html.indexOf('data-section="', start + 1)].filter((i) => i >= 0);
    return html.slice(start, ends.length > 0 ? Math.min(...ends) : undefined);
  };
  const withProject = async (selection: Selection, design = fakePort(), doc = v1()) => {
    const project = await labToolkit();
    return renderToStaticMarkup(
      createElement(
        OpenAttributesContext.Provider,
        { value: () => {} },
        createElement(Inspector, { onSelect: () => {}, design, project: buildProjectViewContext(project, doc), selection }),
      ),
    );
  };

  it('a room: the five sections in order, then Relationships; sections are not collapsible', async () => {
    const html = await withProject(selectNode(1));
    expect(sections(html)).toEqual(['identity', 'required', 'geometry', 'custom', 'calculated']);
    expect(html.indexOf('data-attribute-section="calculated"')).toBeLessThan(html.indexOf('data-section="relationships"'));
    expect(attributeIds(html).slice(0, 4)).toEqual(NODE_BUILT_IN_ATTRIBUTES.map((a) => a.id));
    expect(attributeIds(html).slice(0, 4)).toEqual(['id', 'function', 'position', 'size']);
    for (const s of ['identity', 'required', 'geometry', 'custom', 'calculated']) {
      const head = sectionBody(html, s);
      expect(head).toContain('class="sgl-attr-section-title"');
      expect(head).toContain(`data-help-topic="section-${s}"`);
      expect(head).toContain('More in the guide →');
      expect(head).not.toContain('sgl-csection-toggle');
    }
  });

  it('Identity is the locked id; Position and Size are one row each with three editable values (not custom)', () => {
    const design = fakePort();
    const node = design.doc.nodes.find((n) => n.id === 1)!;
    const html = render({ doc: v1(), design, selection: selectNode(1) });
    const id = rowOf(html, 'id');
    expect(id).toContain('sgl-field-value">1<');
    expect(id).toContain('aria-label="Identity: cannot be changed"');
    expect(id).not.toMatch(/<input|<select/);
    for (const part of ['position', 'size'] as const) {
      const inputs = [...rowOf(html, part).matchAll(/<input aria-label="([^"]+)" type="number"[^>]*value="(-?\d+)"/g)].map((m) => [m[1], Number(m[2])]);
      expect(inputs, part).toEqual(
        part === 'position'
          ? [['Position x', node.position[0]], ['Position y', node.position[1]], ['Level', node.position[2]]]
          : [['Size x', node.size[0]], ['Size y', node.size[1]], ['Floors', node.size[2]]],
      );
    }
    expect(Object.keys(node.custom)).not.toContain('level');
  });

  it('Custom rows are tagged by source; Calculated rows are locked read-only text', async () => {
    const html = await withProject(selectNode(1));
    expect(rowOf(html, 'daylight')).toContain('<span class="sgl-source-tag">Toolkit: Lab</span>');
    const area = rowOf(html, 'area');
    expect(area).toContain('data-attribute-kind="calculated"');
    expect(area).toMatch(/sgl-field-value">\d+(\.\d+)? m²</);
    expect(area).toContain('aria-label="Calculated: cannot be typed in"');
    expect(area).not.toMatch(/<input|<select|<textarea/);
    // Level is a value of the Position row, never a separate or calculated row.
    expect(attributeIds(html)).not.toContain('level');
  });

  it('shows only the project’s enabled calculated values (I1), and no Calculated section when nothing is enabled', () => {
    const withIds = (ids: readonly string[]) =>
      renderToStaticMarkup(
        createElement(
          EnabledMetricsContext.Provider,
          { value: ids },
          createElement(Inspector, { onSelect: () => {}, design: fakePort(), selection: selectNode(1) }),
        ),
      );
    const html = withIds(['volume', 'has-exterior-facade']);
    expect(attributeIds(html).slice(-2)).toEqual(['volume', 'has-exterior-facade']);
    expect(rowOf(html, 'has-exterior-facade')).toMatch(/sgl-field-value">(yes|no)</);
    const none = withIds([]);
    expect(none).not.toContain('data-attribute-kind="calculated"');
    expect(sections(none)).not.toContain('calculated');
  });

  it('offers "Manage attributes" once, in the Custom section header', async () => {
    const html = await withProject(selectNode(1));
    expect(sectionBody(html, 'custom')).toMatch(/sgl-attr-section-actions"><button type="button" class="sgl-link sgl-manage-link"[^>]*>Manage attributes<\/button>/);
    expect(html.match(/Manage attributes<\/button>/g)).toHaveLength(1);
  });

  it('a relationship: Identity (ID, Source, Target as "id · function"), then Relationship, then Geometry (Corridor)', async () => {
    const html = await withProject(selectEdge(1));
    expect(sections(html).slice(0, 3)).toEqual(['identity', 'required', 'geometry']);
    expect(attributeIds(html).slice(0, 5)).toEqual(['id', 'source', 'target', 'relationship', 'corridor']);
    expect(rowOf(html, 'source')).toMatch(/>1 · Gallery<\/button>/);
    expect(rowOf(html, 'target')).toMatch(/>2 · Studio<\/button>/);
    expect(rowOf(html, 'target')).toContain('aria-label="Identity: an edge always joins the same two nodes.');
    const row = rowOf(html, 'relationship');
    expect(row).toContain('aria-label="About Access and Open"');
    expect(row).toContain('aria-haspopup="dialog"');
    expect(row).not.toContain('data-help-topic="access-open"');
  });

  it('without custom edge attributes the Custom section is left out', () => {
    const html = render({ doc: v1(), design: fakePort(), selection: selectEdge(1) });
    expect(sections(html)).not.toContain('custom');
    expect(sections(html).slice(0, 3)).toEqual(['identity', 'required', 'geometry']);
  });
});

describe('Geometry rows edit through the move/resize path (P4)', () => {
  const node = { position: [0, 0, 0] as const, size: [2, 3, 1] as const };

  it('one row changes one axis; the others keep their stored values', () => {
    expect(geometryDraftEdit(node, 'position.y', 'Position y', '4', MAX_ROOM_SIZE)).toEqual({ kind: 'edit', request: { position: [0, 4, 0] } });
    expect(geometryDraftEdit(node, 'position.z', 'Level', '-1', MAX_ROOM_SIZE)).toEqual({ kind: 'edit', request: { position: [0, 0, -1] } });
    expect(geometryDraftEdit(node, 'size.z', 'Floors', '2', MAX_ROOM_SIZE)).toEqual({ kind: 'edit', request: { size: [2, 3, 2] } });
    expect(geometryDraftEdit(node, 'size.x', 'Size x', ' 2 ', MAX_ROOM_SIZE)).toEqual({ kind: 'unchanged' });
  });

  it('refuses partial input and sizes outside 1..max with a readable reason', () => {
    expect(geometryDraftEdit(node, 'position.x', 'Position x', '1.5', MAX_ROOM_SIZE)).toEqual({ kind: 'invalid', message: 'Position x must be a whole number' });
    expect(geometryDraftEdit(node, 'size.x', 'Size x', '0', MAX_ROOM_SIZE)).toEqual({ kind: 'invalid', message: `Size x must be from 1 to ${MAX_ROOM_SIZE}` });
    expect(geometryDraftEdit(node, 'size.z', 'Floors', String(MAX_ROOM_SIZE + 1), MAX_ROOM_SIZE).kind).toBe('invalid');
  });

  it('an overlapping edit is refused by the preview and changes nothing; a free one is one command', () => {
    const design = fakePort();
    const room = design.doc.nodes.find((n) => n.id === 2)!;
    // Room 2 onto room 1 (x = 0): refused before any command is sent.
    const overlap = geometryDraftEdit(room, 'position.x', 'Position x', '0', MAX_ROOM_SIZE);
    if (overlap.kind !== 'edit') throw new Error('expected an edit');
    expect(planGeometryEdit(design.proposeEdit({ nodeId: 2, position: [...overlap.request.position!] }), design.doc, 2).kind).toBe('reject');
    expect(design.sent).toHaveLength(0);
    // Room 3 one cell up in y: allowed, one set-node-geometry command.
    const free = geometryDraftEdit(design.doc.nodes.find((n) => n.id === 3)!, 'position.y', 'Position y', '7', MAX_ROOM_SIZE);
    if (free.kind !== 'edit') throw new Error('expected an edit');
    expect(planGeometryEdit(design.proposeEdit({ nodeId: 3, position: [...free.request.position!] }), design.doc, 3).kind).toBe('commit');
    expect(design.onCommand({ type: 'set-node-geometry', nodeId: 3, position: [...free.request.position!] }).ok).toBe(true);
    expect(design.latest().nodes.find((n) => n.id === 3)!.position).toEqual([0, 7, 0]);
  });
});
