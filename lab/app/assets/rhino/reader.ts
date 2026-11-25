import type { Diagnostic, FacadeSource, SourceGroup, SourceMesh, SourceUnit } from '../facadeAdapter';
import { FACADE_LIMITS } from '../facadeAsset';
import { tessellateBrepFace, tessellateSubD, tessellateSurface, type Triangles } from './tessellate';

/**
 * 3DM façade reader: a parsed rhino3dm document → plain triangle meshes (source units, Z-up),
 * material groups and readable diagnostics. Pure apart from the injected rhino3dm module; no
 * React, Three.js or DOM. The module is loaded lazily by `./loader.ts`.
 *
 * Provenance (owner-approved reuse, 2026-11-17): adapted from the owner's SpatialCore package
 * `@spatialcore/rhino3dm-import@0.3.0` (`packages/rhino3dm-import/src/import3dm.ts`):
 *   - `free` (safe embind release), the 3DM header check, `mapUnitSystem` (runtime enum identity,
 *     not the `.d.ts` numbering), the `is` type test, `meshToTriangles` (quads split in two), the
 *     Brep-face / Extrusion cached render-mesh path and the layer/object colour rule.
 * Not taken over: curves, points, CAD edges, layers as a model and user strings (a façade needs
 * surfaces; curves and points are listed as skipped instead). SpatialCore's planar-only Brep
 * fallback is replaced by `./tessellate.ts`: Brep faces and extrusions WITHOUT a saved render mesh,
 * untrimmed surfaces and SubD are meshed on import (planar and curved, trims kept; 2026-11-17).
 * Added here: block (instance reference) expansion, adapted from the wave2-G spike harness
 * (`extract.cjs`), including nested blocks composed with `Transform.multiply(parent, child)`;
 * material groups (layer + colour + glass by name); hidden objects and layers are skipped.
 * Keep this header when changing the file so the shared origin stays traceable.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- rhino3dm objects are handled structurally (see loader.ts). */
export type RhinoModule = any;

export interface Read3dmOptions {
  /** Refuse inputs larger than this many bytes before parsing. */
  readonly maxBytes: number;
  /** Deepest block nesting expanded (default 8); deeper references are skipped with a warning. */
  readonly maxBlockDepth?: number;
}

export type Read3dmResult =
  | {
      readonly ok: true;
      /** The file's unit, or 'unitless'; 'unsupported' units are refused (`ok: false`). */
      readonly unit: SourceUnit | 'unitless';
      /** Meshes and material groups (outward is chosen later, by the student). */
      readonly source: Omit<FacadeSource, 'outward' | 'unit'>;
      /** Warnings (skipped objects, geometry meshed on import or not meshable). Never errors. */
      readonly diagnostics: readonly Diagnostic[];
      /** Application that wrote the file, when recorded (e.g. "Rhinoceros 8"). */
      readonly application: string | null;
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

const HEADER = '3D Geometry File Format ';

/** True when `bytes` starts with the 3DM file signature. */
export function has3dmHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < HEADER.length) return false;
  for (let i = 0; i < HEADER.length; i++) if (bytes[i] !== HEADER.charCodeAt(i)) return false;
  return true;
}

/**
 * Release a rhino3dm (embind) wrapper. Only calls the embind `ClassHandle.delete` destructor:
 * table classes (File3dmObjectTable…) override `delete(id)` to REMOVE items from the document,
 * so a naive `x.delete()` is dangerous. Tables are never freed explicitly. (SpatialCore.)
 */
function free(o: any): void {
  if (!o || typeof o !== 'object') return;
  let proto = Object.getPrototypeOf(o);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'delete')) proto = Object.getPrototypeOf(proto);
  if (!proto || !Object.prototype.hasOwnProperty.call(proto, 'isDeleted')) return;
  try {
    if (!o.isDeleted()) o.delete();
  } catch {
    /* already released */
  }
}

const UNIT_NAMES: readonly (readonly [string, SourceUnit | 'unitless'])[] = [
  ['None', 'unitless'],
  ['Millimeters', 'mm'],
  ['Centimeters', 'cm'],
  ['Meters', 'm'],
  ['Inches', 'in'],
  ['Feet', 'ft'],
];

