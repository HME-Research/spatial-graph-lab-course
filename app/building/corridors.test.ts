import { describe, expect, it } from 'vitest';
import {
  corridorLookOf,
  DEFAULT_CORRIDOR_LOOK,
  DEFAULT_CORRIDOR_ROOF,
  DEFAULT_CORRIDOR_WALLS,
  designCorridorLook,
  readDesignJson,
  serializeDesignV2,
  validateDocumentV2,
  type CorridorLook,
  type DesignDocumentV2,
} from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { resolveRelationships } from '@app/spatial';
import { DEFAULT_CELL_SIZE } from '@core/viewer/coordinates';
import { selectEdge } from '@core/viewer/selection';
import { buildBuildingV2 } from './buildingV2';
import { OPENING_PROPORTIONS } from './faceLayout';

/** Corridors as a look card (owner 2026-11-19): schema, resolution per field, geometry of walls × roof. */

const W = DEFAULT_CELL_SIZE.horizontal;
const H = DEFAULT_CELL_SIZE.vertical;

/** Rooms 1 at x=0 and 2 at x=4, related by edge 1: the real resolver routes a 3-cell corridor along x. */
function raw(corridors?: unknown, corridor?: unknown) {
  return {
    schemaVersion: 2,
    metadata: { name: 'corridors' },
    nodes: [
      { id: 1, position: [0, 0, 0], size: [1, 1, 1], function: 'gallery', custom: {} },
      { id: 2, position: [4, 0, 0], size: [1, 1, 1], function: 'studio', custom: {} },
    ],
    edges: [{ id: 1, source: 1, target: 2, relationship: 'access', ...(corridor === undefined ? {} : { corridor }), custom: {} }],
    diagram: { positions: {} },
    settings: { styleBy: 'function', styles: {}, ...(corridors === undefined ? {} : { corridors }) },
  };
}
const doc = (corridors?: CorridorLook, own?: CorridorLook): DesignDocumentV2 => expectOk(validateDocumentV2(raw(corridors, own)));
const parts = (d: DesignDocumentV2) => {
  const counts: Record<string, number> = {};
  for (const c of buildBuildingV2(d).connectors) counts[c.part] = (counts[c.part] ?? 0) + 1;
  return counts;
};

describe('settings.corridors and edge corridor: schema and file round trip', () => {
  it('are optional: a design without them is valid and written without them', () => {
    const d = doc();
    expect(d.settings.corridors).toBeUndefined();
    expect(d.edges[0]!.corridor).toBeUndefined();
    const text = serializeDesignV2(d);
    expect(text).not.toContain('"corridors":');
    expect(text).not.toContain('"corridor":');
  });

  it('round-trip walls and roof exactly, in a fixed key order (card and relationship)', () => {
    const d = doc({ roof: 'pergola', walls: 'enclosed' }, { roof: 'none', walls: 'open' });
    const text = serializeDesignV2(d);
    expect(text).toContain('"corridors": {\n      "walls": "enclosed",\n      "roof": "pergola"\n    }');
    expect(text).toContain('"corridor": {\n        "walls": "open",\n        "roof": "none"\n      }');
    const read = expectOk(readDesignJson(text)).doc;
    expect(read.settings.corridors).toEqual({ walls: 'enclosed', roof: 'pergola' });
    expect(read.edges[0]!.corridor).toEqual({ walls: 'open', roof: 'none' });
    expect(serializeDesignV2(read)).toBe(text);
  });

  it('one field alone round-trips; empty objects are accepted and not written back', () => {
    const one = serializeDesignV2(doc({ roof: 'none' }, { walls: 'enclosed' }));
    expect(one).toContain('"corridors": {\n      "roof": "none"\n    }');
    expect(one).toContain('"corridor": {\n        "walls": "enclosed"\n      }');
    const empty = serializeDesignV2(doc({}, {}));
    expect(empty).not.toContain('"corridors":');
    expect(empty).not.toContain('"corridor":');
  });

  it.each([
    [{ walls: 'glass' }, 'walls must be one of'],
    [{ roof: 'pitched' }, 'roof must be one of'],
    [{ style: 'covered' }, ''],
    [{ colour: 'red' }, ''],
    ['covered', ''],
  ])('rejects invalid corridors %j (card and relationship)', (value, message) => {
    for (const r of [validateDocumentV2(raw(value)), validateDocumentV2(raw(undefined, value))]) {
      expect(r.ok).toBe(false);
      if (!r.ok && message) expect(r.issues.map((i) => i.message).join(' ')).toContain(message);
    }
  });

  it('the retired connectorStyle field is refused (strict edge schema)', () => {
    const r = raw();
    const bad = { ...r, edges: r.edges.map((e) => ({ ...e, connectorStyle: 'covered' })) };
    expect(validateDocumentV2(bad).ok).toBe(false);
  });
});

