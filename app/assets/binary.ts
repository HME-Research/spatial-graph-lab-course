/**
 * Binary helpers for embedded façade assets. Pure, synchronous and dependency-free, so the
 * (synchronous) project-file reader can verify an asset's integrity without `crypto.subtle`.
 *
 * - `sha256Hex`: FIPS 180-4 SHA-256 of bytes, as 64 lowercase hex digits.
 * - `bytesToBase64` / `base64ToBytes`: standard base64 (RFC 4648 §4, with padding), chunked so
 *   multi-megabyte payloads never hit argument-count limits. `base64ToBytes` returns null for
 *   anything that is not canonical base64 (wrong alphabet, length or padding).
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of `bytes` as 64 lowercase hex digits. */
export function sha256Hex(bytes: Uint8Array): string {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const length = bytes.length;
  // Message + 0x80 + zero padding + 64-bit big-endian bit length, a multiple of 64 bytes.
  const total = Math.ceil((length + 9) / 64) * 64;
  const tail = new Uint8Array(total - Math.floor(length / 64) * 64);
  const fullBlocks = Math.floor(length / 64);
  tail.set(bytes.subarray(fullBlocks * 64));
  tail[length - fullBlocks * 64] = 0x80;
  const bits = length * 8;
  const tv = new DataView(tail.buffer);
  tv.setUint32(tail.length - 8, Math.floor(bits / 0x100000000));
  tv.setUint32(tail.length - 4, bits >>> 0);

  const block = (data: Uint8Array, offset: number) => {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = ((data[j]! << 24) | (data[j + 1]! << 16) | (data[j + 2]! << 8) | data[j + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, k = h[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (k + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + k) >>> 0;
  };

  for (let i = 0; i < fullBlocks; i++) block(bytes, i * 64);
  for (let offset = 0; offset < tail.length; offset += 64) block(tail, offset);
  let hex = '';
  for (let i = 0; i < 8; i++) hex += h[i]!.toString(16).padStart(8, '0');
  return hex;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DECODE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/** Standard padded base64 of `bytes`. */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 3 * 16384; // a multiple of 3, so only the last chunk is padded
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(bytes.length, start + CHUNK);
    let out = '';
    let i = start;
    for (; i + 2 < end; i += 3) {
      const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
      out += ALPHABET[(n >>> 18) & 63]! + ALPHABET[(n >>> 12) & 63]! + ALPHABET[(n >>> 6) & 63]! + ALPHABET[n & 63]!;
    }
    if (i < end) {
      const n = (bytes[i]! << 16) | ((i + 1 < end ? bytes[i + 1]! : 0) << 8);
      out += ALPHABET[(n >>> 18) & 63]! + ALPHABET[(n >>> 12) & 63]! + (i + 1 < end ? ALPHABET[(n >>> 6) & 63]! : '=') + '=';
    }
    parts.push(out);
  }
  return parts.join('');
}

/** Bytes of canonical padded base64, or null when `text` is not canonical base64. */
export function base64ToBytes(text: string): Uint8Array | null {
  if (text.length % 4 !== 0) return null;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const last = i + 4 === text.length;
    const c0 = text.charCodeAt(i);
    const c1 = text.charCodeAt(i + 1);
    const c2 = text.charCodeAt(i + 2);
    const c3 = text.charCodeAt(i + 3);
    const a = c0 < 128 ? DECODE[c0]! : -1;
    const b = c1 < 128 ? DECODE[c1]! : -1;
    const pad2 = last && padding === 2;
    const pad1 = last && padding >= 1;
    const c = pad2 ? 0 : c2 < 128 ? DECODE[c2]! : -1;
    const d = pad1 ? 0 : c3 < 128 ? DECODE[c3]! : -1;
    if (a < 0 || b < 0 || c < 0 || d < 0) return null;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    // Canonical: the bits dropped by padding must be zero.
    if (pad2 && (n & 0xffff) !== 0) return null;
    if (pad1 && !pad2 && (n & 0xff) !== 0) return null;
    out[o++] = (n >>> 16) & 255;
    if (!pad2) out[o++] = (n >>> 8) & 255;
    if (!pad1) out[o++] = n & 255;
  }
  return out;
}
