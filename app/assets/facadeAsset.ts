import { z } from 'zod';
import { base64ToBytes, bytesToBase64, sha256Hex } from './binary';
import { FACADE_VARIANTS, type FacadeVariantKind } from '@app/document/v2';
import { METRES_PER_UNIT, type ComponentGroup, type FacadeComponent, type SourceOutward, type SourceUnit } from './facadeAdapter';

/**
 * Imported façade asset, version 1 (`kind: 'facade-mesh'`). Pure.
 *
 * Asset policy (owner decision D4, 2026-11-17): the project stores the VALIDATED, NORMALISED
 * component mesh, never the original `.3dm`. The mesh is in metres, in the panel frame of
 * `facadeAdapter.ts` (a = rightward seen from outside, b = up, c = outward, bounding box from
 * the origin), so loading, rendering and exporting a project never needs rhino3dm.
 *
 * Binary layout of `mesh.data` (base64, little-endian, no header):
 *   positions: `vertices × 3` float32 (a, b, c)  — then
 *   indices:   `triangles × 3` uint16 (`index: 'u16'`, only when vertices ≤ 65 536) or uint32.
 * Triangles are ordered by `groups` (contiguous, covering every triangle once).
 *
 * Identity: `id = 'facade-' + first 16 hex digits of mesh.sha256` (content-addressed: importing
 * the same component twice gives the same id). `readFacadeAsset` checks the hash, the exact byte
 * length, every index, every coordinate against `size`, the groups and the limits; TypeScript
 * types alone are never trusted.
 */

export const FACADE_ASSET_KIND = 'facade-mesh';
/** Version of the reader + adapter pipeline that produced an asset (informational). */
export const FACADE_PIPELINE_VERSION = 1;

/** Bounds (owner decision D5, spike recommendation). */
export const FACADE_LIMITS = Object.freeze({
  /** Input `.3dm` size, checked before parsing. */
  maxFileBytes: 20 * 1024 * 1024,
  /** Triangles of one component. */
  maxTriangles: 100_000,
  /** Vertices of one component (3 per triangle at most after unwelding). */
  maxVertices: 300_000,
  /** Material groups of one component. */
  maxGroups: 32,
  /** Largest plausible panel extent (m): catches wrong units. */
  maxExtentMetres: 50,
  /** Largest plausible depth (m): a façade component, not a building. */
  maxDepthMetres: 1,
  /** Imported façades per project. */
  maxAssets: 32,
  /** Embedded binary per project: a warning above this many bytes … */
  warnTotalBytes: 5 * 1024 * 1024,
  /** … and refused above this many. */
  maxTotalBytes: 20 * 1024 * 1024,
  maxNameLength: 80,
});

export const FACADE_ASSET_ID_PATTERN = /^facade-[0-9a-f]{16}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const COLOR = /^#[0-9a-f]{6}$/;

/**
 * How one material group is drawn: its colour and finish. Finish = `open` (not drawn: a hole,
 * e.g. the door opening of a door-bay module) when `open`, else glass or solid.
 */
export interface FacadeMaterial {
  /** `#rrggbb`. */
  readonly color: string;
  readonly glass: boolean;
  /** Not drawn at all (wins over `glass`). */
  readonly open?: true | undefined;
}

export type FacadeFinish = 'solid' | 'glass' | 'open';
export const FACADE_FINISHES: readonly FacadeFinish[] = ['solid', 'glass', 'open'];
export const finishOf = (m: Pick<FacadeMaterial, 'glass' | 'open'>): FacadeFinish => (m.open ? 'open' : m.glass ? 'glass' : 'solid');
/** A material with `finish` (canonical: `open` only when true, `glass` false when open). */
export const withFinish = (color: string, finish: FacadeFinish): FacadeMaterial => ({ color, glass: finish === 'glass', ...(finish === 'open' ? { open: true as const } : {}) });

/**
 * What an asset is used as: a function's façade (`wall`) or its Door / Open bay module. Each use
 * may have its own materials (`FacadeAssetV1.bayMaterials`); `wall` uses the groups' own.
 */
export type FacadeRole = 'wall' | FacadeVariantKind;
export const FACADE_ROLES: readonly FacadeRole[] = ['wall', ...FACADE_VARIANTS];

export interface FacadeAssetGroup extends FacadeMaterial {
  readonly name: string;
  /** First triangle of the group. */
  readonly start: number;
  /** Triangles in the group. */
  readonly count: number;
}

