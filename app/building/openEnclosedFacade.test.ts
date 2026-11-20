import { describe, expect, it } from 'vitest';
import { functionStyleSettings, validateDocumentV2, type DesignDocumentV2, type Look, type RelationshipKind } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { resolveRelationships } from '@app/spatial';
import type { GridCoord } from '@core/spatial';
import { selectNode } from '@core/viewer/selection';
import { buildBuildingV2 } from './buildingV2';
import { wallAction } from './faceInteraction';
import { layoutFace } from './faceLayout';
import { facadeOwnerOfSharedWall, resolveBuildingFaces, type BuildingFace } from './multicellFaces';
import { buildPlan, planSourceV2 } from './plan';

/**
 * A wall between an ENCLOSED room and an OPEN-walled room is the enclosed room's exterior façade
 * (owner 2026-11-20). Terrace 1 (open walls) is west of stair 2 (enclosed): the terrace's id sorts
 * first, so without the rule it would author the shared wall.
 */
const OPEN: Look = { walls: 'open', roof: 'pergola' };

function design(edge: RelationshipKind | null, looks: Record<string, Look> = { terrace: OPEN }, functions: [string, string] = ['terrace', 'stair'], second: GridCoord = [1, 0, 0]): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'open-enclosed' },
      nodes: [
        { id: 1, position: [0, 0, 0], size: [1, 1, 1], function: functions[0] },
        { id: 2, position: second, size: [1, 1, 1], function: functions[1] },
      ],
      edges: edge ? [{ id: 1, source: 1, target: 2, relationship: edge }] : [],
      settings: functionStyleSettings({ stair: { windowFraction: 0.4 }, ...looks }),
    }),
  );
}

const built = (doc: DesignDocumentV2) => buildBuildingV2(doc);
const faceOf = (faces: readonly BuildingFace[], id: string) => {
  const f = faces.find((x) => x.id === id);
  if (!f) throw new Error(`no face ${id}; have ${faces.map((x) => x.id).join(', ')}`);
  return f;
};

describe('facadeOwnerOfSharedWall', () => {
  it('names the enclosed room only when exactly one of the two rooms is open-walled', () => {
    const walls = (open: number[]) => (id: number) => (open.includes(id) ? 'open' : 'enclosed') as 'open' | 'enclosed';
    expect(facadeOwnerOfSharedWall(1, 2, walls([1]))).toBe(2);
    expect(facadeOwnerOfSharedWall(1, 2, walls([2]))).toBe(1);
    expect(facadeOwnerOfSharedWall(1, 2, walls([]))).toBeNull();
    expect(facadeOwnerOfSharedWall(1, 2, walls([1, 2]))).toBeNull();
    expect(facadeOwnerOfSharedWall(1, 2, undefined)).toBeNull();
  });
});

