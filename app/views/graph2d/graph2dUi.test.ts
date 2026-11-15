import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import exampleDesign from '../../document/examples/two-storey-example.json';
import { applyGraphCommand, validateDocument, type DesignDocument } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { migrateV1toV2, readDesignJson, serializeDesignV2, validateDocumentV2, type DesignDocumentV2 } from '@app/document/v2';
import { v2Raw } from '@app/document/v2/test-fixtures';
import { applyDesignCommand, resolveRelationships, type DesignCommand, type EdgeResolution, type SpatialResolution } from '@app/spatial';
import { circleBorderPoint, circleSegment, defaultV1ConnectionKind, resolveDiagramPositions, suggestFreeCellV2 } from './diagram';
import {
  addNodeRequest,
  connectRequest,
  diagramPositionCommand,
  modelFromV1,
  modelFromV2,
  type DiagramModel,
  type ModelCommand,
} from './diagramModel';
import { NEUTRAL_STROKE, presentEdge, relationshipLegend, relationshipStroke, ROUTED_STROKE, UNRESOLVED_STROKE } from './edgePresentation';
import { menuItems } from './NodeContextMenu';
import {
  BASE_NODE_DIAMETER,
  DEFAULT_DISPLAY,
  MAX_NODE_DIAMETER,
  MAX_NODE_LINES,
  NodeDisplayControl,
  attributeKeysOf,
  nodeLines,
  sanitizeDisplay,
  toggleAttributeKey,
} from './NodeDisplay';
import { placeAtPoint, placeBeside, popoverRows } from './NodePopover';

// ── Fakes: a v2 host built only from frozen contract functions ──────────────────────────────

const v2Doc = (raw: unknown = v2Raw()): DesignDocumentV2 => expectOk(validateDocumentV2(raw));
const v2Model = (doc: DesignDocumentV2): DiagramModel => modelFromV2(doc, resolveRelationships(doc));
const v1Example = (): DesignDocument => expectOk(validateDocument(exampleDesign));

/** Apply a model command to the document it targets (what the host does through the port). */
function applyV2(doc: DesignDocumentV2, mc: ModelCommand): DesignDocumentV2 {
  expect(mc.version).toBe(2);
  return expectOk(applyDesignCommand(doc, mc.command as DesignCommand));
}

/** n rooms on storey 0 in a row with gaps (never touching), n-1 chain relationships. */
function separatedRooms(n: number): DesignDocumentV2 {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    displayId: String(i + 1).padStart(2, '0'),
    grid: [i * 2, (i % 3) * 4, 0],
    typeId: ['gallery', 'studio', 'storage'][i % 3],
    attributes: { area: 10 + i },
  }));
  const edges = nodes.slice(1).map((node, i) => ({ id: `e${i}`, source: nodes[i]!.id, target: node.id, kind: 'access' }));
  return v2Doc({ schemaVersion: 2, metadata: { name: `${n} rooms` }, nodes, edges, diagram: { positions: {} } });
}

// ── Circle geometry ─────────────────────────────────────────────────────────────────────────

describe('circle edge attachment', () => {
  it('puts the attachment point on the circle border, towards the other node', () => {
    const [x, y] = circleBorderPoint([0, 0], 10, [30, 40]);
    expect(Math.hypot(x, y)).toBeCloseTo(10);
    expect(x).toBeCloseTo(6);
    expect(y).toBeCloseTo(8);
  });

  it('returns the centre for a zero-length direction', () => {
    expect(circleBorderPoint([5, 5], 10, [5, 5])).toEqual([5, 5]);
  });

  it('draws border to border, and falls back to the centre line for overlapping circles', () => {
    const seg = circleSegment({ centre: [0, 0], radius: 20 }, { centre: [100, 0], radius: 30 });
    expect(seg.from).toEqual([20, 0]);
    expect(seg.to).toEqual([70, 0]);
    const overlap = circleSegment({ centre: [0, 0], radius: 20 }, { centre: [25, 0], radius: 20 });
    expect(overlap).toEqual({ from: [0, 0], to: [25, 0] });
  });
});

// ── Display ids ─────────────────────────────────────────────────────────────────────────────

