/**
 * Uploaded analyses and transforms, step 1 (Programme P4, item I; transforms 2026-11-25): checks on
 * the uploaded TEXT and type stripping. Nothing here runs student code.
 *
 * - Size, file name and imports are checked on the source text: an upload is one file
 *   that imports only `@student-api` (the same rule as toolkit code, without the toolkit's own files).
 * - Types are stripped with Sucrase, which is loaded with a dynamic `import()` only when a file is
 *   uploaded or a project with uploads is opened, so it is not part of the main bundle. Sucrase
 *   keeps line numbers, so runtime errors point at the student's own lines.
 */

/** Largest uploaded file, in bytes (UTF-8). */
export const MAX_UPLOAD_BYTES = 100_000;
/** At most this many uploaded analyses per project. */
export const MAX_UPLOADED_ANALYSES = 20;
/** At most this many uploaded transforms per project (2026-11-25; same limit as analyses). */
export const MAX_UPLOADED_TRANSFORMS = 20;

/** What an upload is meant to be: decides the words of the messages (the upload surface decides what is accepted). */
export type UploadKind = 'analysis' | 'transform';
const plural = (kind: UploadKind) => (kind === 'analysis' ? 'analyses' : 'transforms');
/** Longest stored file name. */
export const MAX_UPLOAD_FILE_NAME = 120;

/** A transform uploaded in Analyse (the upload surface decides what is accepted). */
export const SPATIAL_REFUSAL =
  'This file is a transform (defineSpatialAlgorithm): upload it in Transform › Upload your own (.ts). Analyse takes only analyses (defineGraphAlgorithm or defineDesignAnalysis).';
/** An analysis uploaded in Transform. */
export const ANALYSIS_REFUSAL =
  'This file is an analysis (defineGraphAlgorithm or defineDesignAnalysis): upload it in Analyse › Upload your own (.ts). Transform takes only transforms (defineSpatialAlgorithm).';

/** The only module an uploaded analysis may import. */
export const STUDENT_API_MODULE = '@student-api';

/** "100.1 KB" (rounded up to 0.1 KB, so a file just over the limit never reads as the limit). */
export const formatUploadSize = (bytes: number) => `${Math.ceil(bytes / 100) / 10} KB`;
const kb = formatUploadSize;

/** `.ts` (TypeScript, types stripped) or `.js`; anything else is refused. */
export function uploadLanguage(fileName: string): 'ts' | 'js' | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.d.ts')) return null;
  if (lower.endsWith('.ts')) return 'ts';
  if (lower.endsWith('.js')) return 'js';
  return null;
}

/**
 * Static `import`/`export … from`, side-effect `import '…'`, dynamic `import(…)` and `require(…)`
 * (the same pattern as the toolkit import boundary test). `from` counts only inside an
 * import/export statement, so text such as `from "${start}"` in messages is not mistaken for one.
 */
const SPECIFIER =
  /^\s*(?:import|export)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]/gm;

/** Every module the source names, with the line it is named on (in order, duplicates kept). */
export function importedModulesWithLines(source: string): { readonly specifier: string; readonly line: number }[] {
  return [...source.matchAll(SPECIFIER)].map((m) => {
    const specifier = (m[1] ?? m[2] ?? m[3] ?? m[4])!;
    // The line of the specifier itself (a multi-line import names it on its last line).
    const at = m.index + m[0].lastIndexOf(specifier);
    return { specifier, line: source.slice(0, at).split('\n').length };
  });
}

/** Every module the source names (in order, without duplicates). */
export function importedModules(source: string): string[] {
  return [...new Set([...source.matchAll(SPECIFIER)].map((m) => (m[1] ?? m[2] ?? m[3] ?? m[4])!))];
}