/** Compare against runtime enum objects; the `.d.ts` enum numbering is wrong. (SpatialCore.) */
function mapUnitSystem(rhino: RhinoModule, value: unknown): { unit: SourceUnit | 'unitless' | 'unsupported'; name: string } {
  const same = (e: any) => e !== undefined && (e === value || (e?.value !== undefined && e.value === (value as { value?: unknown })?.value));
  for (const [name, unit] of UNIT_NAMES) if (same(rhino.UnitSystem?.[name])) return { unit, name };
  const other = Object.keys(rhino.UnitSystem ?? {}).find((k) => k !== 'values' && same(rhino.UnitSystem[k]));
  return { unit: 'unsupported', name: other ?? 'unknown' };
}

function is(rhino: RhinoModule, geometry: any, typeName: string): boolean {
  const t = rhino.ObjectType?.[typeName];
  const v = geometry?.objectType;
  return t !== undefined && (v === t || (v?.value !== undefined && v.value === t?.value));
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
/** Neutral façade grey for objects without a chosen colour. */
export const NEUTRAL_COLOUR = '#c8c2b8';
/**
 * Display colour as `#rrggbb`. Pure black is Rhino's default layer colour ("no colour chosen"), and
 * Rhino's shaded and rendered modes do not draw it black either, so it maps to the neutral grey.
 */
const colourOf = (c: { r: number; g: number; b: number } | undefined): string => {
  if (!c || (c.r === 0 && c.g === 0 && c.b === 0)) return NEUTRAL_COLOUR;
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
};

/** Glazing by name (layer path or object name). Rhino materials are not read. "Panel" is not glass. */
const GLASS_NAME = /glass|glaz|vitr|\bpanes?\b/i;

interface Layer {
  readonly path: string;
  readonly colour: string;
  readonly visible: boolean;
}

function readLayers(doc: any): Map<number, Layer> {
  const out = new Map<number, Layer>();
  const table = doc.layers();
  for (let i = 0; i < table.count; i++) {
    const l = table.get(i);
    try {
      out.set(l.index ?? i, { path: String(l.fullPath || l.name || `Layer ${i}`), colour: colourOf(l.color), visible: l.visible !== false });
    } finally {
      free(l);
    }
  }
  return out;
}

/** Plain triangles of a rhino3dm Mesh (quads split into two triangles). (SpatialCore `meshToTriangles`.) */
function meshTriangles(mesh: any): { positions: Float64Array; indices: Uint32Array } | null {
  const verts = mesh.vertices();
  const faces = mesh.faces();
  try {
    const nv: number = verts.count;
    if (!nv) return null;
    const positions = new Float64Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      const p = verts.get(i);
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
    }
    const indices: number[] = [];
    for (let i = 0; i < faces.count; i++) {
      const [a, b, c, d] = faces.get(i) as number[];
      indices.push(a!, b!, c!);
      if (d !== c) indices.push(a!, c!, d!);
    }
    return indices.length ? { positions, indices: Uint32Array.from(indices) } : null;
  } finally {
    free(verts);
    free(faces);
  }
}

/**
 * Read a 3DM file as façade geometry. Never throws for bad input; returns `ok: false` with an
 * `error` diagnostic for a file that is too large, not a 3DM, unparseable, or in an unsupported
 * unit. Geometry validation (empty, extent, depth, triangle budget) is the adapter's job.
 */