describe('display ids', () => {
  it('shows the stored v2 displayId, not the permanent id or array position', () => {
    const doc = v2Doc();
    const model = v2Model(doc);
    expect(model.nodes.map((n) => [n.id, n.label])).toEqual([
      ['a', '01'],
      ['b', '02'],
    ]);
    const reordered = v2Doc({ ...v2Raw(), nodes: [...v2Raw().nodes].reverse() });
    expect(v2Model(reordered).byNode.get('a')?.label).toBe('01');
    expect(v2Model(reordered).byNode.get('b')?.label).toBe('02');
  });

  it('falls back to the permanent id for legacy (v1) data, deterministically', () => {
    const doc = v1Example();
    const labels = modelFromV1(doc).nodes.map((n) => n.label);
    expect(labels).toEqual(doc.nodes.map((n) => n.id));
    expect(modelFromV1(v1Example()).nodes.map((n) => n.label)).toEqual(labels);
  });

  it('keeps other display ids on deletion, type change and export/import', () => {
    let doc = migrateV1toV2(v1Example());
    const before = new Map(v2Model(doc).nodes.map((n) => [n.id, n.label]));
    doc = expectOk(applyDesignCommand(doc, { type: 'remove-node', nodeId: 'entry-gallery' }));
    doc = expectOk(applyDesignCommand(doc, { type: 'set-node-type', nodeId: 'store', typeId: 'archive' }));
    const after = v2Model(doc);
    for (const node of after.nodes) expect(node.label).toBe(before.get(node.id));
    const reread = expectOk(readDesignJson(serializeDesignV2(doc))).doc;
    expect(v2Model(reread).nodes.map((n) => n.label)).toEqual(after.nodes.map((n) => n.label));
  });

  it('gives a new node the next display id and a free cell', () => {
    const doc = v2Doc();
    const model = v2Model(doc);
    const { nodeId, command } = addNodeRequest(model, 'a');
    const next = applyV2(doc, command);
    const added = v2Model(next).byNode.get(nodeId);
    expect(added?.label).toBe('03');
    // Beside room a (2×3×1 at the origin): first free cell on its +x side.
    expect(added?.grid).toEqual([2, 0, 0]);
  });
});

// ── Connections ─────────────────────────────────────────────────────────────────────────────

describe('connectRequest', () => {
  it('v2: creates an add-edge without a kind, so the new relationship is Access', () => {
    const doc = v2Doc({ ...v2Raw(), edges: [] });
    const request = connectRequest(v2Model(doc), 'a', 'b');
    expect(request.status).toBe('command');
    if (request.status !== 'command') return;
    expect(request.command).toEqual({
      version: 2,
      command: { type: 'add-edge', edge: { id: 'edge-1', source: 'a', target: 'b' } },
    });
    const next = applyV2(doc, request.command);
    expect(next.edges).toEqual([expect.objectContaining({ id: 'edge-1', kind: 'access' })]);
  });

  it('v2: a relationship between rooms that do not touch is created and shown as unresolved, not refused', () => {
    const doc = v2Doc({ ...v2Raw(), edges: [], nodes: [v2Raw().nodes[0], { id: 'b', displayId: '02', grid: [0, 0, 3], typeId: 'studio' }] });
    const request = connectRequest(v2Model(doc), 'a', 'b');
    if (request.status !== 'command') throw new Error('expected a command');
    const model = v2Model(applyV2(doc, request.command));
    const edge = model.edges[0]!;
    expect(edge.resolution?.status).toBe('unresolved');
    const p = presentEdge(model, edge);
    expect(p).toMatchObject({ status: 'unresolved', stroke: UNRESOLVED_STROKE, strokeDasharray: expect.any(String) });
    expect(p.strokeWidth).toBeLessThanOrEqual(2);
    expect(p.title).toMatch(/different storeys/);
  });

  it('reports an existing pair instead of duplicating it (either direction)', () => {
    const model = v2Model(v2Doc());
    expect(connectRequest(model, 'b', 'a')).toEqual({ status: 'existing', edgeId: 'ab' });
  });

  it('refuses self-connections and missing nodes', () => {
    const model = v2Model(v2Doc());
    expect(connectRequest(model, 'a', 'a').status).toBe('refused');
    expect(connectRequest(model, 'a', 'zzz').status).toBe('refused');
  });

  it('v1: defaults to door / vertical access for touching cells and explains non-touching cells', () => {
    expect(defaultV1ConnectionKind([0, 0, 0], [1, 0, 0])).toBe('door');
    expect(defaultV1ConnectionKind([0, 0, 0], [0, 0, 1])).toBe('vertical-access');
    expect(defaultV1ConnectionKind([0, 0, 0], [2, 0, 0])).toBeNull();
    const doc = v1Example();
    const model = modelFromV1(doc);
    // reading-gallery [0,1,0] and store [1,1,0] touch but are not connected.
    const ok = connectRequest(model, 'reading-gallery', 'store');
    if (ok.status !== 'command' || ok.command.version !== 1) throw new Error('expected a v1 command');
    expect(ok.command.command).toMatchObject({ type: 'add-edge', edge: { kind: 'door' } });
    expect(expectOk(applyGraphCommand(doc, ok.command.command)).edges).toHaveLength(doc.edges.length + 1);
    const refused = connectRequest(model, 'reading-gallery', 'gallery-upper');
    expect(refused.status).toBe('refused');
  });
});

