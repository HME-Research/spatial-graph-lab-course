import { beforeAll, describe, expect, it } from 'vitest';
import { facadeMeshData, FACADE_LIMITS, readFacadeAsset, type FacadeAssetV1 } from './facadeAsset';
import { importFacade3dm, type ImportFacadeChoices, type ImportFacadeResult } from './importFacade';
import { loadRhino3dm, RHINO3DM_VERSION } from './rhino/loader';
import { has3dmHeader, read3dmFacade, type RhinoModule } from './rhino/reader';

/**
 * The 3DM import pipeline against REAL rhino3dm (the pinned version, loaded as the app does) and
 * real .3dm files in `__fixtures__/` (synthetic samples from `generate-fixtures.cjs`, plus one
 * genuine Rhinoceros 8 file). Source convention: x along, z up, y depth, exterior −y.
 */

// Node only (vitest runs in Node): read fixture bytes without a @types/node dependency.
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): { readFileSync(url: URL): Uint8Array } } }).process.getBuiltinModule('node:fs');
const fixture = (name: string): Uint8Array => new Uint8Array(fs.readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));

let rhino: RhinoModule;
beforeAll(async () => {
  rhino = await loadRhino3dm();
}, 30_000);

function run(name: string, choices: ImportFacadeChoices = {}): ImportFacadeResult {
  return importFacade3dm(fixture(name), { ...choices, fileName: name, rhino, reader: `rhino3dm@${RHINO3DM_VERSION}` });
}

function imported(name: string, choices: ImportFacadeChoices = {}): FacadeAssetV1 {
  const result = run(name, choices);
  if (result.status !== 'ok') throw new Error(`${name}: ${JSON.stringify(result)}`);
  return result.asset;
}

const near = (actual: number, expected: number, tolerance = 1e-5) => expect(Math.abs(actual - expected)).toBeLessThan(tolerance);

/** x (along) ranges of the boxes in a group, as [min, max] per connected 8-vertex box. */
function groupBounds(asset: FacadeAssetV1, groupName: string) {
  const { positions, indices } = facadeMeshData(asset);
  const group = asset.groups.find((g) => g.name === groupName)!;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let t = group.start * 3; t < (group.start + group.count) * 3; t++) {
    const v = indices[t]!;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, positions[v * 3 + k]!);
      max[k] = Math.max(max[k]!, positions[v * 3 + k]!);
    }
  }
  return { min, max };
}

/** Along (a) and up (b) ranges of each 12-triangle box of a group (the fixtures are made of boxes). */
function boxesOf(asset: FacadeAssetV1, groupName: string): { a0: number; a1: number; b0: number; b1: number }[] {
  const { positions, indices } = facadeMeshData(asset);
  const group = asset.groups.find((g) => g.name === groupName)!;
  const out: { a0: number; a1: number; b0: number; b1: number }[] = [];
  for (let box = 0; box < group.count / 12; box++) {
    const r = { a0: Infinity, a1: -Infinity, b0: Infinity, b1: -Infinity };
    for (let t = (group.start + box * 12) * 3; t < (group.start + box * 12 + 12) * 3; t++) {
      const v = indices[t]!;
      r.a0 = Math.min(r.a0, positions[v * 3]!);
      r.a1 = Math.max(r.a1, positions[v * 3]!);
      r.b0 = Math.min(r.b0, positions[v * 3 + 1]!);
      r.b1 = Math.max(r.b1, positions[v * 3 + 1]!);
    }
    out.push(r);
  }
  return out;
}

/** Sorted along-centres (rounded to mm) of the boxes in a group. */
const boxCentresAlong = (asset: FacadeAssetV1, groupName: string): number[] =>
  boxesOf(asset, groupName)
    .map((b) => Math.round(((b.a0 + b.a1) / 2) * 1000) / 1000)
    .sort((a, b) => a - b);

