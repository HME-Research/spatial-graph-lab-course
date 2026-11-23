import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { issue, validateDocumentV2 } from '@app/document';
import { resolveRelationships, type EdgeResolution, type SpatialResolution, type UnresolvedReason } from '@app/spatial';
import { NO_SELECTION, selectEdge, selectNode } from '@core/viewer/selection';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import { HORIZONTAL_EDGE_COLOR, VERTICAL_EDGE_COLOR } from '../three/edgeStyle';
import { MISSING_COLOR } from '../three/colorBy';
import { VIEW_MODES } from '../contracts';
import {
  analysisNodeStyle,
  conciseIssues,
  corridorLooksInUse,
  contrastRatio,
  ERROR_TONE,
  presentAnalysis,
  presentEdgeById,
  presentRelationship,
  relationshipLegend,
  relationshipLine,
  RELATIONSHIP_NEUTRAL_COLOR,
  ROUTED_DASH_2D,
  ROUTED_DASH_3D,
  SAME_STOREY_COLOR,
  BETWEEN_STOREYS_COLOR,
  STATUS_PRESENTATION,
  summarizeRelationships,
  textColorOn,
  UNRESOLVED_COLOR,
  UNRESOLVED_DASH_2D,
  UNRESOLVED_DASH_3D,
  UNRESOLVED_LINE,
  UNRESOLVED_REASON_TEXT,
  unresolvedReasonText,
  type AnalysisInput,
} from './index';
import { AnalysisLegend, RelationshipLegend } from './LegendViews';

const direct = (edgeId: number, kind: 'access' | 'open', contact: 'horizontal' | 'vertical'): EdgeResolution => ({
  edgeId,
  relationship: kind,
  status: 'direct',
  contact,
  faces: [],
});
type Walls = 'enclosed' | 'open';
type Roof = 'flat' | 'pergola' | 'none';
const routed = (edgeId: number, walls: Walls, roof: Roof, cells = 3): EdgeResolution => ({
  edgeId,
  relationship: 'access',
  status: 'routed',
  route: {
    edgeId,
    axis: 'x',
    level: 0,
    cells: Array.from({ length: cells }, (_, i) => [i + 1, 0, 0] as const),
    from: { nodeId: 1, cell: [0, 0, 0], direction: [1, 0, 0] } as never,
    to: { nodeId: 2, cell: [cells + 1, 0, 0], direction: [-1, 0, 0] } as never,
    look: { walls, roof, width: 1.5 },
  },
});
const unresolved = (edgeId: number, reason: UnresolvedReason): EdgeResolution => ({
  edgeId,
  relationship: 'open',
  status: 'unresolved',
  reason,
  message: `engine says ${reason}`,
});

function spatialOf(edges: EdgeResolution[]): SpatialResolution {
  return {
    edges,
    byEdge: new Map(edges.map((e) => [e.edgeId, e] as const)),
    occupancy: { cells: new Map(), at: () => undefined },
  };
}

