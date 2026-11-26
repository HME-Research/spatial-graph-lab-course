/**
 * A minimal zip writer for the AI kits (owner 2026-11-20: the app builds every kit when it is
 * downloaded, so the This project kit can carry a generated PROJECT.md). Stored entries (no
 * compression: the kits are a few small text files), UTF-8 names, a fixed timestamp (1980-01-01) and
 * the entries in the order given, so the same files always give the same bytes. Pure; no dependency.
 */

/** One file: text (UTF-8, line endings normalised to LF) or, since 2026-11-26 (toolkit download), raw bytes. */
export type ZipEntry =
  | {
      /** Path inside the zip, with `/` separators. */
      readonly name: string;
      readonly text: string;
    }
  | { readonly name: string; readonly bytes: Uint8Array };

let table: Uint32Array | undefined;
function crcTable(): Uint32Array {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

/** CRC-32 (the zip checksum). */
export function crc32(bytes: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (const b of bytes) c = t[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

/** One entry ready to be written: its name, its (packed) data, and what the headers say about it. */
interface Packed {
  readonly name: Uint8Array;
  readonly data: Uint8Array;
  readonly size: number;
  readonly crc: number;
  /** 0 stored, 8 deflated. */
  readonly method: 0 | 8;
}

const encoder = new TextEncoder();
const entryBytes = (entry: ZipEntry): Uint8Array => ('text' in entry ? encoder.encode(entry.text.replace(/\r\n/g, '\n')) : entry.bytes);

function assemble(items: readonly Packed[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const { name, data, size, crc, method } of items) {
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, method, true);
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    const head = new DataView(new ArrayBuffer(46));
    head.setUint32(0, 0x02014b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 20, true);
    head.setUint16(8, 0x0800, true);
    head.setUint16(10, method, true);
    head.setUint16(12, DOS_TIME, true);
    head.setUint16(14, DOS_DATE, true);
    head.setUint32(16, crc, true);
    head.setUint32(20, data.length, true);
    head.setUint32(24, size, true);
    head.setUint16(28, name.length, true);
    head.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    central.push(new Uint8Array(head.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, items.length, true);
  end.setUint16(10, items.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of all) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

/** The zip file's bytes. Line endings are normalised to LF, so the kit is the same on every system. */
export function storedZip(entries: readonly ZipEntry[]): Uint8Array {
  return assemble(
    entries.map((entry) => {
      const data = entryBytes(entry);
      return { name: encoder.encode(entry.name), data, size: data.length, crc: crc32(data), method: 0 };
    }),
  );
}

/**
 * A COMPRESSED zip (2026-11-26, Download toolkit (.zip): a toolkit's façade files must fit the 5 MB
 * upload limit again). Each entry is deflated with the platform's `CompressionStream('deflate-raw')`
 * and kept stored when that does not make it smaller. Same order, names and timestamp as `storedZip`.
 */
export async function deflatedZip(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  const items: Packed[] = [];
  for (const entry of entries) {
    const data = entryBytes(entry);
    const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const packed = new Uint8Array(await new Response(stream).arrayBuffer());
    const smaller = packed.length < data.length;
    items.push({ name: encoder.encode(entry.name), data: smaller ? packed : data, size: data.length, crc: crc32(data), method: smaller ? 8 : 0 });
  }
  return assemble(items);
}