export interface FacadeAssetSource {
  /** The imported file's name (informational; the file itself is not stored). */
  readonly fileName: string;
  /** Size of the imported `.3dm` in bytes. */
  readonly bytes: number;
  /** SHA-256 of the imported `.3dm`, so a student can tell which file it came from. */
  readonly sha256: string;
  /** The file's length unit (after an explicit choice for a unitless file). */
  readonly unit: SourceUnit;
  /** True when the file had no unit system and the student chose `unit`. */
  readonly unitAssumed: boolean;
  /** Which source side was taken as the exterior. */
  readonly outward: SourceOutward;
  /** Reader that parsed it, e.g. `rhino3dm@8.17.0`. */
  readonly reader: string;
}

export interface FacadeAssetMesh {
  readonly vertices: number;
  readonly triangles: number;
  readonly index: 'u16' | 'u32';
  /** SHA-256 of the decoded `data` bytes. */
  readonly sha256: string;
  /** Base64 of the binary layout above. */
  readonly data: string;
}

export interface FacadeAssetV1 {
  readonly id: string;
  readonly kind: typeof FACADE_ASSET_KIND;
  /** Display name (from the file name; at most 80 characters). */
  readonly name: string;
  readonly source: FacadeAssetSource;
  /** Width (along the façade), height and depth in metres: the stored mesh's exact bounds. */
  readonly size: readonly [number, number, number];
  readonly mesh: FacadeAssetMesh;
  readonly groups: readonly FacadeAssetGroup[];
  /** Import warnings shown to the student (e.g. skipped curves, an assumed unit). */
  readonly warnings: readonly string[];
  /**
   * Materials when used as a Door / Open bay module (one per group, in order). Absent role = the
   * same as the façade (`groups`). Written only when set.
   */
  readonly bayMaterials?: { readonly door?: readonly FacadeMaterial[] | undefined; readonly open?: readonly FacadeMaterial[] | undefined } | undefined;
}

/** The materials of `asset` for one use (one per group, in order). */
export function materialsFor(asset: Pick<FacadeAssetV1, 'groups' | 'bayMaterials'>, role: FacadeRole): readonly FacadeMaterial[] {
  const own = role === 'wall' ? undefined : asset.bayMaterials?.[role];
  return own ?? asset.groups.map((g) => withFinish(g.color, finishOf(g)));
}

/** Decoded geometry, ready for rendering (Float32 positions in the panel frame, metres). */
export interface FacadeMeshData {
  readonly positions: Float32Array;
  readonly indices: Uint16Array | Uint32Array;
}

export interface FacadeAssetIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export type FacadeAssetResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly issues: readonly FacadeAssetIssue[] };

const positiveSize = z.number().refine(Number.isFinite, { error: 'must be finite' }).positive();
const materialFields = {
  color: z.string().regex(COLOR, { error: 'group colour must be #rrggbb' }),
  glass: z.boolean(),
  open: z.literal(true).optional(),
};
const bayMaterialsSchema = z.array(z.strictObject(materialFields)).max(FACADE_LIMITS.maxGroups).optional();

export const facadeAssetSchema = z.strictObject({
  id: z.string().regex(FACADE_ASSET_ID_PATTERN, { error: 'id must be "facade-" followed by 16 hex digits' }),
  kind: z.literal(FACADE_ASSET_KIND),
  name: z.string().trim().min(1, { error: 'name must not be empty' }).max(FACADE_LIMITS.maxNameLength),
  source: z.strictObject({
    fileName: z.string().max(255),
    bytes: z.int().min(0),
    sha256: z.string().regex(HEX64, { error: 'source.sha256 must be 64 lowercase hex digits' }),
    unit: z.enum(Object.keys(METRES_PER_UNIT) as [SourceUnit, ...SourceUnit[]]),
    unitAssumed: z.boolean(),
    outward: z.enum(['-y', '+y']),
    reader: z.string().max(64),
  }),
  size: z.tuple([positiveSize, positiveSize, z.number().refine(Number.isFinite).min(0)]),
  mesh: z.strictObject({
    vertices: z.int().min(3).max(FACADE_LIMITS.maxVertices),
    triangles: z.int().min(1).max(FACADE_LIMITS.maxTriangles),
    index: z.enum(['u16', 'u32']),
    sha256: z.string().regex(HEX64, { error: 'mesh.sha256 must be 64 lowercase hex digits' }),
    data: z.string(),
  }),
  groups: z
    .array(
      z.strictObject({
        name: z.string().max(FACADE_LIMITS.maxNameLength),
        ...materialFields,
        start: z.int().min(0),
        count: z.int().min(1),
      }),
    )
    .min(1)
    .max(FACADE_LIMITS.maxGroups),
  warnings: z.array(z.string().max(500)).max(64),
  bayMaterials: z.strictObject({ door: bayMaterialsSchema, open: bayMaterialsSchema }).optional(),
});