/** Readable refusal of one import, or null when it is allowed. */
export function importProblem(specifier: string, kind: UploadKind = 'analysis'): string | null {
  if (specifier === STUDENT_API_MODULE) return null;
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return `This file imports "${specifier}". An uploaded ${kind} must be a single file that imports only "${STUDENT_API_MODULE}" (put helper functions in the same file).`;
  }
  return `This file imports "${specifier}". Uploaded ${plural(kind)} may import only "${STUDENT_API_MODULE}".`;
}

/** "is not a .ts or .js file" (the same words before and after reading the file). */
export const notTypeScriptProblem = (fileName: string, kind: UploadKind = 'analysis') => `"${fileName}" is not a .ts or .js file. Upload the ${kind} as a .ts file.`;
/** "is 250 KB; … may be at most 100 KB". */
export const tooLargeProblem = (fileName: string, bytes: number, kind: UploadKind = 'analysis') =>
  `"${fileName}" is ${kb(bytes)}; an uploaded ${kind} may be at most ${kb(MAX_UPLOAD_BYTES)}.`;

/** Problems with the uploaded text itself (name, size, imports); empty when it may be compiled. */
export function sourceProblems(source: string, fileName: string, kind: UploadKind = 'analysis'): string[] {
  if (uploadLanguage(fileName) === null) return [notTypeScriptProblem(fileName, kind)];
  const bytes = new TextEncoder().encode(source).length;
  if (bytes > MAX_UPLOAD_BYTES) return [tooLargeProblem(fileName, bytes, kind)];
  if (source.trim() === '') return [`"${fileName}" is empty.`];
  return importedModules(source)
    .map((m) => importProblem(m, kind))
    .filter((p): p is string => p !== null);
}

export type CompiledUpload = { readonly ok: true; readonly code: string } | { readonly ok: false; readonly problems: readonly string[] };

/** A Sucrase syntax error as "Line 3, column 12: Unexpected token". */
function syntaxMessage(error: unknown): string {
  const e = error as { message?: unknown; loc?: { line?: unknown; column?: unknown } };
  const raw = typeof e?.message === 'string' ? e.message : String(error);
  const text = raw.replace(/^Error transforming [^:]*: /, '').replace(/\s*\(\d+:\d+\)\s*$/, '');
  const line = typeof e?.loc?.line === 'number' ? e.loc.line : undefined;
  const column = typeof e?.loc?.column === 'number' ? e.loc.column : undefined; // Sucrase columns count from 1
  return line !== undefined ? `Syntax error on line ${line}${column !== undefined ? `, column ${column}` : ''}: ${text}` : `Syntax error: ${text}`;
}

/**
 * Check the text, then strip the types and turn `import`/`export` into `require`/`exports`, which
 * the worker provides (`require('@student-api')` returns the upload shim). Never throws.
 */
export async function compileUpload(source: string, fileName: string, kind: UploadKind = 'analysis'): Promise<CompiledUpload> {
  const problems = sourceProblems(source, fileName, kind);
  if (problems.length > 0) return { ok: false, problems };
  return transpile(source, fileName);
}

/**
 * Sucrase only (no checks on the text): strip the types and turn `import`/`export` into
 * `require`/`exports`. Shared by single-file uploads and uploaded toolkits (2026-11-26). Never throws.
 */
export async function transpile(source: string, fileName: string): Promise<CompiledUpload> {
  let transform: (code: string, options: { transforms: ('typescript' | 'imports')[]; filePath?: string }) => { code: string };
  try {
    ({ transform } = await import('sucrase'));
  } catch (error) {
    return { ok: false, problems: [`The TypeScript reader could not be loaded (${error instanceof Error ? error.message : String(error)}). Reload the page and try again.`] };
  }
  try {
    const transforms: ('typescript' | 'imports')[] = uploadLanguage(fileName) === 'ts' ? ['typescript', 'imports'] : ['imports'];
    return { ok: true, code: transform(source, { transforms, filePath: fileName }).code };
  } catch (error) {
    return { ok: false, problems: [syntaxMessage(error)] };
  }
}
