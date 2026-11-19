import { describe, expect, it } from 'vitest';
import {
  connectorStyleOf,
  corridorRoofOf,
  corridorStyleOf,
  DEFAULT_CONNECTOR_STYLE,
  DEFAULT_CORRIDOR_ROOF,
  readDesignJson,
  serializeDesignV2,
  validateDocumentV2,
  type ConnectorStyle,
  type CorridorSettings,
  type DesignDocumentV2,
} from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { resolveRelationships } from '@app/spatial';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import { selectEdge } from '@core/viewer/selection';
import { buildBuildingV2 } from './buildingV2';
import { OPENING_PROPORTIONS } from './faceLayout';

/** Design-wide corridors (Building Designer → Corridors, 2026-11-19): schema, resolution, geometry. */

const W = DEFAULT_CELL_SIZE.horizontal;
const H = DEFAULT_CELL_SIZE.vertical;

/** Rooms 1 at x=0 and 2 at x=4, related by edge 1: the real resolver routes a 3-cell corridor along x. */
function raw(corridors?: unknown, connectorStyle?: ConnectorStyle) {
  return {
    schemaVersion: 2,
    metadata: { name: 'corridors' },
    nodes: [
      { id: 1, grid: [0, 0, 0], size: [1, 1, 1], typeId: 'gallery', attributes: {} },
      { id: 2, grid: [4, 0, 0], size: [1, 1, 1], typeId: 'studio', attributes: {} },
    ],
    edges: [{ id: 1, source: 1, target: 2, kind: 'access', ...(connectorStyle ? { connectorStyle } : {}), attributes: {} }],
    diagram: { positions: {} },
    settings: { styleBy: 'function', styles: {}, ...(corridors === undefined ? {} : { corridors }) },
  };
}
const doc = (corridors?: CorridorSettings, own?: ConnectorStyle): DesignDocumentV2 => expectOk(validateDocumentV2(raw(corridors, own)));
const parts = (d: DesignDocumentV2) => {
  const counts: Record<string, number> = {};
  for (const c of buildBuildingV2(d).connectors) counts[c.part] = (counts[c.part] ?? 0) + 1;
  return counts;
};

describe('settings.corridors: schema and file round trip', () => {
  it('is optional and additive: a design without it is valid and written without it', () => {
    const d = doc();
    expect(d.settings.corridors).toBeUndefined();
    expect(serializeDesignV2(d)).not.toContain('"corridors":');
  });

  it('round-trips style and roof exactly, in a fixed key order', () => {
    const d = doc({ roof: 'pergola', style: 'enclosed' });
    const text = serializeDesignV2(d);
    expect(text).toContain('"corridors": {\n      "style": "enclosed",\n      "roof": "pergola"\n    }');
    const read = expectOk(readDesignJson(text)).doc;
    expect(read.settings.corridors).toEqual({ style: 'enclosed', roof: 'pergola' });
    expect(serializeDesignV2(read)).toBe(text);
  });

  it('an empty corridors object is accepted and not written back', () => {
    expect(serializeDesignV2(doc({}))).not.toContain('"corridors":');
  });

  it.each([
    [{ style: 'tunnel' }, 'connectorStyle must be one of'],
    [{ roof: 'pitched' }, 'roof must be one of'],
    [{ colour: 'red' }, ''],
    ['covered', ''],
  ])('rejects invalid corridors %j', (corridors, message) => {
    const r = validateDocumentV2(raw(corridors));
    expect(r.ok).toBe(false);
    if (!r.ok && message) expect(r.issues.map((i) => i.message).join(' ')).toContain(message);
  });
});