export function read3dmFacade(input: Uint8Array, rhino: RhinoModule, options: Read3dmOptions): Read3dmResult {
  const fail = (code: string, message: string): Read3dmResult => ({ ok: false, diagnostics: [{ severity: 'error', code, message }] });
  if (input.byteLength > options.maxBytes) {
    return fail('too-large', `The file is ${(input.byteLength / 1048576).toFixed(1)} MB; the limit is ${(options.maxBytes / 1048576).toFixed(0)} MB. Export only the façade component from Rhino.`);
  }
  if (!has3dmHeader(input)) return fail('not-a-3dm', 'This is not a Rhino .3dm file (the 3DM file signature is missing).');

  let doc: any;
  try {
    doc = rhino.File3dm.fromByteArray(input);
  } catch {
    doc = null;
  }
  if (!doc) return fail('parse-failed', 'The .3dm file could not be read. Re-save it from Rhino 7 or 8 and try again.');

  try {
    const settings = doc.settings();
    const { unit, name: unitName } = mapUnitSystem(rhino, settings.modelUnitSystem);
    free(settings);
    if (unit === 'unsupported') {
      return fail('units-unsupported', `The file's unit (${unitName}) is not supported. Use metres, centimetres, millimetres, inches or feet.`);
    }

    const layers = readLayers(doc);
    const groups: SourceGroup[] = [];
    const groupIndex = new Map<string, number>();
    /** The top-level object (index in the object table) each mesh came from; blocks count as one object. */
    const meshObject: number[] = [];
    const objectNames = new Map<number, string>();
    let currentObject = -1;
    const groupFor = (layerPath: string, colour: string, glass: boolean): number => {
      const key = `${layerPath}\u0000${colour}\u0000${glass ? 1 : 0}`;
      let index = groupIndex.get(key);
      if (index === undefined) {
        index = groups.length;
        groups.push({ name: layerPath, color: colour, glass });
        groupIndex.set(key, index);
      }
      return index;
    };

    const meshes: SourceMesh[] = [];
    const skipped = new Map<string, number>();
    const skip = (what: string) => skipped.set(what, (skipped.get(what) ?? 0) + 1);
    let brepFacesWithoutMesh = 0;
    let extrusionsWithoutMesh = 0;
    /** Objects/faces without a saved render mesh that were meshed here (`tessellate.ts`). */
    const meshedHere = { faces: 0, surfaces: 0, subd: 0 };
    let hiddenObjects = 0;
    let deepBlocks = 0;
    const maxDepth = options.maxBlockDepth ?? 8;
    const objects = doc.objects();
    const idefs = doc.instanceDefinitions();
    const fromObject = rhino.ObjectColorSource?.ColorFromObject;
    const fromParent = rhino.ObjectColorSource?.ColorFromParent;

    /** Triangles of `mesh` (in place, or a transformed duplicate) into one group. */
    const addMesh = (mesh: any, xform: any, group: number) => {
      if (!mesh) return false;
      let source = mesh;
      if (xform) {
        source = mesh.duplicate();
        source.transform(xform);
      }
      try {
        const tri = meshTriangles(source);
        if (!tri) return false;
        meshes.push({ positions: tri.positions, indices: tri.indices, group });
        meshObject.push(currentObject);
        return true;
      } finally {
        if (source !== mesh) free(source);
      }
    };

    /** Plain triangles (object coordinates) into one group, through the block transform if any. */
    const addTriangles = (tri: Triangles | null, xform: any, group: number) => {
      if (!tri || tri.indices.length === 0) return false;
      let positions = tri.positions;
      if (xform) {
        const m = xform.toFloatArray(true) as number[]; // row-major 4 × 4
        positions = new Float64Array(tri.positions.length);
        for (let i = 0; i < tri.positions.length; i += 3) {
          const x = tri.positions[i]!;
          const y = tri.positions[i + 1]!;
          const z = tri.positions[i + 2]!;
          const w = m[12]! * x + m[13]! * y + m[14]! * z + m[15]! || 1;
          positions[i] = (m[0]! * x + m[1]! * y + m[2]! * z + m[3]!) / w;
          positions[i + 1] = (m[4]! * x + m[5]! * y + m[6]! * z + m[7]!) / w;
          positions[i + 2] = (m[8]! * x + m[9]! * y + m[10]! * z + m[11]!) / w;
        }
      }
      meshes.push({ positions, indices: tri.indices, group });
      meshObject.push(currentObject);
      return true;
    };
    /** Meshing tolerance for one object: 0.1 % of its size (about 3 mm on a 3 m module). */
    const toleranceOf = (geometry: any) => {
      let diag = 0;
      try {
        const bb = geometry.getBoundingBox();
        diag = Math.hypot(...(bb.diagonal as number[]));
        free(bb);
      } catch {
        /* unknown size */
      }
      return diag > 0 ? diag * 1e-3 : 1e-3;
    };
    /** Every face of `brep`: its saved render mesh, else meshed here. Returns the faces that failed. */
    const addBrep = (brep: any, xform: any, group: number, saved: boolean) => {
      const faces = brep.faces();
      let failed = 0;
      let tolerance = -1;
      const edgeCache = new Map();
      for (let k = 0; k < faces.count; k++) {
        const face = faces.get(k);
        const mesh = saved ? face.getMesh(rhino.MeshType.Any) : null;
        if (!addMesh(mesh, xform, group)) {
          if (tolerance < 0) tolerance = toleranceOf(brep);
          if (addTriangles(tessellateBrepFace(brep, face, { tolerance }, edgeCache), xform, group)) meshedHere.faces++;
          else failed++;
        }
        free(mesh);
        free(face);
      }
      free(faces);
      return failed;
    };

    interface Style {
      readonly layer: Layer;
      readonly colour: string;
      readonly glass: boolean;
    }

    const styleOf = (attrs: any, parent: Style | null): Style => {
      const layer = layers.get(attrs.layerIndex) ?? { path: 'Default', colour: NEUTRAL_COLOUR, visible: true };
      let colour = layer.colour;
      if (fromObject !== undefined && attrs.colorSource === fromObject) colour = colourOf(attrs.objectColor);
      else if (parent && fromParent !== undefined && attrs.colorSource === fromParent) colour = parent.colour;
      const name = String(attrs.name ?? '');
      const glass = GLASS_NAME.test(layer.path) || GLASS_NAME.test(name) || (parent?.glass ?? false);
      return { layer, colour, glass };
    };

    const collect = (geometry: any, style: Style, xform: any, depth: number, path: readonly string[]) => {
      const group = () => groupFor(style.layer.path, style.colour, style.glass);
      if (!geometry) return;
      if (is(rhino, geometry, 'Mesh')) {
        if (!addMesh(geometry, xform, group())) skip('empty mesh');
        return;
      }
      if (is(rhino, geometry, 'Brep')) {
        brepFacesWithoutMesh += addBrep(geometry, xform, group(), true);
        return;
      }
      if (is(rhino, geometry, 'Extrusion')) {
        const mesh = geometry.getMesh?.(rhino.MeshType.Any);
        if (!addMesh(mesh, xform, group())) {
          // No saved mesh: mesh its polysurface form here.
          const brep = geometry.toBrep?.(true);
          if (!brep || addBrep(brep, xform, group(), false) > 0) extrusionsWithoutMesh++;
          free(brep);
        }
        free(mesh);
        return;
      }
      if (is(rhino, geometry, 'SubD')) {
        if (addTriangles(tessellateSubD(rhino, geometry, { maxTriangles: 50000 }), xform, group())) meshedHere.subd++;
        else skip('SubD that could not be meshed');
        return;
      }
      if (is(rhino, geometry, 'Surface') || (rhino.Surface && geometry instanceof rhino.Surface)) {
        if (addTriangles(tessellateSurface(geometry, { tolerance: toleranceOf(geometry) }), xform, group())) meshedHere.surfaces++;
        else skip('surface that could not be meshed');
        return;
      }
      if (is(rhino, geometry, 'InstanceReference') || geometry.constructor?.name === 'InstanceReference') {
        const idefId: string = geometry.parentIdefId;
        if (depth >= maxDepth || path.includes(idefId)) {
          deepBlocks++;
          return;
        }
        const idef = idefs.findId(idefId);
        if (!idef) {
          skip('block reference without definition');
          return;
        }
        const own = geometry.xform;
        const combined = xform ? rhino.Transform.multiply(xform, own) : own;
        try {
          const ids = idef.getObjectIds() as unknown as readonly string[];
          for (const id of ids) {
            const member = objects.findId(id);
            if (!member) continue;
            const attrs = member.attributes();
            const g = member.geometry();
            try {
              if (attrs.visible === false) hiddenObjects++;
              else collect(g, styleOf(attrs, style), combined, depth + 1, [...path, idefId]);
            } finally {
              free(g);
              free(attrs);
              free(member);
            }
          }
        } finally {
          if (combined !== own) free(combined);
          free(own);
          free(idef);
        }
        return;
      }
      if (is(rhino, geometry, 'Curve')) skip('curve');
      else if (is(rhino, geometry, 'Point') || is(rhino, geometry, 'PointSet')) skip('point');
      else skip(String(geometry.constructor?.name ?? 'unknown object'));
    };

    for (let i = 0; i < objects.count; i++) {
      const obj = objects.get(i);
      if (!obj) continue;
      const attrs = obj.attributes();
      const geometry = obj.geometry();
      try {
        // Block member geometry is stored in the object table too; it is drawn through its references only.
        if (attrs.isInstanceDefinitionObject) continue;
        const style = styleOf(attrs, null);
        if (attrs.visible === false || !style.layer.visible) {
          hiddenObjects++;
          continue;
        }
        currentObject = i;
        objectNames.set(i, String(attrs.name ?? '').trim());
        collect(geometry, style, null, 0, []);
      } finally {
        free(geometry);
        free(attrs);
        free(obj);
      }
    }

    const diagnostics: Diagnostic[] = [];
    const warn = (code: string, message: string) => diagnostics.push({ severity: 'warning', code, message });
    if (brepFacesWithoutMesh > 0 || extrusionsWithoutMesh > 0) {
      const parts = [
        brepFacesWithoutMesh > 0 ? `${brepFacesWithoutMesh} polysurface face${brepFacesWithoutMesh === 1 ? '' : 's'}` : '',
        extrusionsWithoutMesh > 0 ? `${extrusionsWithoutMesh} extrusion${extrusionsWithoutMesh === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      warn(
        'no-render-mesh',
        `${parts.join(' and ')} had no render mesh and could not be meshed on import; they were left out. In Rhino, run Mesh on those objects (or shade the model and save normally), then import again.`,
      );
    }
    if (meshedHere.faces + meshedHere.surfaces + meshedHere.subd > 0) {
      const parts = [
        meshedHere.faces > 0 ? `${meshedHere.faces} surface face${meshedHere.faces === 1 ? '' : 's'} without a saved render mesh` : '',
        meshedHere.surfaces > 0 ? `${meshedHere.surfaces} surface${meshedHere.surfaces === 1 ? '' : 's'}` : '',
        meshedHere.subd > 0 ? `${meshedHere.subd} SubD object${meshedHere.subd === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      diagnostics.push({
        severity: 'warning',
        code: 'meshed-on-import',
        message: `Meshed on import: ${parts.join(', ')} (a display approximation: surfaces within about 0.1 % of each object's size, SubD smoothed from its control net; Rhino's own render mesh is used wherever the file has one).`,
      });
    }
    if (skipped.size > 0) {
      const list = [...skipped].map(([what, n]) => `${n} ${what}${n === 1 || what.includes('(') ? '' : 's'}`).join(', ');
      warn('skipped-objects', `Not façade geometry, left out: ${list}.`);
    }
    if (hiddenObjects > 0) warn('hidden-objects', `${hiddenObjects} hidden object${hiddenObjects === 1 ? ' was' : 's were'} left out (hidden, or on a layer that is off).`);
    if (deepBlocks > 0) warn('deep-blocks', `${deepBlocks} block reference${deepBlocks === 1 ? '' : 's'} nested more than ${maxDepth} levels deep (or recursive) were left out.`);
    if (meshes.length === 0 && (brepFacesWithoutMesh > 0 || extrusionsWithoutMesh > 0)) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'no-geometry',
            message: 'No displayable geometry: the surfaces in this file could not be meshed. In Rhino, run Mesh on the objects, then import again.',
          },
          ...diagnostics,
        ],
      };
    }
    return {
      ok: true,
      unit,
      source: perObjectGroups(meshes, meshObject, groups, objectNames),
      diagnostics,
      application: doc.applicationName ? String(doc.applicationName) : null,
    };
  } finally {
    free(doc);
  }
}

