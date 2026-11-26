/**
 * Relative imports between the files of an uploaded toolkit (owner 2026-11-26): one rule, used by
 * the main thread (to check every import before anything runs) and by the upload worker (to
 * evaluate the modules). Pure and dependency-free, so the worker bundle stays small.
 *
 * `"../functions/kitchen"` from `house/algorithms/grow.ts` is `house/functions/kitchen.ts`; a
 * specifier may also end in `.ts` or `.js` (TypeScript's ESM style), or name a folder with an
 * `index.ts`. A path never leaves the toolkit folder (its first part).
 */
export function resolveToolkitImport(from: string, specifier: string, exists: (path: string) => boolean): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const parts = from.split('/').slice(0, -1);
  const root = parts[0];
  for (const part of specifier.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      if (parts.length <= 1) return null; // would leave the toolkit folder
      parts.pop();
    } else parts.push(part);
  }
  if (parts[0] !== root) return null;
  const base = parts.join('/');
  const stem = base.replace(/\.(ts|js)$/, '');
  for (const candidate of [`${stem}.ts`, `${base}/index.ts`]) if (exists(candidate)) return candidate;
  return null;
}