describe('rhino3dm dependency', () => {
  it('is pinned exactly, installed at that version, and the reader label says the same', () => {
    const fsText = fs as unknown as { readFileSync(url: URL, encoding: 'utf8'): string };
    const pkg = JSON.parse(fsText.readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { dependencies: Record<string, string> };
    const installed = JSON.parse(fsText.readFileSync(new URL('../../../node_modules/rhino3dm/package.json', import.meta.url), 'utf8')) as { version: string; license: string };
    expect(pkg.dependencies.rhino3dm).toBe(RHINO3DM_VERSION); // exact pin: no ^ or ~
    expect(installed.version).toBe(RHINO3DM_VERSION);
    expect(installed.license).toBe('MIT');
  });
});

describe('3DM reader: file checks', () => {
  it('recognises the 3DM signature', () => {
    expect(has3dmHeader(fixture('F1-bay-window-m.3dm'))).toBe(true);
    expect(has3dmHeader(new TextEncoder().encode('not a rhino file at all, sorry'))).toBe(false);
    expect(has3dmHeader(new Uint8Array(3))).toBe(false);
  });

  it('refuses a non-3DM file before parsing, and a file over the size limit', () => {
    const bogus = importFacade3dm(new TextEncoder().encode('{"hello": "world"}'), { fileName: 'x.3dm', rhino, reader: 'test' });
    expect(bogus).toMatchObject({ status: 'refused', diagnostics: [{ code: 'not-a-3dm', severity: 'error' }] });
    const big = read3dmFacade(fixture('F1-bay-window-m.3dm'), rhino, { maxBytes: 1000 });
    expect(big).toMatchObject({ ok: false, diagnostics: [{ code: 'too-large' }] });
    expect(FACADE_LIMITS.maxFileBytes).toBe(20 * 1024 * 1024);
  });

  it('refuses a truncated 3DM with a readable error', () => {
    const truncated = fixture('F1-bay-window-m.3dm').slice(0, 200);
    const result = importFacade3dm(truncated, { fileName: 't.3dm', rhino, reader: 'test' });
    expect(result.status).toBe('refused');
  });
});

describe('3DM import: units, axes and the 3 m module', () => {
  it('F1 (metres): a 3 × 3 × 0.2 m panel with frame and glass groups, in the panel frame', () => {
    const asset = imported('F1-bay-window-m.3dm');
    near(asset.size[0], 3);
    near(asset.size[1], 3);
    near(asset.size[2], 0.2);
    expect(asset.mesh.triangles).toBe(60);
    expect(asset.mesh.index).toBe('u16');
    expect(asset.source).toMatchObject({ unit: 'm', unitAssumed: false, outward: '-y', reader: `rhino3dm@${RHINO3DM_VERSION}`, fileName: 'F1-bay-window-m.3dm', bytes: 12065 });
    // One material group per object (few objects), named after it, with its layer's colour; "Glass" → glazing.
    expect(asset.groups.map((g) => [g.name, g.color, g.glass, g.count])).toEqual([
      ['Pier_L', '#787878', false, 12],
      ['Pier_R', '#787878', false, 12],
      ['Spandrel', '#787878', false, 12],
      ['Head', '#787878', false, 12],
      ['Glass', '#96c8e6', true, 12],
    ]);
    // Glass pane at source y 0.08…0.10. With the exterior at −y, the y = 0 face is the OUTERMOST
    // (c = depth) and the back is y = 0.2 (c = 0): c = 0.2 − y → 0.10…0.12.
    const glass = groupBounds(asset, 'Glass');
    near(glass.min[2]!, 0.1);
    near(glass.max[2]!, 0.12);
    near(glass.min[0]!, 0.6);
    near(glass.max[0]!, 2.4);
    near(glass.min[1]!, 0.9); // window sill, z up → b
    expect(readFacadeAsset(asset).ok).toBe(true);
  });

  it('Rhino archive versions 6, 7 and 8 give the identical asset (content-addressed id)', () => {
    const v8 = imported('F1-bay-window-m.3dm');
    const v7 = imported('F1-bay-window-m-v7.3dm');
    const v6 = imported('F1-bay-window-m-v6.3dm');
    expect(v7.id).toBe(v8.id);
    expect(v6.id).toBe(v8.id);
    expect(v6.mesh.data).toBe(v8.mesh.data);
  });

  it('F2 (millimetres, far from the origin) normalises to the same 3 m module as F1', () => {
    const mm = imported('F2-bay-window-mm-offset.3dm');
    const m = imported('F1-bay-window-m.3dm');
    expect(mm.source.unit).toBe('mm');
    for (let k = 0; k < 3; k++) near(mm.size[k]!, m.size[k]!);
    const a = facadeMeshData(mm).positions;
    const b = facadeMeshData(m).positions;
    expect(a.length).toBe(b.length);
    let worst = 0;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
    expect(worst).toBeLessThan(1e-5);
  });

  it('F5: a 9 m curtain-wall run keeps its true 9 × 3 m size', () => {
    const asset = imported('F5-curtain-run-9m-m.3dm');
    near(asset.size[0], 9);
    near(asset.size[1], 3);
    near(asset.size[2], 0.2);
    expect(asset.groups.map((g) => [g.name, g.glass])).toEqual([
      ['Mullion@0', false],
      ['Mullion@2.95', false],
      ['Mullion@5.95', false],
      ['Mullion@8.9', false],
      ['Transom', false],
      ['Glass', true], // "Glass" object name → glazing
    ]);
  });

  it('a unitless file needs an explicit unit; the choice is recorded and warned about', () => {
    const first = run('F6-bay-window-unitless.3dm');
    expect(first.status).toBe('needs-unit');
    const asset = imported('F6-bay-window-unitless.3dm', { unitIfUnitless: 'm' });
    expect(asset.source).toMatchObject({ unit: 'm', unitAssumed: true });
    expect(asset.warnings.join(' ')).toMatch(/Unitless file read as m/);
    expect(asset.id).toBe(imported('F1-bay-window-m.3dm').id);
    // The same file read as millimetres is a 3 mm panel: accepted (tiny), never silently rescaled.
    const tiny = imported('F6-bay-window-unitless.3dm', { unitIfUnitless: 'mm' });
    near(tiny.size[0], 0.003, 1e-7);
  });

  it("outward '+y' is a 180° rotation (the panel's other side faces out), not a mirror", () => {
    const front = imported('F1-bay-window-m.3dm');
    const back = imported('F1-bay-window-m.3dm', { outward: '+y' });
    expect(back.source.outward).toBe('+y');
    expect(back.id).not.toBe(front.id);
    // With +y facing out, c = y: the glass is at 0.08…0.10, and along-façade a is mirrored by
    // the rotation (a = 3 − x), so the 0.6…2.4 glass stays 0.6…2.4 only because it is centred.
    const glass = groupBounds(back, 'Glass');
    near(glass.min[2]!, 0.08);
    near(glass.max[2]!, 0.1);
    near(glass.min[0]!, 0.6);
  });
});

describe('3DM import: Breps, blocks and what is left out', () => {
  it('Breps and extrusions without render meshes are meshed on import (exact boxes) and reported', () => {
    const result = run('F3-brep-extrusion-nomesh-m.3dm');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    // Two Brep piers and one extruded fin, 6 planar faces × 2 triangles each.
    expect(result.asset.mesh.triangles).toBe(3 * 12);
    near(result.asset.size[0], 3);
    // The fixture's fin profile is drawn clockwise, so rhino3dm extrudes it DOWN (z −3…0; its own
    // bounding box says so): piers z 0…3 + fin z −3…0 = 6 m tall, exactly as Rhino would show it.
    near(result.asset.size[1], 6);
    near(result.asset.size[2], 0.5); // 0.2 m piers + the fin 0.3 m in front
    expect(result.warnings.map((w) => w.code)).toContain('meshed-on-import');
    expect(result.warnings.map((w) => w.code)).not.toContain('no-render-mesh');
    expect(boxCentresAlong(result.asset, 'BrepPier_L')).toEqual([0.3]);
    expect(boxCentresAlong(result.asset, 'BrepPier_R')).toEqual([2.7]);
    expect(boxCentresAlong(result.asset, 'ExtrusionFin')).toEqual([1.5]);
  });

  it('F4: block instances are expanded (3 fins + back panel); definition geometry is not drawn twice', () => {
    const asset = imported('F4-block-fins-m.3dm');
    expect(asset.mesh.triangles).toBe(4 * 12);
    near(asset.size[0], 3);
    near(asset.size[2], 0.5); // fins stick 0.3 m out in front of the 0.2 m panel
    // Fins are 0.1 wide around x = 0.5, 1.5, 2.5 (and the 3 m back panel centred at 1.5): one group per
    // object (a block instance is one object), Rhino's black default layer drawn in the neutral grey.
    expect(asset.groups.map((g) => [g.name, g.color, g.glass, g.count])).toEqual([
      ['Fin@0.5', '#c8c2b8', false, 12],
      ['Fin@1.5', '#c8c2b8', false, 12],
      ['Fin@2.5', '#c8c2b8', false, 12],
      ['BackPanel', '#c8c2b8', false, 12],
    ]);
    expect(['Fin@0.5', 'Fin@1.5', 'Fin@2.5', 'BackPanel'].map((n) => boxCentresAlong(asset, n))).toEqual([[0.5], [1.5], [2.5], [1.5]]);
  });

  it('F7: nested blocks compose parent × child (a scaled outer placement proves the order)', () => {
    const asset = imported('F7-nested-blocks-m.3dm');
    expect(asset.mesh.triangles).toBe(5 * 12);
    // translate(x0, 0, 0.25) × scale(0.5) of fins at 0 and 1: centres x0 + {0, 0.5} = 0.5, 1, 1.5, 2,
    // plus the back panel (also on layer 0, "Fins") at 1.5. The wrong order would give 0.5, 1.5, 1.5, 2.5.
    expect(boxCentresAlong(asset, 'Pair@0.5')).toEqual([0.5, 1]);
    expect(boxCentresAlong(asset, 'Pair@1.5')).toEqual([1.5, 2]);
    expect(boxCentresAlong(asset, 'BackPanel')).toEqual([1.5]);
    // Every fin (the narrow boxes) runs z 0.25…1.5 → b (up), measured from the panel's bottom at 0.
    const fins = [...boxesOf(asset, 'Pair@0.5'), ...boxesOf(asset, 'Pair@1.5')];
    expect(fins).toHaveLength(4);
    for (const fin of fins) {
      near(fin.a1 - fin.a0, 0.05);
      near(fin.b0, 0.25);
      near(fin.b1, 0.25 + 2.5 * 0.5);
    }
  });

  it('F7: nesting deeper than the limit is left out with a warning', () => {
    const read = read3dmFacade(fixture('F7-nested-blocks-m.3dm'), rhino, { maxBytes: FACADE_LIMITS.maxFileBytes, maxBlockDepth: 1 });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.diagnostics.map((d) => d.code)).toContain('deep-blocks');
    expect(read.source.meshes).toHaveLength(1); // only the back panel
  });

  it('F8: curves, points, hidden objects and objects on layers that are off are left out and listed', () => {
    const result = run('F8-hidden-and-curves-m.3dm');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    near(result.asset.size[0], 3); // not the 30 m hidden box or the 40 m one on the off layer
    expect(result.asset.mesh.triangles).toBe(12);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['skipped-objects', 'hidden-objects']));
    expect(result.warnings.find((w) => w.code === 'skipped-objects')!.message).toMatch(/1 curve, 1 point/);
    expect(result.warnings.find((w) => w.code === 'hidden-objects')!.message).toMatch(/^2 hidden objects/);
    expect(result.asset.warnings).toEqual(result.warnings.map((w) => w.message));
  });

  it('a genuine Rhinoceros 8 file: Brep render meshes are read, then the building-sized model is refused', () => {
    const bytes = fixture('GeometryTest-v1.3dm');
    const read = read3dmFacade(bytes, rhino, { maxBytes: FACADE_LIMITS.maxFileBytes });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.unit).toBe('m');
    expect(read.application ?? '').toMatch(/Rhinoceros 8/);
    expect(read.source.meshes.length).toBeGreaterThan(10); // every Brep face had a cached render mesh
    expect(read.diagnostics.map((d) => d.code)).not.toContain('no-render-mesh');
    const result = importFacade3dm(bytes, { fileName: 'GeometryTest-v1.3dm', rhino, reader: 'test' });
    expect(result.status).toBe('refused');
    if (result.status === 'refused') expect(result.diagnostics.map((d) => d.code)).toContain('too-deep');
  });
});
