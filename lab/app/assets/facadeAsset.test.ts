import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, sha256Hex } from './binary';
import { normaliseFacadeSource, type FacadeComponent, type SourceMesh } from './facadeAdapter';
import {
  createFacadeAsset,
  describeFacadeAsset,
  facadeAssetsBytes,
  facadeMeshBytes,
  facadeMeshData,
  facadeNameFromFile,
  materialsFor,
  readFacadeAsset,
  type FacadeAssetV1,
} from './facadeAsset';

const text = (s: string) => new TextEncoder().encode(s);

describe('binary helpers', () => {
  it('SHA-256 matches the FIPS 180-4 / NIST test vectors', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex(text('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex(text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
    // One million "a": crosses many blocks and the 55/56/64-byte padding boundaries on the way.
    expect(sha256Hex(new Uint8Array(1_000_000).fill(0x61))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
    for (const n of [55, 56, 63, 64, 65, 119, 120]) expect(sha256Hex(new Uint8Array(n).fill(7))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('base64 round-trips every length and rejects non-canonical text', () => {
    for (let n = 0; n < 70; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      const encoded = bytesToBase64(bytes);
      expect(encoded).toBe(globalThis.btoa(String.fromCharCode(...bytes)));
      expect(base64ToBytes(encoded)).toEqual(bytes);
    }
    const big = Uint8Array.from({ length: 200_000 }, (_, i) => i & 255);
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big);
    expect(base64ToBytes('abc')).toBeNull(); // length
    expect(base64ToBytes('ab$=')).toBeNull(); // alphabet
    expect(base64ToBytes('QR==')).toBeNull(); // non-zero padding bits ("QQ==" is canonical)
    expect(base64ToBytes('QQ==')).toEqual(Uint8Array.of(65));
    expect(base64ToBytes('=AAA')).toBeNull();
  });
});

function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, group = 0): SourceMesh {
  const v = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  return { positions: v, indices: quads.flatMap(([a, b, c, d]) => [a!, b!, c!, a!, c!, d!]), group };
}

function panel(): FacadeComponent {
  const result = normaliseFacadeSource({
    unit: 'm',
    meshes: [box(0.6, 0.08, 0.9, 2.4, 0.1, 2.6, 1), box(0, 0, 0, 3, 0.2, 0.9), box(0, 0, 2.6, 3, 0.2, 3)],
    groups: [
      { name: 'Frame', color: '#787878', glass: false },
      { name: 'Glass', color: '#96C8E6', glass: true },
    ],
  });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.component;
}

const OPTIONS = { fileName: 'C:\\models\\Bay window.3dm', fileBytes: 1234, fileSha256: 'a'.repeat(64), unit: 'm' as const, unitAssumed: false, reader: 'rhino3dm@8.17.0' };

function asset(): FacadeAssetV1 {
  const made = createFacadeAsset(panel(), OPTIONS);
  if (!made.ok) throw new Error(JSON.stringify(made.issues));
  return made.value;
}

/** A copy with a re-encoded payload (correct hash and id), to test checks behind the hash. */
function withPayload(base: FacadeAssetV1, edit: (view: DataView) => void, header: Partial<FacadeAssetV1['mesh']> = {}): FacadeAssetV1 {
  const bytes = base64ToBytes(base.mesh.data)!;
  edit(new DataView(bytes.buffer));
  const sha256 = sha256Hex(bytes);
  return { ...base, id: `facade-${sha256.slice(0, 16)}`, mesh: { ...base.mesh, ...header, sha256, data: bytesToBase64(bytes) } };
}

describe('façade asset format', () => {
  it('encodes a component: groups in source order, u16 indices, exact size, content-addressed id', () => {
    const a = asset();
    expect(a.kind).toBe('facade-mesh');
    expect(a.name).toBe('Bay window');
    expect(a.source.fileName).toBe('Bay window.3dm');
    expect(a.id).toBe(`facade-${a.mesh.sha256.slice(0, 16)}`);
    expect(a.mesh).toMatchObject({ vertices: 24, triangles: 36, index: 'u16' });
    expect(facadeMeshBytes(a.mesh)).toBe(24 * 12 + 36 * 3 * 2);
    expect(base64ToBytes(a.mesh.data)!.byteLength).toBe(facadeMeshBytes(a.mesh));
    expect(a.groups).toEqual([
      { name: 'Frame', color: '#787878', glass: false, start: 0, count: 24 },
      { name: 'Glass', color: '#96c8e6', glass: true, start: 24, count: 12 },
    ]);
    expect(a.size[0]).toBeCloseTo(3, 6);
    expect(a.size[1]).toBeCloseTo(3, 6);
    expect(a.size[2]).toBeCloseTo(0.2, 6);
    expect(describeFacadeAsset(a)).toBe('3.00 × 3.00 × 0.20 m · 36 triangles');
    // Identical input → identical asset (deterministic, so re-imports deduplicate).
    expect(asset()).toEqual(a);
  });

  it('decodes to the same geometry (float32), and a JSON round trip re-validates', () => {
    const a = asset();
    const mesh = facadeMeshData(a);
    const source = panel();
    expect(mesh.indices).toEqual(Uint16Array.from(source.indices));
    for (let i = 0; i < mesh.positions.length; i++) expect(mesh.positions[i]).toBeCloseTo(source.positions[i]!, 6);
    const again = readFacadeAsset(JSON.parse(JSON.stringify(a)));
    expect(again.ok && again.value).toEqual(a);
  });

  it('an Open finish and per-use (door / open bay) materials are validated and written canonically', () => {
    const a = asset();
    const one = { color: '#112233', glass: false, open: true as const };
    const withBays: FacadeAssetV1 = { ...a, groups: a.groups.map((g) => ({ ...g, glass: true, open: true })), bayMaterials: { door: a.groups.map(() => one) } };
    const read = readFacadeAsset(JSON.parse(JSON.stringify(withBays)));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    // Open wins over glass and is written as { glass: false, open: true }; absent roles are not written.
    expect(read.value.groups.every((g) => g.open === true && g.glass === false)).toBe(true);
    expect(read.value.bayMaterials).toEqual({ door: a.groups.map(() => one) });
    expect(materialsFor(read.value, 'open')).toEqual(materialsFor(read.value, 'wall'));
    // One entry per group, and only known fields.
    expect(readFacadeAsset({ ...withBays, bayMaterials: { door: [] } }).ok).toBe(false);
    expect(readFacadeAsset({ ...withBays, bayMaterials: { window: [one] } }).ok).toBe(false);
    expect(readFacadeAsset({ ...a, groups: a.groups.map((g) => ({ ...g, open: false })) }).ok).toBe(false);
    // Without the new fields an asset is written exactly as before.
    const plain = readFacadeAsset(a);
    expect(plain.ok && Object.keys(plain.value)).not.toContain('bayMaterials');
    expect(plain.ok && plain.value.groups.some((g) => 'open' in g)).toBe(false);
  });

  it('uses 32-bit indices above 65 536 vertices', () => {
    const quads: SourceMesh[] = [];
    // 16 500 boxes = 132 000 vertices, 198 000 triangles would exceed the budget, so use few, big meshes:
    const n = 70_000; // vertices in one fan-like strip mesh
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < n; i++) positions.push((i % 1000) * 0.003, 0.1 * (i % 2), Math.floor(i / 1000) * 0.04);
    for (let i = 0; i + 2 < n && indices.length < 90_000 * 3; i += 3) indices.push(i, i + 1, i + 2);
    quads.push({ positions, indices });
    const result = normaliseFacadeSource({ unit: 'm', meshes: quads });
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    const made = createFacadeAsset(result.component, OPTIONS);
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.value.mesh.index).toBe('u32');
    expect(readFacadeAsset(made.value).ok).toBe(true);
  });

  it('refuses damaged or inconsistent assets (never trusts the declared header)', () => {
    const a = asset();
    const refused = (value: unknown, pattern: RegExp) => {
      const read = readFacadeAsset(value);
      expect(read.ok).toBe(false);
      if (!read.ok) expect(read.issues.map((i) => i.message).join(' | ')).toMatch(pattern);
    };
    // A flipped payload byte: the hash no longer matches.
    const bytes = base64ToBytes(a.mesh.data)!;
    bytes[5] = bytes[5]! ^ 1;
    refused({ ...a, mesh: { ...a.mesh, data: bytesToBase64(bytes) } }, /SHA-256/);
    refused({ ...a, id: 'facade-0000000000000000' }, /id does not match/);
    refused({ ...a, mesh: { ...a.mesh, data: a.mesh.data.slice(0, -4) } }, /bytes; \d+ expected/);
    refused({ ...a, mesh: { ...a.mesh, data: '***' } }, /not valid base64/);
    refused({ ...a, mesh: { ...a.mesh, triangles: 35 } }, /cover every triangle|bytes/);
    refused({ ...a, groups: [{ ...a.groups[0]!, start: 1 }, a.groups[1]] }, /contiguous/);
    refused({ ...a, groups: [] }, /./);
    refused({ ...a, size: [3, 3, 2] }, /deeper than 1 m/);
    refused({ ...a, size: [60, 3, 0.2] }, /larger than 50 m/);
    refused({ ...a, extra: true }, /./);
    refused({ ...a, kind: 'glb' }, /./);
    refused({ ...a, groups: [{ ...a.groups[0]!, color: 'red' }, a.groups[1]] }, /#rrggbb/);
    // Checks behind a VALID hash: an out-of-range index, a vertex outside the size, a wrong size.
    refused(withPayload(a, (v) => v.setUint16(24 * 12, 999, true)), /out of range/);
    refused(withPayload(a, (v) => v.setFloat32(0, 7, true)), /outside the component's size/);
    refused(withPayload(a, (v) => v.setFloat32(0, Number.NaN, true)), /outside the component's size/);
    refused({ ...a, size: [a.size[0] + 0.5, a.size[1], a.size[2]] }, /does not match the mesh bounds/);
    refused({ ...a, mesh: { ...a.mesh, index: 'u32' } }, /bytes; \d+ expected/);
  });

  it('a verified payload is cached by hash, but a changed payload or header is checked again', () => {
    const a = asset();
    expect(readFacadeAsset(a).ok).toBe(true); // cached now
    const bytes = base64ToBytes(a.mesh.data)!;
    bytes[0] = bytes[0]! ^ 1;
    const forged = { ...a, mesh: { ...a.mesh, data: bytesToBase64(bytes) } };
    expect(readFacadeAsset(forged).ok).toBe(false);
    expect(() => facadeMeshData(forged)).toThrow(/invalid façade asset/);
    // Same (cached) payload under a different header: never served from the cache.
    expect(readFacadeAsset({ ...a, mesh: { ...a.mesh, index: 'u32' } }).ok).toBe(false);
    expect(readFacadeAsset({ ...a, size: [a.size[0] + 0.5, a.size[1], a.size[2]] }).ok).toBe(false);
    expect(readFacadeAsset(a).ok).toBe(true);
  });

  it('names come from the file name; totals count decoded bytes', () => {
    expect(facadeNameFromFile('/tmp/Fins v2.3DM')).toBe('Fins v2');
    expect(facadeNameFromFile('.3dm')).toBe('Imported façade');
    expect(facadeNameFromFile(`${'x'.repeat(200)}.3dm`)).toHaveLength(80);
    const a = asset();
    expect(facadeAssetsBytes([a, a])).toBe(2 * facadeMeshBytes(a.mesh));
  });
});