describe('enclosed room beside an open-walled room', () => {
  it('no relationship: the shared wall is the enclosed room’s exterior façade, computed once', () => {
    const model = built(design(null));
    const shared = model.faces.filter((f) => f.neighbourNodeId !== null);
    expect(shared.map((f) => f.id)).toEqual(['2:-x']);
    const face = shared[0]!;
    expect(face).toMatchObject({ ownerNodeId: 2, ownerFunction: 'stair', neighbourNodeId: 1, edgeId: null, condition: 'exterior' });
    expect(face.outside).toBeUndefined();
    // Styled like its other exterior walls: the same window and wall parts as the opposite façade.
    const parts = (id: string) => model.elements.filter((e) => e.faceId === id).map((e) => `${e.part}|${e.size.join(',')}`).sort();
    expect(parts('2:-x')).toEqual(parts('2:+x'));
    expect(parts('2:-x').some((p) => p.startsWith('glazing'))).toBe(true);
    // A façade face belongs to the enclosed room: picking it selects the stair.
    expect(model.elements.filter((e) => e.faceId === '2:-x').every((e) => e.target.kind === 'node' && e.target.id === 2)).toBe(true);
    expect(model.elements.find((e) => e.faceId === '2:-x')!.target).toEqual(selectNode(2));
    // The terrace keeps no wall of its own there (its open sides elsewhere are posts only).
    expect(model.faces.some((f) => f.id === '1:+x')).toBe(false);
  });

  it('Access: a door in the façade (outside: façade colour and a glass door), as for other façade doors', () => {
    const model = built(design('access'));
    const face = faceOf(model.faces, '2:-x');
    expect(face).toMatchObject({ ownerNodeId: 2, neighbourNodeId: 1, edgeId: 1, condition: 'door', outside: true });
    const layout = layoutFace(face);
    expect(layout.openings.map((o) => o.kind)).toEqual(['door']);
    const own = model.elements.filter((e) => e.faceId === '2:-x');
    expect(own.filter((e) => e.part === 'glazing')).toHaveLength(1); // closed glass door
    expect(own.every((e) => e.outside === true && e.edgeId === 1)).toBe(true);
    expect(model.relationships[0]).toMatchObject({ edgeId: 1, status: 'direct', geometry: 'opening' });
  });

  it('Open: unchanged, no wall (a pickable threshold only); the face belongs to the enclosed room', () => {
    const model = built(design('open'));
    const face = faceOf(model.faces, '2:-x');
    expect(face).toMatchObject({ condition: 'open', edgeId: 1, ownerNodeId: 2 });
    expect(face.outside).toBeUndefined();
    expect(model.elements.filter((e) => e.faceId === '2:-x').map((e) => e.part)).toEqual(['threshold']);
  });

  it('the rule follows the looks, whichever room’s id sorts first', () => {
    const model = built(design(null, { terrace: OPEN }, ['stair', 'terrace']));
    expect(faceOf(model.faces, '1:+x')).toMatchObject({ ownerNodeId: 1, condition: 'exterior', neighbourNodeId: 2 });
  });

  it('two open-walled rooms and two enclosed rooms are unchanged', () => {
    const bothOpen = built(design(null, { terrace: OPEN, stair: OPEN }));
    expect(faceOf(bothOpen.faces, '1:+x')).toMatchObject({ ownerNodeId: 1, condition: 'solid' });
    const bothOpenAccess = built(design('access', { terrace: OPEN, stair: OPEN }));
    expect(faceOf(bothOpenAccess.faces, '1:+x')).toMatchObject({ ownerNodeId: 1, condition: 'door' });
    expect(faceOf(bothOpenAccess.faces, '1:+x').outside).toBeUndefined();
    const enclosed = built(design('access', {}));
    expect(faceOf(enclosed.faces, '1:+x')).toMatchObject({ ownerNodeId: 1, condition: 'door' });
    expect(faceOf(enclosed.faces, '1:+x').outside).toBeUndefined();
    expect(faceOf(built(design(null, {})).faces, '1:+x')).toMatchObject({ condition: 'solid' });
  });

  it('floors and ceilings between storeys are unchanged', () => {
    // Terrace 1 on the ground, stair 2 above it.
    const none = built(design(null, { terrace: OPEN }, ['terrace', 'stair'], [0, 0, 1]));
    expect(faceOf(none.faces, '1:+z')).toMatchObject({ ownerNodeId: 1, condition: 'solid', neighbourNodeId: 2 });
    const access = built(design('access', { terrace: OPEN }, ['terrace', 'stair'], [0, 0, 1]));
    expect(faceOf(access.faces, '1:+z')).toMatchObject({ ownerNodeId: 1, condition: 'vertical-access' });
  });

  it('without the rooms’ walls the resolver is pure topology (metrics): the shared wall stays internal', () => {
    const doc = design(null);
    const faces = resolveBuildingFaces(doc, resolveRelationships(doc));
    expect(faceOf(faces, '1:+x')).toMatchObject({ condition: 'solid', ownerNodeId: 1 });
  });

  it('the wall stays a shared wall for the wall panel and the Plan: a relationship can be added from it', () => {
    const doc = design(null);
    const spatial = resolveRelationships(doc);
    const model = buildBuildingV2(doc, { spatial });
    expect(wallAction('2:-x', model, doc, spatial)).toMatchObject({ kind: 'add', source: 2, target: 1 });
    const plan = buildPlan(planSourceV2(doc, spatial), 0);
    expect(plan.wallTargets.map((w) => w.faceId)).toContain('2:-x');
    expect(plan.walls.some((w) => w.faceId === '2:-x' && w.condition === 'exterior')).toBe(true);
  });
});