describe('diagram drag', () => {
  it('changes only the diagram position, never the room cell (v2)', () => {
    const doc = v2Doc();
    const next = applyV2(doc, diagramPositionCommand(v2Model(doc), 'a', [400, -50]));
    expect(next.diagram.positions['a']).toEqual([400, -50]);
    expect(next.nodes).toEqual(doc.nodes);
  });

  it('changes only the diagram position, never the room cell (v1)', () => {
    const doc = v1Example();
    const mc = diagramPositionCommand(modelFromV1(doc), 'store', [9, 9]);
    if (mc.version !== 1) throw new Error('expected a v1 command');
    const next = expectOk(applyGraphCommand(doc, mc.command));
    expect(next.nodes).toEqual(doc.nodes);
    expect(next.diagram.positions['store']).toEqual([9, 9]);
  });
});

// ── Edge presentation ───────────────────────────────────────────────────────────────────────

describe('edge presentation', () => {
  it('encodes direct, routed and unresolved distinctly, and open heavier than access', () => {
    const direct = relationshipStroke('access', 'direct');
    const routed = relationshipStroke('access', 'routed');
    const unresolved = relationshipStroke('access', 'unresolved');
    expect(direct).toEqual({ stroke: NEUTRAL_STROKE, strokeWidth: 2, strokeDasharray: undefined });
    expect(routed.stroke).toBe(ROUTED_STROKE);
    expect(routed.strokeDasharray).toBeDefined();
    expect(unresolved.stroke).toBe(UNRESOLVED_STROKE);
    expect(unresolved.strokeDasharray).toBeDefined();
    expect(unresolved.strokeDasharray).not.toBe(routed.strokeDasharray);
    expect(relationshipStroke('open', 'direct').strokeWidth).toBeGreaterThan(direct.strokeWidth);
  });

  it('presents a routed resolution (fake host) as neutral, not as an error', () => {
    const doc = v2Doc();
    const real = resolveRelationships(doc);
    const routed: EdgeResolution = {
      edgeId: 'ab',
      kind: 'access',
      status: 'routed',
      route: {
        edgeId: 'ab',
        axis: 'x',
        level: 0,
        cells: [[2, 0, 0], [3, 0, 0], [4, 0, 0]],
        from: { nodeId: 'a', cell: [1, 0, 0], direction: '+x' } as never,
        to: { nodeId: 'b', cell: [5, 0, 0], direction: '-x' } as never,
        style: 'enclosed',
      },
    };
    const spatial: SpatialResolution = { ...real, edges: [routed], byEdge: new Map([['ab', routed]]) };
    const model = modelFromV2(doc, spatial);
    const p = presentEdge(model, model.edges[0]!);
    expect(p.status).toBe('routed');
    expect(p.stroke).toBe(ROUTED_STROKE);
    expect(p.label).toBe('Access · Via connector');
  });

  it('keeps the v1 kind styles for v1 documents', () => {
    const model = modelFromV1(v1Example());
    const atrium = model.edges.find((e) => e.kind === 'atrium')!;
    expect(presentEdge(model, atrium)).toMatchObject({ status: 'legacy', strokeDasharray: '10 5' });
  });

  it('explains every status in the legend, including the muted red dashed unresolved line', () => {
    const rows = relationshipLegend();
    expect(rows.map((r) => r.key)).toEqual(['access', 'open', 'routed', 'unresolved']);
    expect(rows.find((r) => r.key === 'unresolved')?.stroke.stroke).toBe(UNRESOLVED_STROKE);
    for (const row of rows) expect(row.hint.length).toBeGreaterThan(10);
  });
});