describe('corridor look resolution, per field: relationship → Corridors card → built-in', () => {
  it('built-in defaults are Open walls and a Flat roof', () => {
    expect(DEFAULT_CORRIDOR_WALLS).toBe('open');
    expect(DEFAULT_CORRIDOR_ROOF).toBe('flat');
    expect(DEFAULT_CORRIDOR_LOOK).toEqual({ walls: 'open', roof: 'flat' });
    expect(designCorridorLook(undefined)).toEqual({ walls: 'open', roof: 'flat' });
    expect(designCorridorLook({ corridors: {} })).toEqual({ walls: 'open', roof: 'flat' });
  });

  it('each field independently: own value, then the card, then built-in', () => {
    expect(corridorLookOf({}, undefined)).toEqual({ walls: 'open', roof: 'flat' });
    expect(corridorLookOf({}, { corridors: { walls: 'enclosed' } })).toEqual({ walls: 'enclosed', roof: 'flat' });
    expect(corridorLookOf({ corridor: { roof: 'pergola' } }, { corridors: { walls: 'enclosed' } })).toEqual({ walls: 'enclosed', roof: 'pergola' });
    expect(corridorLookOf({ corridor: { walls: 'open' } }, { corridors: { walls: 'enclosed', roof: 'none' } })).toEqual({ walls: 'open', roof: 'none' });
    expect(corridorLookOf({ corridor: { walls: 'enclosed', roof: 'none' } }, { corridors: { walls: 'open', roof: 'pergola' } })).toEqual({
      walls: 'enclosed',
      roof: 'none',
    });
  });

  it('the resolver gives each route its effective look', () => {
    const look = (d: DesignDocumentV2) => {
      const r = resolveRelationships(d).byEdge.get(1)!;
      return r.status === 'routed' ? r.route.look : null;
    };
    expect(look(doc())).toEqual({ walls: 'open', roof: 'flat' });
    expect(look(doc({ walls: 'enclosed' }))).toEqual({ walls: 'enclosed', roof: 'flat' });
    expect(look(doc({ walls: 'enclosed' }, { roof: 'none' }))).toEqual({ walls: 'enclosed', roof: 'none' });
  });
});

describe('corridor geometry: walls × roof', () => {
  it('default (open + flat): one roof slab per cell on posts', () => {
    expect(parts(doc())).toEqual({ 'connector-floor': 3, 'connector-roof': 3, 'connector-post': 8 });
  });

  it('open + pergola: slats across the corridor, sized and counted like a room pergola bay; posts stay; picking selects the relationship', () => {
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
    expect(slats.every((s) => s.target.kind === 'edge' && s.target.id === 1 && s.look.roof === 'pergola' && s.look.walls === 'open')).toBe(true);
    expect(model.connectors.every((c) => JSON.stringify(c.target) === JSON.stringify(selectEdge(1)))).toBe(true);
  });

  it('open + none: the floor only (no roof, so no posts)', () => {
    expect(parts(doc({ roof: 'none' }))).toEqual({ 'connector-floor': 3 });
    expect(parts(doc({ walls: 'open', roof: 'none' }))).toEqual({ 'connector-floor': 3 });
  });

  it('enclosed: flat / pergola / none roof; the side walls always stay and there are no posts', () => {
    expect(parts(doc({ walls: 'enclosed' }))).toEqual({ 'connector-floor': 3, 'connector-roof': 3, 'connector-wall': 6 });
    expect(parts(doc({ walls: 'enclosed', roof: 'pergola' }))).toEqual({
      'connector-floor': 3,
      'connector-roof': 3 * OPENING_PROPORTIONS.pergolaSlats,
      'connector-wall': 6,
    });
    expect(parts(doc({ walls: 'enclosed', roof: 'none' }))).toEqual({ 'connector-floor': 3, 'connector-wall': 6 });
  });

  it('the relationship’s own field mixes with the card’s other field', () => {
    // Card: enclosed + pergola; the relationship opens its walls only → open + pergola.
    expect(parts(doc({ walls: 'enclosed', roof: 'pergola' }, { walls: 'open' }))).toEqual({
      'connector-floor': 3,
      'connector-roof': 3 * OPENING_PROPORTIONS.pergolaSlats,
      'connector-post': 8,
    });
    // Card: open + none; the relationship sets a flat roof only → open + flat (posts return).
    expect(parts(doc({ roof: 'none' }, { roof: 'flat' }))).toEqual({ 'connector-floor': 3, 'connector-roof': 3, 'connector-post': 8 });
  });

  it('the building reports each corridor’s effective look', () => {
    const model = buildBuildingV2(doc({ walls: 'enclosed' }, { roof: 'pergola' }));
    expect(model.relationships[0]).toMatchObject({ geometry: 'connector', corridor: { walls: 'enclosed', roof: 'pergola' } });
  });
});