/** Bytes of the decoded mesh payload of an asset with this header. */
export const facadeMeshBytes = (mesh: Pick<FacadeAssetMesh, 'vertices' | 'triangles' | 'index'>): number =>
  mesh.vertices * 12 + mesh.triangles * 3 * (mesh.index === 'u16' ? 2 : 4);

// ---------------------------------------------------------------------------------------------
// Decoding (with a small cache: a project is re-validated on every autosave)

interface CacheEntry {
  /** Everything the payload checks depend on besides the data: counts, index type and size. */
  readonly header: string;
  readonly data: string;
  readonly mesh: FacadeMeshData;
}

const headerKey = (a: Pick<FacadeAssetV1, 'mesh' | 'size'>): string => `${a.mesh.vertices}|${a.mesh.triangles}|${a.mesh.index}|${a.size.join(',')}`;
const isVerified = (entry: CacheEntry | undefined, a: Pick<FacadeAssetV1, 'mesh' | 'size'>): entry is CacheEntry =>
  entry !== undefined && entry.header === headerKey(a) && entry.data === a.mesh.data;
const CACHE_LIMIT = 16;
/** sha256 → decoded mesh of an already verified payload (most recent last). */
const verified = new Map<string, CacheEntry>();

function remember(sha: string, entry: CacheEntry) {
  verified.delete(sha);
  verified.set(sha, entry);
  while (verified.size > CACHE_LIMIT) verified.delete(verified.keys().next().value!);
}

function decodePayload(bytes: Uint8Array, vertices: number, triangles: number, index: 'u16' | 'u32'): FacadeMeshData {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const positions = new Float32Array(vertices * 3);
  for (let i = 0; i < positions.length; i++) positions[i] = view.getFloat32(i * 4, true);
  const base = vertices * 12;
  const count = triangles * 3;
  if (index === 'u16') {
    const indices = new Uint16Array(count);
    for (let i = 0; i < count; i++) indices[i] = view.getUint16(base + i * 2, true);
    return { positions, indices };
  }
  const indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) indices[i] = view.getUint32(base + i * 4, true);
  return { positions, indices };
}

/** Tolerance for coordinates against the stored size (float32 values compared as stored). */
const SIZE_TOLERANCE = 1e-6;

/**
 * Validate a stored asset value completely (structure, identity, integrity, geometry, limits).
 * Never throws. On success returns a fresh, canonical copy.
 */
