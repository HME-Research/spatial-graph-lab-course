import { beforeAll, describe, expect, it } from 'vitest';
import { loadRhino3dm } from './loader';
import type { RhinoModule } from './reader';
import { catmullClark, tessellateBrepFace, tessellateSurface, type Triangles } from './tessellate';

/**
 * Meshing geometry that has no saved render mesh (`tessellate.ts`), against REAL rhino3dm. The
 * truth is exact analytic area (and, during development, Rhino's own render meshes on real files:
 * mean area difference 0.02–1 % over ~3,800 faces, 928 of them curved).
 */

let rhino: RhinoModule;
beforeAll(async () => {
  rhino = await loadRhino3dm();
});

function area({ positions: p, indices: ix }: Triangles): number {
  let a = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const [i, j, k] = [ix[t]! * 3, ix[t + 1]! * 3, ix[t + 2]! * 3];
    const u = [p[j]! - p[i]!, p[j + 1]! - p[i + 1]!, p[j + 2]! - p[i + 2]!];
    const v = [p[k]! - p[i]!, p[k + 1]! - p[i + 1]!, p[k + 2]! - p[i + 2]!];
    a += Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
  }
  return a;
}

const brepArea = (brep: any, tolerance: number) => {
  const faces = brep.faces();
  let total = 0;
  const cache = new Map();
  for (let k = 0; k < faces.count; k++) {
    const tri = tessellateBrepFace(brep, faces.get(k), { tolerance }, cache);
    expect(tri).not.toBeNull();
    total += area(tri!);
  }
  return total;
};

describe('meshing surfaces without a render mesh', () => {
  it('a box Brep: six planar faces, two triangles each, exact area', () => {
    const box = rhino.Brep.createFromBoundingBox(new rhino.BoundingBox([0, 0, 0], [3, 0.2, 3]));
    expect(brepArea(box, 0.003)).toBeCloseTo(2 * (3 * 0.2 + 3 * 3 + 0.2 * 3), 9);
  });

  it('a capped cylinder Brep (curved face across a seam, round caps) within 0.5 % of the true area', () => {
    const cylinder = new rhino.Cylinder(new rhino.Circle(1), 2);
    const brep = rhino.Brep.createFromCylinder(cylinder, true, true);
    const exact = 2 * Math.PI * 1 * 2 + 2 * Math.PI;
    expect(Math.abs(brepArea(brep, 0.003) - exact) / exact).toBeLessThan(0.005);
  });

  it('an untrimmed surface (NURBS cylinder) as a curvature-sized grid within 0.5 %', () => {
    const surface = rhino.NurbsSurface.createFromCylinder(new rhino.Cylinder(new rhino.Circle(1), 2));
    const tri = tessellateSurface(surface, { tolerance: 0.003 });
    expect(tri).not.toBeNull();
    expect(Math.abs(area(tri!) - 4 * Math.PI) / (4 * Math.PI)).toBeLessThan(0.005);
  });
});

describe('SubD: Catmull–Clark from the control net', () => {
  const cube = {
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ] as [number, number, number][],
    faces: [
      [0, 3, 2, 1],
      [4, 5, 6, 7],
      [0, 1, 5, 4],
      [1, 2, 6, 5],
      [2, 3, 7, 6],
      [3, 0, 4, 7],
    ],
  };

  it('a closed cube becomes a smooth closed quad mesh inside the cage (V + E + F vertices per level)', () => {
    const one = catmullClark(cube);
    expect(one.vertices).toHaveLength(8 + 12 + 6);
    expect(one.faces).toHaveLength(24);
    expect(one.faces.every((f) => f.length === 4)).toBe(true);
    const two = catmullClark(one);
    expect(two.faces).toHaveLength(96);
    for (const p of two.vertices) for (const c of p) expect(c).toBeGreaterThan(0), expect(c).toBeLessThan(1);
    // Symmetric: the centroid stays at the cube's centre.
    const centre = [0, 1, 2].map((k) => two.vertices.reduce((s, p) => s + p[k]!, 0) / two.vertices.length);
    for (const c of centre) expect(c).toBeCloseTo(0.5, 9);
  });

  it('an open, flat control net stays flat (boundary rules)', () => {
    const flat = catmullClark(catmullClark({ vertices: [[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]], faces: [[0, 1, 2, 3]] }));
    expect(flat.faces).toHaveLength(16);
    for (const p of flat.vertices) expect(p[2]).toBe(0);
  });
});