// ── Node display ────────────────────────────────────────────────────────────────────────────

describe('node display', () => {
  const node = v2Model(v2Doc({ ...v2Raw(), nodes: [{ ...v2Raw().nodes[0], attributes: { a1: 1, a2: 'x', a3: true, a4: 'a very long attribute value' } }, v2Raw().nodes[1]] })).nodes[0]!;

  it('shows the id by default in the base circle', () => {
    expect(DEFAULT_DISPLAY.showId).toBe(true);
    expect(nodeLines(node, DEFAULT_DISPLAY)).toEqual({ lines: ['01'], hidden: 0, diameter: BASE_NODE_DIAMETER });
  });

  it('grows within a conservative bound and summarises the rest', () => {
    const all = { ...DEFAULT_DISPLAY, showType: true, attributeKeys: ['a1', 'a2', 'a3', 'a4'] };
    const l = nodeLines(node, all);
    expect(l.lines).toHaveLength(MAX_NODE_LINES);
    expect(l.hidden).toBe(6 - MAX_NODE_LINES);
    expect(l.diameter).toBeLessThanOrEqual(MAX_NODE_DIAMETER);
    expect(l.lines[1]).toBe('gallery');
  });

  it('truncates long values and skips attributes a node does not have', () => {
    const l = nodeLines(node, { ...DEFAULT_DISPLAY, showId: false, attributeKeys: ['a4', 'missing'] });
    expect(l.lines).toEqual(['a4: a very lo…']);
  });

  it('lists attribute keys and toggles them in order', () => {
    expect(attributeKeysOf({ nodes: [node] })).toEqual(['a1', 'a2', 'a3', 'a4']);
    const s = toggleAttributeKey(toggleAttributeKey(DEFAULT_DISPLAY, 'a2'), 'a1');
    expect(s.attributeKeys).toEqual(['a2', 'a1']);
    expect(toggleAttributeKey(s, 'a2').attributeKeys).toEqual(['a1']);
  });

  it('restores malformed remembered settings safely', () => {
    expect(sanitizeDisplay(undefined)).toEqual(DEFAULT_DISPLAY);
    expect(sanitizeDisplay({ showId: 'yes', attributeKeys: ['k', 3], showLegend: false })).toEqual({
      showId: true,
      showType: false,
      attributeKeys: ['k'],
      showLegend: false,
    });
  });

  it('renders the Display control collapsed with Node ID checked', () => {
    const html = renderToStaticMarkup(
      createElement(NodeDisplayControl, { settings: DEFAULT_DISPLAY, attributeKeys: ['area'], onChange: () => {} }),
    );
    expect(html).toContain('<details class="sgl-display">');
    expect(html).toMatch(/<input type="checkbox" checked=""\/>Node ID/);
    expect(html).toContain('<code>area</code>');
  });
});

// ── Popover and menus ───────────────────────────────────────────────────────────────────────

describe('popover placement', () => {
  const size = { width: 250, height: 200 };
  for (const container of [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 640, height: 360 },
  ]) {
    it(`stays inside a ${container.width}×${container.height} panel at every corner`, () => {
      for (const x of [0, 30, container.width / 2, container.width - 30, container.width]) {
        for (const y of [0, 30, container.height / 2, container.height - 30, container.height]) {
          const p = placeBeside({ x, y, radius: 23 }, size, container);
          expect(p.left).toBeGreaterThanOrEqual(8);
          expect(p.top).toBeGreaterThanOrEqual(8);
          expect(p.left + size.width).toBeLessThanOrEqual(container.width - 8);
          expect(p.top + size.height).toBeLessThanOrEqual(container.height - 8);
        }
      }
    });
  }

  it('prefers the right side, then the left, without covering the node', () => {
    const container = { width: 1280, height: 720 };
    expect(placeBeside({ x: 100, y: 300, radius: 23 }, size, container)).toMatchObject({ side: 'right', left: 133 });
    const left = placeBeside({ x: 1200, y: 300, radius: 23 }, size, container);
    expect(left.side).toBe('left');
    expect(left.left + size.width).toBeLessThanOrEqual(1200 - 23);
  });

  it('keeps a context menu inside the panel', () => {
    const p = placeAtPoint({ x: 1270, y: 710 }, { width: 180, height: 140 }, { width: 1280, height: 720 });
    expect(p.left + 180).toBeLessThanOrEqual(1280);
    expect(p.top + 140).toBeLessThanOrEqual(720);
  });
});

