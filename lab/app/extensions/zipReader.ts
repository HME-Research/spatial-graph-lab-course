/**
 * A small zip READER for uploaded toolkits (owner 2026-11-26). Supports what chat assistants,
 * Windows "Send to › Compressed folder", macOS "Compress" and the app's own `storedZip` produce:
 * stored (method 0) and deflated (method 8) entries, read through the central directory.
 * Deflate is undone by the platform's `DecompressionStream('deflate-raw')` (browsers and Node 18+),
 * so no dependency is needed. Encrypted entries, zip64 archives and other methods are refused with
 * a plain message. Pure apart from that stream; never throws.
 */

export interface ZipFileEntry {
  /** Path inside the zip, `/` separators (backslashes are turned into `/`). */
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ZipReadLimits {
  /** Most entries (folders included) the archive may list. */
  readonly maxEntries: number;
  /** Largest unpacked file. */
  readonly maxFileBytes: number;
  /** Largest unpacked total. */
  readonly maxTotalBytes: number;
  /**
   * Whether to unpack an entry at all (e.g. skip `__MACOSX/`). Skipped entries do not count
   * toward the byte limits. Default: every file.
   */
  readonly wanted?: (path: string) => boolean;
}

export type ZipReadResult = { readonly ok: true; readonly files: readonly ZipFileEntry[] } | { readonly ok: false; readonly message: string };

const NOT_A_ZIP = 'This is not a zip file (or it is damaged). Make the zip again and upload that file.';

let table: Uint32Array | undefined;
/** CRC-32, as in `app/ui/guide/zip.ts` (the writer). */
function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = table[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const Stream = (globalThis as { DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array> }).DecompressionStream;
  if (!Stream) throw new Error('this browser cannot unpack compressed zip files');
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new Stream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const MB = (n: number) => `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;

/** Read every wanted file of a zip archive, in archive order. */
export async function readZip(bytes: Uint8Array, limits: ZipReadLimits): Promise<ZipReadResult> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End of central directory: 22 bytes plus an optional comment of up to 65535 bytes.
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 65535); at--) {
    if (view.getUint32(at, true) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) return { ok: false, message: NOT_A_ZIP };
  const count = view.getUint16(end + 10, true);
  const dirSize = view.getUint32(end + 12, true);
  const dirOffset = view.getUint32(end + 16, true);
  if (count === 0xffff || dirOffset === 0xffffffff) return { ok: false, message: 'This zip uses the "zip64" format, which the app cannot read. Make a normal zip of the folder.' };
  if (dirOffset + dirSize > bytes.length) return { ok: false, message: NOT_A_ZIP };
  if (count > limits.maxEntries) return { ok: false, message: `The zip holds ${count} entries; at most ${limits.maxEntries} are allowed. Zip only the toolkit folder.` };

  const decoder = new TextDecoder();
  const files: ZipFileEntry[] = [];
  let total = 0;
  let at = dirOffset;
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) return { ok: false, message: NOT_A_ZIP };
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const path = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)).replace(/\\/g, '/');
    at += 46 + nameLength + extraLength + commentLength;
    if (path.endsWith('/')) continue; // a folder
    if (limits.wanted && !limits.wanted(path)) continue;
    if (flags & 1) return { ok: false, message: `${path} is password-protected. Make the zip without a password.` };
    if (method !== 0 && method !== 8) return { ok: false, message: `${path} is packed with a method the app cannot read. Make the zip with your computer's normal "compress" command.` };
    if (size > limits.maxFileBytes) return { ok: false, message: `${path} is ${MB(size)} unpacked; one file may be at most ${MB(limits.maxFileBytes)}.` };
    total += size;
    if (total > limits.maxTotalBytes) return { ok: false, message: `The files in the zip are more than ${MB(limits.maxTotalBytes)} unpacked together.` };
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) return { ok: false, message: NOT_A_ZIP };
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + packed > bytes.length) return { ok: false, message: NOT_A_ZIP };
    const raw = bytes.subarray(start, start + packed);
    let data: Uint8Array;
    try {
      data = method === 0 ? raw.slice() : await inflateRaw(raw);
    } catch (error) {
      return { ok: false, message: `${path} could not be unpacked (${error instanceof Error ? error.message : String(error)}). Make the zip again.` };
    }
    if (data.length !== size || crc32(data) !== crc) return { ok: false, message: `${path} is damaged in the zip. Make the zip again.` };
    files.push({ path, bytes: data });
  }
  return { ok: true, files };
}