describe('corridor style resolution: relationship → design → built-in', () => {
  it('built-in defaults are Covered and Flat', () => {
    expect(DEFAULT_CONNECTOR_STYLE).toBe('covered');
    expect(DEFAULT_CORRIDOR_ROOF).toBe('flat');
    expect(corridorStyleOf(undefined)).toBe('covered');
    expect(corridorRoofOf(undefined)).toBe('flat');
  });

  it('the relationship’s own style wins, then the design’s style, then Covered', () => {
    expect(connectorStyleOf({}, undefined)).toBe('covered');
    expect(connectorStyleOf({}, { corridors: {} })).toBe('covered');
    expect(connectorStyleOf({}, { corridors: { style: 'enclosed' } })).toBe('enclosed');
    expect(connectorStyleOf({ connectorStyle: 'deck' }, { corridors: { style: 'enclosed' } })).toBe('deck');
  });

  it('the resolver gives each route its effective style', () => {
    const route = (d: DesignDocumentV2) => {
      const r = resolveRelationships(d).byEdge.get(1)!;
      return r.status === 'routed' ? r.route.style : null;
    };
    expect(route(doc())).toBe('covered');
    expect(route(doc({ style: 'enclosed' }))).toBe('enclosed');
    expect(route(doc({ style: 'enclosed' }, 'deck'))).toBe('deck');
  });
});

describe('corridor geometry by roof', () => {
  it('default (covered, flat): one roof slab per cell on posts', () => {
    expect(parts(doc())).toEqual({ 'connector-floor': 3, 'connector-roof': 3, 'connector-post': 8 });
  });

  it('pergola: slats across the corridor, sized and counted like a room pergola bay; posts stay; picking selects the relationship', () => {
    const model = buildBuildingV2(doc({ roof: 'pergola' }));
    const slats = model.connectors.filter((c) => c.part === 'connector-roof');
    const n = OPENING_PROPORTIONS.pergolaSlats;
    const w = W * OPENING_PROPORTIONS.pergolaSlatFraction;
    expect(slats).toHaveLength(3 * n);
    expect(model.connectors.filter((c) => c.part === 'connector-post')).toHaveLength(8);
    // Each slat: narrow along the route (Three X), full width across it, at roof height.
    for (const s of slats) {
      expect(s.size[0]).toBeCloseTo(w, 9);
      expect(s.size[2]).toBe(W);
      expect(s.position[1]).toBe(H);
    }
    // The first cell's slats span it edge to edge.
    const first = slats.filter((s) => s.cell[0] === 1).map((s) => s.position[0]);
    expect(Math.min(...first) - w / 2).toBeCloseTo(0.5 * W, 9);
    expect(Math.max(...first) + w / 2).toBeCloseTo(1.5 * W, 9);
    expect(new Set(slats.map((s) => s.id)).size).toBe(slats.length);
    expect(slats.every((s) => s.target.kind === 'edge' && s.target.id === 1 && s.style === 'covered')).toBe(true);
    expect(model.connectors.every((c) => c.target.kind === selectEdge(1).kind)).toBe(true);
  });

  it('covered + none: no roof and no posts (drawn like a deck)', () => {
    expect(parts(doc({ roof: 'none' }))).toEqual({ 'connector-floor': 3 });
    expect(parts(doc({ roof: 'none' }))).toEqual(parts(doc({ style: 'deck' })));
  });

  it('enclosed: flat / pergola / none roof; the side walls always stay', () => {
    expect(parts(doc({ style: 'enclosed' }))).toEqual({ 'connector-floor': 3, 'connector-roof': 3, 'connector-wall': 6 });
    expect(parts(doc({ style: 'enclosed', roof: 'pergola' }))).toEqual({
      'connector-floor': 3,
      'connector-roof': 3 * OPENING_PROPORTIONS.pergolaSlats,
      'connector-wall': 6,
    });
    expect(parts(doc({ style: 'enclosed', roof: 'none' }))).toEqual({ 'connector-floor': 3, 'connector-wall': 6 });
  });

  it('a deck never gets a roof, whatever the corridor roof', () => {
    for (const roof of ['flat', 'pergola', 'none'] as const) expect(parts(doc({ style: 'deck', roof }))).toEqual({ 'connector-floor': 3 });
  });

  it('the relationship’s own style uses the design’s corridor roof', () => {
    expect(parts(doc({ style: 'deck', roof: 'pergola' }, 'covered'))['connector-roof']).toBe(3 * OPENING_PROPORTIONS.pergolaSlats);
  });
});
