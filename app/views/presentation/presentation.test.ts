import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { validateDocumentV2 } from '@app/document/v2';
import { resolveRelationships, type EdgeResolution, type SpatialResolution, type UnresolvedReason } from '@app/spatial';
import { issue } from '@app/document';
import { NO_SELECTION, selectEdge, selectNode } from '@core/viewer/selection';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import { HORIZONTAL_EDGE_COLOR, VERTICAL_EDGE_COLOR } from '../three/edgeStyle';
import { MISSING_COLOR } from '../three/colorBy';
import { VIEW_MODES } from '../contracts';
import {
  analysisNodeStyle,
  conciseIssues,
  connectorStylesInUse,
  contrastRatio,
  ERROR_TONE,
  presentAnalysis,
  presentEdgeById,
  presentRelationship,
  relationshipLegend,
  relationshipLine,
  SAME_STOREY_COLOR,
  BETWEEN_STOREYS_COLOR,
  STATUS_PRESENTATION,
  summarizeRelationships,
  textColorOn,
  UNRESOLVED_COLOR,
  UNRESOLVED_LINE,
  UNRESOLVED_REASON_TEXT,
  unresolvedReasonText,
  type AnalysisInput,
} from './index';
import { AnalysisLegend, RelationshipLegend } from './LegendViews';