describe('vocabulary and line tokens', () => {
  it('keeps the existing 3D contact colours', () => {
    expect(SAME_STOREY_COLOR).toBe(HORIZONTAL_EDGE_COLOR);
    expect(BETWEEN_STOREYS_COLOR).toBe(VERTICAL_EDGE_COLOR);
  });

  // Gate 1 scheme: Direct solid neutral · Routed long-dashed neutral · Unresolved short-dashed muted
  // red; kind (Access/Open) independently by weight, for every status.
  it('encodes status by dash and colour: direct solid neutral, routed long-dashed neutral, unresolved short-dashed red', () => {
    for (const kind of ['access', 'open'] as const) {
      for (const contact of ['horizontal', 'vertical'] as const) {
        const direct = relationshipLine(kind, 'direct', contact);
        expect(direct.dash2d).toBeNull();
        expect(direct.dash3d).toBeNull();
        expect(direct.color).toBe(RELATIONSHIP_NEUTRAL_COLOR);
      }
      const routed = relationshipLine(kind, 'routed');
      expect(routed.color).toBe(RELATIONSHIP_NEUTRAL_COLOR);
      expect(routed.dash2d).toBe(ROUTED_DASH_2D);
      expect(routed.dash3d).toEqual(ROUTED_DASH_3D);
      const unresolved = relationshipLine(kind, 'unresolved');
      expect(unresolved.color).toBe(UNRESOLVED_COLOR);
      expect(unresolved.dash2d).toBe(UNRESOLVED_DASH_2D);
      expect(unresolved.dash3d).toEqual(UNRESOLVED_DASH_3D);
    }
    const dashLength = (d: string) => Number(d.split(' ')[0]);
    expect(dashLength(ROUTED_DASH_2D)).toBeGreaterThan(dashLength(UNRESOLVED_DASH_2D));
    expect(ROUTED_DASH_3D[0]).toBeGreaterThan(UNRESOLVED_DASH_3D[0]);
    expect(relationshipLine('access', 'unresolved')).toEqual(UNRESOLVED_LINE);
    expect(UNRESOLVED_LINE.width2d).toBeLessThan(relationshipLine('access', 'direct').width2d);
    expect(contrastRatio(RELATIONSHIP_NEUTRAL_COLOR, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('encodes kind by weight, independently of status', () => {
    for (const status of ['direct', 'routed', 'unresolved'] as const) {
      expect(relationshipLine('open', status).width2d).toBeGreaterThan(relationshipLine('access', status).width2d);
      expect(relationshipLine('open', status).radius3d).toBeGreaterThan(relationshipLine('access', status).radius3d);
      expect(relationshipLine('open', status).dash2d).toBe(relationshipLine('access', status).dash2d);
      expect(relationshipLine('open', status).color).toBe(relationshipLine('access', status).color);
    }
    for (const status of ['direct', 'routed', 'unresolved'] as const) expect(relationshipLine('access', status).marker).toBe('none');
  });

  it('unresolved colour is legible and distinct from selection and error tones', () => {
    for (const bg of ['#ffffff', '#f7f7f5']) expect(contrastRatio(UNRESOLVED_COLOR, bg)).toBeGreaterThanOrEqual(4.5);
    expect(UNRESOLVED_COLOR).not.toBe(SELECTION_COLOR);
    expect(UNRESOLVED_COLOR).not.toBe(ERROR_TONE.border);
    // Perceptibly different from the selection pink (not just a different hex string).
    expect(contrastRatio(UNRESOLVED_COLOR, SELECTION_COLOR)).toBeGreaterThan(1.5);
    expect(contrastRatio(ERROR_TONE.text, ERROR_TONE.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('computes WCAG contrast and readable text colours', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(textColorOn('#3a2c7a')).toBe('#ffffff');
    expect(textColorOn('#f6e3a1')).toBe('#1d1d1b');
    expect(() => contrastRatio('red', '#fff')).toThrow();
  });

  it('has short text for every unresolved reason and a fallback for unknown ones', () => {
    for (const text of Object.values(UNRESOLVED_REASON_TEXT)) expect(text.length).toBeLessThanOrEqual(110);
    expect(unresolvedReasonText('teleport-missing')).toMatch(/cannot be built/);
    expect(unresolvedReasonText('constructor')).toMatch(/cannot be built/);
  });
});

describe('relationship presentation', () => {
  it('describes direct, routed and unresolved edges in plain words', () => {
    const d = presentRelationship(direct(1, 'access', 'horizontal'));
    expect(d.statusLabel).toBe('Direct');
    expect(d.built).toBe('door in the shared wall');
    expect(d.reason).toBeNull();
    expect(presentRelationship(direct(2, 'open', 'vertical')).built).toMatch(/void/);

    const r = presentRelationship(routed(3, 'open', 'flat', 4));
    expect(r.statusLabel).toBe('Connected via route');
    expect(r.built).toBe('Open corridor, flat roof (4 cells)');
    expect(presentRelationship(routed(4, 'open', 'none', 1)).built).toBe('Open corridor, no roof (1 cell)');
    expect(presentRelationship(routed(5, 'enclosed', 'pergola', 2)).built).toBe('Enclosed corridor, pergola roof (2 cells)');

    const u = presentRelationship(unresolved(5, 'different-level'));
    expect(u.statusLabel).toBe('Unresolved');
    expect(u.line).toEqual(relationshipLine('open', 'unresolved'));
    expect(u.reason).toBe(UNRESOLVED_REASON_TEXT['different-level']);
    expect(u.detail).toBe('engine says different-level');
    expect(u.tooltip).toBe(`Open · Unresolved — ${UNRESOLVED_REASON_TEXT['different-level']}`);
  });

  it('returns null for unknown edge ids', () => {
    const spatial = spatialOf([direct(1, 'access', 'horizontal')]);
    expect(presentEdgeById(spatial, 1)?.edgeId).toBe(1);
    expect(presentEdgeById(spatial, 99)).toBeNull();
  });

  it('summarises statuses in one sentence and lists unresolved ids in order', () => {
    const spatial = spatialOf([
      direct(1, 'access', 'horizontal'),
      unresolved(9, 'not-aligned'),
      routed(2, 'enclosed', 'flat'),
      unresolved(3, 'blocked-by-room'),
      routed(4, 'open', 'none'),
      routed(6, 'enclosed', 'flat'),
    ]);
    const s = summarizeRelationships(spatial);
    expect(s.counts).toEqual({ direct: 1, routed: 3, unresolved: 2 });
    expect(s.unresolvedIds).toEqual([9, 3]);
    expect(s.sentence).toBe('6 edges: 1 direct, 3 via route, 2 unresolved.');
    expect(summarizeRelationships(spatialOf([])).sentence).toBe('No edges yet.');
    // Distinct looks, in legend order (enclosed first; flat, pergola, none).
    expect(corridorLooksInUse(spatial)).toEqual([
      { walls: 'enclosed', roof: 'flat' },
      { walls: 'open', roof: 'none' },
    ]);
  });

  it('works on a real resolution of a valid v2 document (direct + separated)', () => {
    const raw = {
      schemaVersion: 2,
      metadata: { name: 't' },
      nodes: [
        { id: 1, position: [0, 0, 0], function: 'x' },
        { id: 2, position: [1, 0, 0], function: 'x' },
        { id: 3, position: [5, 5, 1], function: 'x' },
      ],
      edges: [
        { id: 1, source: 1, target: 2, relationship: 'access' },
        { id: 2, source: 1, target: 3, relationship: 'open' },
      ],
      diagram: { positions: {} },
    };
    const doc = validateDocumentV2(raw);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const spatial = resolveRelationships(doc.value);
    expect(presentEdgeById(spatial, 1)?.status).toBe('direct');
    const ac = presentEdgeById(spatial, 2)!;
    expect(ac.status).toBe('unresolved');
    expect(ac.line).toEqual(relationshipLine('open', 'unresolved'));
    expect(ac.reason).toBe(UNRESOLVED_REASON_TEXT['different-level']);
  });
});

describe('view legends', () => {
  it('uses identical labels and line tokens for each status in every view', () => {
    const tokens = VIEW_MODES.map((v) => {
      const status = relationshipLegend(v).sections.find((s) => s.id === 'status')!;
      return status.items.map((i) => [i.id, i.label, i.swatch]);
    });
    for (const t of tokens) expect(t).toEqual(tokens[0]);
    const labels = tokens[0]!.map((t) => t[1]);
    expect(labels).toEqual([STATUS_PRESENTATION.direct.label, STATUS_PRESENTATION.routed.label, STATUS_PRESENTATION.unresolved.label]);
  });

  it('uses dashed swatches only for the Routed (long) and Unresolved (short) statuses', () => {
    for (const v of VIEW_MODES) {
      for (const s of relationshipLegend(v).sections) {
        for (const i of s.items) {
          const dashed = i.swatch.shape === 'line' && i.swatch.line.dash2d !== null;
          expect(dashed, `${v} ${i.id}`).toBe(i.id === 'status:unresolved' || i.id === 'status:routed');
        }
      }
    }
  });

  it('shows corridor looks only in building views and filters by use and counts', () => {
    expect(relationshipLegend('graph2d').sections.map((s) => s.id)).toEqual(['status', 'kind', 'selection']);
    expect(relationshipLegend('architecture').sections.map((s) => s.id)).toEqual(['status', 'kind', 'connector', 'selection']);
    const compact = relationshipLegend('voxels', {
      compact: true,
      corridorLooks: [{ walls: 'open', roof: 'none' }],
      statusCounts: { direct: 2, routed: 0, unresolved: 1 },
    });
    expect(compact.sections.map((s) => s.id)).toEqual(['status', 'connector']);
    expect(compact.sections[1]!.items.map((i) => [i.id, i.label])).toEqual([['connector:open-none', 'Open corridor, no roof']]);
    // Without a filter every walls × roof combination is listed.
    expect(relationshipLegend('architecture').sections.find((s) => s.id === 'connector')!.items).toHaveLength(6);
    expect(compact.sections[0]!.items.map((i) => [i.id, i.count])).toEqual([
      ['status:direct', 2],
      ['status:unresolved', 1],
    ]);
    expect(relationshipLegend('architecture', { corridorLooks: [] }).sections.map((s) => s.id)).not.toContain('connector');
  });

  it('renders accessible legend markup with focusable items', () => {
    const html = renderToStaticMarkup(
      createElement(RelationshipLegend, { legend: relationshipLegend('graph2d'), helpDetails: { unresolved: 'LONG DETAILS' } }),
    );
    expect(html).toContain('data-legend-item="status:unresolved"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain(`stroke-dasharray="${UNRESOLVED_DASH_2D}"`);
    expect(html).toContain('More details');
    expect(html).toContain('LONG DETAILS');
  });
});

describe('analysis presentation', () => {
  const base: AnalysisInput = {
    title: 'Access depth',
    nodeValues: { 1: 0, 2: 1, 3: 2, 4: null },
    ranOnNodeIds: [1, 2, 3, 4],
    currentNodeIds: [1, 2, 3, 4],
    stale: false,
  };

  it('is deterministic and does not mutate its input', () => {
    const input = structuredClone(base);
    const frozen = Object.freeze({ ...input, nodeValues: Object.freeze({ ...input.nodeValues }) });
    const p1 = presentAnalysis(frozen);
    const p2 = presentAnalysis(structuredClone(base));
    expect(input).toEqual(base);
    expect([...p1.colorOf]).toEqual([...p2.colorOf]);
    expect(p1.legend).toEqual(p2.legend);
  });

  it('maps numbers to a sequential scale and null to a "no value" grey', () => {
    const p = presentAnalysis(base);
    expect(p.valueKind).toBe('numeric');
    expect(p.scale).toEqual({ min: 0, max: 2 });
    expect(p.colorOf.get(4)).toBe(MISSING_COLOR);
    expect(p.valueLabelOf.get(4)).toBe('no value');
    expect(p.legend.at(-1)).toMatchObject({ missing: true, count: 1 });
    expect(new Set([p.colorOf.get(1), p.colorOf.get(2), p.colorOf.get(3)]).size).toBe(3);
    expect(p.staleMessage).toBeNull();
  });

  it('handles unknown ids, deleted nodes, new nodes and non-finite numbers gracefully', () => {
    const p = presentAnalysis({
      ...base,
      nodeValues: { 1: 1, 2: Number.POSITIVE_INFINITY, 9: 5 }, // 9: a node the run never saw
      currentNodeIds: [1, 3, 5], // 2 deleted, 5 new
      stale: true,
    });
    expect(p.unknownIds).toEqual([9]);
    expect(p.deletedIds).toEqual([2]);
    expect(p.colorOf.has(9)).toBe(false);
    expect(p.colorOf.get(5)).toBe(MISSING_COLOR);
    expect(p.valueLabelOf.get(3)).toBe('no value');
    expect(p.rows.find((r) => r.nodeId === 2)).toMatchObject({ exists: false, missing: true });
    expect(p.stale).toBe(true);
    expect(p.staleMessage).toMatch(/Out of date/);
    expect(p.overlayOpacity).toBeLessThan(presentAnalysis(base).overlayOpacity);
    expect(p.scale).toBeNull(); // a single finite value
  });

  it('handles booleans, categories (1 vs "1") and empty results', () => {
    const b = presentAnalysis({ ...base, nodeValues: { 1: true, 2: false, 3: true } });
    expect(b.valueKind).toBe('boolean');
    expect(b.legend.map((e) => [e.label, e.count])).toEqual([['yes', 2], ['no', 1], ['no value (unreachable, null or not reported)', 1]]);
    const c = presentAnalysis({ ...base, nodeValues: { 1: 1, 2: '1', 3: 'x', 4: 1 } });
    expect(c.valueKind).toBe('categorical');
    expect(c.colorOf.get(1)).toBe(c.colorOf.get(4));
    expect(c.colorOf.get(1)).not.toBe(c.colorOf.get(2));
    const e = presentAnalysis({ ...base, nodeValues: {} });
    expect(e.valueKind).toBe('empty');
    expect(e.legend).toEqual([{ label: 'no value (unreachable, null or not reported)', color: MISSING_COLOR, count: 4, missing: true }]);
  });

  it('keeps the selection ring above analysis colours', () => {
    const p = presentAnalysis(base);
    const sel = analysisNodeStyle(1, p, selectNode(1));
    expect(sel.ring).toBe(SELECTION_COLOR);
    expect(sel.fill).toBe(p.colorOf.get(1));
    expect(analysisNodeStyle(2, p, selectNode(1)).ring).toBeNull();
    expect(analysisNodeStyle(1, p, selectEdge(1)).ring).toBeNull();
    expect(analysisNodeStyle(1, null, selectNode(1))).toEqual({ fill: null, fillOpacity: 1, ring: SELECTION_COLOR, valueLabel: null, staleBadge: null });
    expect(analysisNodeStyle(99, p, NO_SELECTION)).toMatchObject({ fill: MISSING_COLOR, valueLabel: 'no value' });
  });

  it('renders a stale analysis legend with a clear action', () => {
    const html = renderToStaticMarkup(createElement(AnalysisLegend, { presentation: presentAnalysis({ ...base, stale: true }), onClear: () => {} }));
    expect(html).toContain('data-analysis-stale="true"');
    expect(html).toContain('Out of date');
    expect(html).toContain('Clear');
    expect(html).toContain('not saved');
  });
});

describe('concise validation feedback', () => {
  it('summarises issues with a headline, plain hints and a remainder count', () => {
    const issues = [
      issue(['nodes', 0, 'id'], 'duplicate-node-id', 'duplicate node id 1'),
      issue(['nodes', 1, 'id'], 'duplicate-node-id', 'duplicate node id 1'),
      issue(['edges', 0], 'dangling-edge', 'edge 1 references unknown node 9'),
      issue([], 'schema', 'bad'),
      issue(['nodes', 2], 'room-overlap', 'overlap'),
    ];
    const f = conciseIssues(issues, { action: 'load design.json' });
    expect(f.tone).toBe('error');
    expect(f.headline).toBe('Could not load design.json: 5 problems. Your current design was kept unchanged.');
    expect(f.lines.map((l) => l.code)).toEqual(['duplicate-node-id', 'dangling-edge', 'schema']);
    expect(f.lines[0]!.where).toBe('nodes[0].id');
    expect(f.more).toBe(2);
    expect(f.text.split('\n')).toHaveLength(5);
  });

  it('handles a single issue and no issues', () => {
    expect(conciseIssues([issue([], 'invalid-json', 'Unexpected token')], { action: 'open the file', kept: false }).headline).toBe(
      'Could not open the file: 1 problem.',
    );
    expect(conciseIssues([], { action: 'apply' }).headline).toBe('Could not apply.');
  });
});