describe('popoverRows', () => {
  it('lists id, type, placement and why a relationship is not buildable (read-only facts)', () => {
    const doc = v2Doc({ ...v2Raw(), nodes: [v2Raw().nodes[0], { id: 'b', displayId: '02', grid: [0, 0, 3], typeId: 'studio' }] });
    const model = v2Model(doc);
    const rows = popoverRows(model, model.byNode.get('a')!, { brokenType: false, attributeKeys: [] });
    expect(rows.map((r) => r.label)).toEqual(['Permanent id', 'Type', 'Placement', 'Relationships', '↔ 02']);
    expect(rows.find((r) => r.label === 'Placement')?.value).toBe('cell [0, 0, 0] · 2×3×1 cells · storey 0');
    expect(rows.at(-1)).toMatchObject({ tone: 'unresolved' });
  });

  it('flags a broken type without hiding the node', () => {
    const model = modelFromV1(v1Example());
    const rows = popoverRows(model, model.nodes[0]!, { brokenType: true, attributeKeys: ['public'] });
    expect(rows.find((r) => r.tone === 'warning')).toBeDefined();
    // Selected attribute keys first.
    expect(rows.findIndex((r) => r.label === 'public')).toBeLessThan(rows.findIndex((r) => r.label === 'daylight'));
  });
});

describe('context menu items', () => {
  it('node menu offers Inspect and Add connection, and nothing for a deleted node', () => {
    const model = v2Model(v2Doc());
    const labels = menuItems(model, { kind: 'node', id: 'a' }).map((i) => i.label);
    expect(labels).toEqual(['Inspect', 'Add connection…', 'Add node next to it', 'Delete node']);
    expect(menuItems(model, { kind: 'node', id: 'gone' })).toEqual([]);
  });

  it('v2 edge menu toggles Access ↔ Open', () => {
    const items = menuItems(v2Model(v2Doc()), { kind: 'edge', id: 'ab' });
    expect(items.map((i) => [i.label, !!i.disabled])).toEqual([
      ['✓ Access', true],
      ['Open', false],
      ['Delete relationship', false],
    ]);
    expect(items[1]!.action).toEqual({ type: 'set-relationship-kind', edgeId: 'ab', kind: 'open' });
  });

  it('v1 edge menu disables kinds the cells cannot take', () => {
    const items = menuItems(modelFromV1(v1Example()), { kind: 'edge', id: 'entry-to-studio' });
    const byLabel = new Map(items.map((i) => [i.label.replace('✓ ', ''), i]));
    expect(byLabel.get('Open (no wall)')?.disabled).toBe(false);
    expect(byLabel.get('Atrium (open void)')?.disabled).toBe(true);
  });
});

// ── Scale ───────────────────────────────────────────────────────────────────────────────────

describe('6, 20 and 50 node diagrams', () => {
  for (const n of [6, 20, 50]) {
    it(`${n} nodes: distinct stable positions, bounded circles, unresolved edges valid`, () => {
      const doc = separatedRooms(n);
      const model = v2Model(doc);
      const positions = resolveDiagramPositions(model);
      const keys = new Set([...positions.values()].map((p) => p.join(',')));
      expect(keys.size).toBe(n);
      expect(resolveDiagramPositions(v2Model(separatedRooms(n)))).toEqual(positions);
      for (const node of model.nodes) {
        expect(nodeLines(node, { ...DEFAULT_DISPLAY, showType: true, attributeKeys: ['area'] }).diameter).toBeLessThanOrEqual(MAX_NODE_DIAMETER);
      }
      expect(model.edges).toHaveLength(n - 1);
      for (const edge of model.edges) expect(presentEdge(model, edge).status).not.toBe('legacy');
      // A further room still finds a free cell.
      expect(suggestFreeCellV2(doc, model.version === 2 ? model.spatial.occupancy : (undefined as never))).toBeDefined();
    });
  }
});