/**
 * Material groups per OBJECT when the model has few enough (owner 2026-11-17: students set solid,
 * glass or a colour for each object of the uploaded model): one group per (object, layer style),
 * named after the object (or its layer and a number). Models with more than `FACADE_LIMITS.maxGroups`
 * such pairs keep the per-layer groups.
 */
function perObjectGroups(
  meshes: readonly SourceMesh[],
  meshObject: readonly number[],
  layerGroups: readonly SourceGroup[],
  objectNames: ReadonlyMap<number, string>,
): Omit<FacadeSource, 'outward' | 'unit'> {
  const keyOf = (k: number) => `${meshObject[k]}|${meshes[k]!.group ?? 0}`;
  const pairs = new Map<string, { object: number; layer: number }>();
  meshes.forEach((m, k) => {
    if (!pairs.has(keyOf(k))) pairs.set(keyOf(k), { object: meshObject[k] ?? -1, layer: m.group ?? 0 });
  });
  const objects = new Set(meshObject);
  if (objects.size <= 1 || pairs.size > FACADE_LIMITS.maxGroups) return { meshes, groups: layerGroups };
  const stylesPerObject = new Map<number, number>();
  for (const { object } of pairs.values()) stylesPerObject.set(object, (stylesPerObject.get(object) ?? 0) + 1);
  const ordinal = new Map<number, number>();
  const unnamed = new Map<string, number>();
  const groups: SourceGroup[] = [];
  const index = new Map<string, number>();
  for (const [key, { object, layer }] of pairs) {
    const style = layerGroups[layer]!;
    let name = objectNames.get(object) ?? '';
    if (!name) {
      if (!ordinal.has(object)) {
        const n = (unnamed.get(style.name) ?? 0) + 1;
        unnamed.set(style.name, n);
        ordinal.set(object, n);
      }
      name = `${style.name} ${ordinal.get(object)}`;
    }
    if ((stylesPerObject.get(object) ?? 1) > 1) name = `${name} · ${style.name}`;
    index.set(key, groups.length);
    groups.push({ ...style, name });
  }
  return { meshes: meshes.map((m, k) => ({ ...m, group: index.get(keyOf(k))! })), groups };
}