const direct = (edgeId: string, kind: 'access' | 'open', contact: 'horizontal' | 'vertical'): EdgeResolution => ({
  edgeId,
  kind,
  status: 'direct',
  contact,
  faces: [],
});
const routed = (edgeId: string, style: 'enclosed' | 'covered' | 'deck', cells = 3): EdgeResolution => ({
  edgeId,
  kind: 'access',
  status: 'routed',
  route: {
    edgeId,
    axis: 'x',
    level: 0,
    cells: Array.from({ length: cells }, (_, i) => [i + 1, 0, 0] as const),
    from: { nodeId: 'a', cell: [0, 0, 0], direction: [1, 0, 0] } as never,
    to: { nodeId: 'b', cell: [cells + 1, 0, 0], direction: [-1, 0, 0] } as never,
    style,
  },
});
const unresolved = (edgeId: string, reason: UnresolvedReason): EdgeResolution => ({
  edgeId,
  kind: 'open',
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

  it('dashes ONLY unresolved relationships, thin and muted red, for both kinds', () => {
    for (const kind of ['access', 'open'] as const) {
      for (const status of ['direct', 'routed'] as const) {
        for (const contact of ['horizontal', 'vertical'] as const) {
          const t = relationshipLine(kind, status, contact);
          expect(t.dash2d).toBeNull();
          expect(t.dash3d).toBeNull();
          expect(t.color).not.toBe(UNRESOLVED_COLOR);
        }
      }
      expect(relationshipLine(kind, 'unresolved')).toEqual(UNRESOLVED_LINE);
    }
    expect(UNRESOLVED_LINE.dash2d).not.toBeNull();
    expect(UNRESOLVED_LINE.width2d).toBeLessThan(relationshipLine('access', 'direct').width2d);
  });

  it('encodes kind by width and route by a midpoint ring', () => {
    expect(relationshipLine('open', 'direct').width2d).toBeGreaterThan(relationshipLine('access', 'direct').width2d);
    expect(relationshipLine('open', 'direct').radius3d).toBeGreaterThan(relationshipLine('access', 'direct').radius3d);
    expect(relationshipLine('access', 'routed').marker).toBe('route-ring');
    expect(relationshipLine('access', 'direct').marker).toBe('none');
    expect(relationshipLine('access', 'direct', 'vertical').color).toBe(BETWEEN_STOREYS_COLOR);
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
    const d = presentRelationship(direct('e1', 'access', 'horizontal'));
    expect(d.statusLabel).toBe('Direct');
    expect(d.built).toBe('door in the shared wall');
    expect(d.reason).toBeNull();
    expect(presentRelationship(direct('e2', 'open', 'vertical')).built).toMatch(/void/);

    const r = presentRelationship(routed('e3', 'covered', 4));
    expect(r.statusLabel).toBe('Connected via route');
    expect(r.built).toBe('Covered walkway (4 cells)');
    expect(presentRelationship(routed('e4', 'deck', 1)).built).toBe('Open deck (1 cell)');

    const u = presentRelationship(unresolved('e5', 'different-level'));
    expect(u.statusLabel).toBe('Unresolved');
    expect(u.line).toEqual(UNRESOLVED_LINE);
    expect(u.reason).toBe(UNRESOLVED_REASON_TEXT['different-level']);
    expect(u.detail).toBe('engine says different-level');
    expect(u.tooltip).toBe(`Open · Unresolved — ${UNRESOLVED_REASON_TEXT['different-level']}`);
  });

  it('returns null for unknown edge ids', () => {
    const spatial = spatialOf([direct('e1', 'access', 'horizontal')]);
    expect(presentEdgeById(spatial, 'e1')?.edgeId).toBe('e1');
    expect(presentEdgeById(spatial, 'gone')).toBeNull();
  });

  it('summarises statuses in one sentence and lists unresolved ids in order', () => {
    const spatial = spatialOf([
      direct('e1', 'access', 'horizontal'),
      unresolved('e9', 'not-aligned'),
      routed('e2', 'enclosed'),
      unresolved('e3', 'blocked-by-room'),
      routed('e4', 'deck'),
    ]);
    const s = summarizeRelationships(spatial);
    expect(s.counts).toEqual({ direct: 1, routed: 2, unresolved: 2 });
    expect(s.unresolvedIds).toEqual(['e9', 'e3']);
    expect(s.sentence).toBe('5 relationships: 1 direct, 2 via route, 2 unresolved.');
    expect(summarizeRelationships(spatialOf([])).sentence).toBe('No relationships yet.');
    expect(connectorStylesInUse(spatial)).toEqual(['enclosed', 'deck']);
  });

  it('works on a real resolution of a valid v2 document (direct + separated)', () => {
    const raw = {
      schemaVersion: 2,
      metadata: { name: 't' },
      nodes: [
        { id: 'a', grid: [0, 0, 0], typeId: 'x' },
        { id: 'b', grid: [1, 0, 0], typeId: 'x' },
        { id: 'c', grid: [5, 5, 1], typeId: 'x' },
      ],
      edges: [
        { id: 'ab', source: 'a', target: 'b', kind: 'access' },
        { id: 'ac', source: 'a', target: 'c', kind: 'open' },
      ],
      diagram: { positions: {} },
    };
    const doc = validateDocumentV2(raw);
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const spatial = resolveRelationships(doc.value);
    expect(presentEdgeById(spatial, 'ab')?.status).toBe('direct');
    const ac = presentEdgeById(spatial, 'ac')!;
    expect(ac.status).toBe('unresolved');
    expect(ac.line).toEqual(UNRESOLVED_LINE);
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

  it('never uses a dashed swatch for anything but Unresolved', () => {
    for (const v of VIEW_MODES) {
      for (const s of relationshipLegend(v).sections) {
        for (const i of s.items) {
          const dashed = i.swatch.shape === 'line' && i.swatch.line.dash2d !== null;
          expect(dashed, `${v} ${i.id}`).toBe(i.id === 'status:unresolved');
        }
      }
    }
  });

  it('shows connector styles only in building views and filters by use and counts', () => {
    expect(relationshipLegend('graph2d').sections.map((s) => s.id)).toEqual(['status', 'kind', 'selection']);
    expect(relationshipLegend('architecture').sections.map((s) => s.id)).toEqual(['status', 'kind', 'connector', 'selection']);
    const compact = relationshipLegend('voxels', {
      compact: true,
      connectorStyles: ['deck'],
      statusCounts: { direct: 2, routed: 0, unresolved: 1 },
    });
    expect(compact.sections.map((s) => s.id)).toEqual(['status', 'connector']);
    expect(compact.sections[0]!.items.map((i) => [i.id, i.count])).toEqual([
      ['status:direct', 2],
      ['status:unresolved', 1],
    ]);
    expect(relationshipLegend('architecture', { connectorStyles: [] }).sections.map((s) => s.id)).not.toContain('connector');
  });

  it('renders accessible legend markup with focusable items', () => {
    const html = renderToStaticMarkup(
      createElement(RelationshipLegend, { legend: relationshipLegend('graph2d'), helpDetails: { unresolved: 'LONG DETAILS' } }),
    );
    expect(html).toContain('data-legend-item="status:unresolved"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('stroke-dasharray="6 4"');
    expect(html).toContain('More details');
    expect(html).toContain('LONG DETAILS');
  });
});

describe('analysis presentation', () => {
  const base: AnalysisInput = {
    title: 'Access depth',
    nodeValues: { a: 0, b: 1, c: 2, d: null },
    ranOnNodeIds: ['a', 'b', 'c', 'd'],
    currentNodeIds: ['a', 'b', 'c', 'd'],
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
    expect(p.colorOf.get('d')).toBe(MISSING_COLOR);
    expect(p.valueLabelOf.get('d')).toBe('no value');
    expect(p.legend.at(-1)).toMatchObject({ missing: true, count: 1 });
    expect(new Set([p.colorOf.get('a'), p.colorOf.get('b'), p.colorOf.get('c')]).size).toBe(3);
    expect(p.staleMessage).toBeNull();
  });

  it('handles unknown ids, deleted nodes, new nodes and non-finite numbers gracefully', () => {
    const p = presentAnalysis({
      ...base,
      nodeValues: { a: 1, b: Number.POSITIVE_INFINITY, ghost: 5 },
      currentNodeIds: ['a', 'c', 'new'],
      stale: true,
    });
    expect(p.unknownIds).toEqual(['ghost']);
    expect(p.deletedIds).toEqual(['b']);
    expect(p.colorOf.has('ghost')).toBe(false);
    expect(p.colorOf.get('new')).toBe(MISSING_COLOR);
    expect(p.valueLabelOf.get('c')).toBe('no value');
    expect(p.rows.find((r) => r.nodeId === 'b')).toMatchObject({ exists: false, missing: true });
    expect(p.stale).toBe(true);
    expect(p.staleMessage).toMatch(/Out of date/);
    expect(p.overlayOpacity).toBeLessThan(presentAnalysis(base).overlayOpacity);
    expect(p.scale).toBeNull(); // a single finite value
  });

  it('handles booleans, categories (1 vs "1") and empty results', () => {
    const b = presentAnalysis({ ...base, nodeValues: { a: true, b: false, c: true } });
    expect(b.valueKind).toBe('boolean');
    expect(b.legend.map((e) => [e.label, e.count])).toEqual([['yes', 2], ['no', 1], ['no value (unreachable, null or not reported)', 1]]);
    const c = presentAnalysis({ ...base, nodeValues: { a: 1, b: '1', c: 'x', d: 1 } });
    expect(c.valueKind).toBe('categorical');
    expect(c.colorOf.get('a')).toBe(c.colorOf.get('d'));
    expect(c.colorOf.get('a')).not.toBe(c.colorOf.get('b'));
    const e = presentAnalysis({ ...base, nodeValues: {} });
    expect(e.valueKind).toBe('empty');
    expect(e.legend).toEqual([{ label: 'no value (unreachable, null or not reported)', color: MISSING_COLOR, count: 4, missing: true }]);
  });

  it('keeps the selection ring above analysis colours', () => {
    const p = presentAnalysis(base);
    const sel = analysisNodeStyle('a', p, selectNode('a'));
    expect(sel.ring).toBe(SELECTION_COLOR);
    expect(sel.fill).toBe(p.colorOf.get('a'));
    expect(analysisNodeStyle('b', p, selectNode('a')).ring).toBeNull();
    expect(analysisNodeStyle('a', p, selectEdge('a')).ring).toBeNull();
    expect(analysisNodeStyle('a', null, selectNode('a'))).toEqual({ fill: null, fillOpacity: 1, ring: SELECTION_COLOR, valueLabel: null, staleBadge: null });
    expect(analysisNodeStyle('unknown', p, NO_SELECTION)).toMatchObject({ fill: MISSING_COLOR, valueLabel: 'no value' });
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
      issue(['nodes', 0, 'id'], 'duplicate-node-id', 'duplicate node id "a"'),
      issue(['nodes', 1, 'id'], 'duplicate-node-id', 'duplicate node id "a"'),
      issue(['edges', 0], 'dangling-edge', 'edge "e" references unknown node "z"'),
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