export function readFacadeAsset(input: unknown): FacadeAssetResult<FacadeAssetV1> {
  const parsed = facadeAssetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => ({ path: i.path.filter((p): p is string | number => typeof p !== 'symbol'), message: i.message })) };
  }
  const a = parsed.data;
  const issues: FacadeAssetIssue[] = [];
  const problem = (path: readonly (string | number)[], message: string) => issues.push({ path, message });
  if (a.id !== `facade-${a.mesh.sha256.slice(0, 16)}`) problem(['id'], 'id does not match the mesh hash');
  if (a.mesh.index === 'u16' && a.mesh.vertices > 65536) problem(['mesh', 'index'], 'u16 indices allow at most 65 536 vertices');
  const [width, height, depth] = a.size;
  if (Math.max(width, height, depth) > FACADE_LIMITS.maxExtentMetres) problem(['size'], `the component is larger than ${FACADE_LIMITS.maxExtentMetres} m`);
  if (depth > FACADE_LIMITS.maxDepthMetres) problem(['size', 2], `the component is deeper than ${FACADE_LIMITS.maxDepthMetres} m`);
  let next = 0;
  a.groups.forEach((g, i) => {
    if (g.start !== next) problem(['groups', i, 'start'], 'groups must be contiguous, in order, from triangle 0');
    next = g.start + g.count;
  });
  if (next !== a.mesh.triangles) problem(['groups'], 'groups must cover every triangle exactly once');
  for (const role of FACADE_VARIANTS) {
    const own = a.bayMaterials?.[role];
    if (own && own.length !== a.groups.length) problem(['bayMaterials', role], `${role} materials must have one entry per group (${a.groups.length})`);
  }
  if (issues.length > 0) return { ok: false, issues };

  if (!isVerified(verified.get(a.mesh.sha256), a)) {
    const bytes = base64ToBytes(a.mesh.data);
    if (!bytes) return { ok: false, issues: [{ path: ['mesh', 'data'], message: 'mesh data is not valid base64' }] };
    if (bytes.byteLength !== facadeMeshBytes(a.mesh)) {
      return { ok: false, issues: [{ path: ['mesh', 'data'], message: `mesh data has ${bytes.byteLength} bytes; ${facadeMeshBytes(a.mesh)} expected for ${a.mesh.vertices} vertices and ${a.mesh.triangles} triangles` }] };
    }
    if (sha256Hex(bytes) !== a.mesh.sha256) return { ok: false, issues: [{ path: ['mesh', 'sha256'], message: 'mesh data does not match its SHA-256 (the file is damaged)' }] };
    const mesh = decodePayload(bytes, a.mesh.vertices, a.mesh.triangles, a.mesh.index);
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.positions.length; i++) {
      const v = mesh.positions[i]!;
      const k = i % 3;
      if (!Number.isFinite(v) || v < -SIZE_TOLERANCE || v > a.size[k]! + SIZE_TOLERANCE) {
        return { ok: false, issues: [{ path: ['mesh', 'data'], message: `vertex ${Math.floor(i / 3)} lies outside the component's size` }] };
      }
      if (v > max[k]!) max[k] = v;
    }
    for (let k = 0; k < 3; k++) {
      if (Math.abs(max[k]! - a.size[k]!) > SIZE_TOLERANCE) return { ok: false, issues: [{ path: ['size', k], message: 'size does not match the mesh bounds' }] };
    }
    for (let i = 0; i < mesh.indices.length; i++) {
      if (mesh.indices[i]! >= a.mesh.vertices) return { ok: false, issues: [{ path: ['mesh', 'data'], message: `triangle index ${mesh.indices[i]} is out of range` }] };
    }
    remember(a.mesh.sha256, { header: headerKey(a), data: a.mesh.data, mesh });
  }
  return { ok: true, value: canonicalFacadeAsset(a) };
}

/** Canonical key order (also used for writing). */
export function canonicalFacadeAsset(a: FacadeAssetV1): FacadeAssetV1 {
  return {
    id: a.id,
    kind: FACADE_ASSET_KIND,
    name: a.name,
    source: {
      fileName: a.source.fileName,
      bytes: a.source.bytes,
      sha256: a.source.sha256,
      unit: a.source.unit,
      unitAssumed: a.source.unitAssumed,
      outward: a.source.outward,
      reader: a.source.reader,
    },
    size: [a.size[0], a.size[1], a.size[2]],
    mesh: { vertices: a.mesh.vertices, triangles: a.mesh.triangles, index: a.mesh.index, sha256: a.mesh.sha256, data: a.mesh.data },
    groups: a.groups.map((g) => ({ name: g.name, ...withFinish(g.color, finishOf(g)), start: g.start, count: g.count })),
    warnings: [...a.warnings],
    ...bayMaterialsOf(a),
  };
}

/** `{ bayMaterials }` in canonical form, or nothing when no role has its own materials. */
function bayMaterialsOf(a: Pick<FacadeAssetV1, 'bayMaterials'>): { bayMaterials?: NonNullable<FacadeAssetV1['bayMaterials']> } {
  const out: { door?: FacadeMaterial[]; open?: FacadeMaterial[] } = {};
  for (const role of FACADE_VARIANTS) {
    const own = a.bayMaterials?.[role];
    if (own) out[role] = own.map((m) => withFinish(m.color, finishOf(m)));
  }
  return Object.keys(out).length > 0 ? { bayMaterials: out } : {};
}

/**
 * Decoded geometry of a VALID asset (as returned by `readFacadeAsset` or `createFacadeAsset`).
 * Cached by hash; throws only when handed an asset that was never validated and is corrupt.
 */
export function facadeMeshData(asset: FacadeAssetV1): FacadeMeshData {
  const cached = verified.get(asset.mesh.sha256);
  if (isVerified(cached, asset)) return cached.mesh;
  const read = readFacadeAsset(asset);
  if (!read.ok) throw new Error(`invalid façade asset ${asset.id}: ${read.issues.map((i) => i.message).join('; ')}`);
  return verified.get(asset.mesh.sha256)!.mesh;
}

// ---------------------------------------------------------------------------------------------
// Creating

export interface CreateFacadeAssetOptions {
  readonly fileName: string;
  readonly fileBytes: number;
  readonly fileSha256: string;
  readonly unit: SourceUnit;
  readonly unitAssumed: boolean;
  readonly reader: string;
  readonly warnings?: readonly string[];
  /** Display name (default: the file name without its extension). */
  readonly name?: string;
}

/** Display name from a file name: no folder, no `.3dm`, trimmed, at most 80 characters. */
export function facadeNameFromFile(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const name = base.replace(/\.3dm$/i, '').trim().slice(0, FACADE_LIMITS.maxNameLength).trim();
  return name.length > 0 ? name : 'Imported façade';
}

const hexColour = (c: string): string => (COLOR.test(c.toLowerCase()) ? c.toLowerCase() : '#c8c2b8');

/** Encode a normalised component as a stored asset (validated before it is returned). */
export function createFacadeAsset(component: FacadeComponent, options: CreateFacadeAssetOptions): FacadeAssetResult<FacadeAssetV1> {
  const vertices = component.positions.length / 3;
  const triangles = component.indices.length / 3;
  const index: 'u16' | 'u32' = vertices <= 65536 ? 'u16' : 'u32';
  const bytes = new Uint8Array(facadeMeshBytes({ vertices, triangles, index }));
  const view = new DataView(bytes.buffer);
  const max = [0, 0, 0];
  for (let i = 0; i < component.positions.length; i++) {
    // Clamp tiny negative zero/rounding (the adapter places the minimum at exactly 0).
    const value = Math.fround(Math.max(0, component.positions[i]!));
    view.setFloat32(i * 4, value, true);
    max[i % 3] = Math.max(max[i % 3]!, value);
  }
  const base = vertices * 12;
  for (let i = 0; i < component.indices.length; i++) {
    if (index === 'u16') view.setUint16(base + i * 2, component.indices[i]!, true);
    else view.setUint32(base + i * 4, component.indices[i]!, true);
  }
  const sha256 = sha256Hex(bytes);
  const groups = component.groups.map((g: ComponentGroup) => ({
    name: g.name.slice(0, FACADE_LIMITS.maxNameLength),
    color: hexColour(g.color),
    glass: g.glass,
    start: g.start,
    count: g.count,
  }));
  const asset: FacadeAssetV1 = {
    id: `facade-${sha256.slice(0, 16)}`,
    kind: FACADE_ASSET_KIND,
    name: (options.name ?? facadeNameFromFile(options.fileName)).trim().slice(0, FACADE_LIMITS.maxNameLength) || 'Imported façade',
    source: {
      fileName: options.fileName.split(/[\\/]/).pop()!.slice(0, 255),
      bytes: options.fileBytes,
      sha256: options.fileSha256,
      unit: options.unit,
      unitAssumed: options.unitAssumed,
      outward: component.outward,
      reader: options.reader.slice(0, 64),
    },
    size: [max[0]!, max[1]!, max[2]!],
    mesh: { vertices, triangles, index, sha256, data: bytesToBase64(bytes) },
    groups,
    warnings: (options.warnings ?? []).slice(0, 64).map((w) => w.slice(0, 500)),
  };
  return readFacadeAsset(asset);
}

/** Decoded payload bytes of a list of assets (what counts towards the project limits). */
export const facadeAssetsBytes = (assets: readonly Pick<FacadeAssetV1, 'mesh'>[]): number => assets.reduce((sum, a) => sum + facadeMeshBytes(a.mesh), 0);

/** Short human description: "3.00 × 3.00 × 0.20 m · 60 triangles". */
export function describeFacadeAsset(asset: Pick<FacadeAssetV1, 'size' | 'mesh'>): string {
  const [w, h, d] = asset.size;
  return `${w.toFixed(2)} × ${h.toFixed(2)} × ${d.toFixed(2)} m · ${asset.mesh.triangles.toLocaleString('en-GB')} triangles`;
}

/** "12.3 KB" / "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
