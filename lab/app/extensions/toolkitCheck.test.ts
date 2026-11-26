import { describe, expect, it } from 'vitest';
import { type DesignDocumentV2, validateDocumentV2 } from '@app/document';
import exampleDesign from '../document/test-designs/two-storey.json';
import { activateToolkit, type ActiveToolkit } from './activate';
import { checkConformance } from './conformance';
import { discoverToolkits, TOOLKIT_ID_PATTERN } from './discover';
import { TOOLKIT_GLOBS } from './toolkitGlobs';
import { runAlgorithmV2 } from './run';
import { designAssetIds, loadToolkitAssets, type ToolkitAssetIo } from './toolkitExamples';
import { importFacade3dm } from '../assets/importFacade';
import { loadRhino3dm, RHINO3DM_VERSION } from '../assets/rhino/loader';

// Node only (vitest runs in Node): read toolkit asset files without a @types/node dependency.
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): { readFileSync(url: URL): Uint8Array } } }).process.getBuiltinModule('node:fs');

/** Asset files are read from the repository and imported exactly as the app imports them (Outside −Y). */
const nodeAssetIo: ToolkitAssetIo = {
  fetchBytes: async (file) => new Uint8Array(fs.readFileSync(new URL(`../../../${file}`, import.meta.url))),
  importFile: async (bytes, fileName) => importFacade3dm(bytes, { fileName, outward: '-y', rhino: await loadRhino3dm(), reader: `rhino3dm@${RHINO3DM_VERSION}` }),
};

/**
 * Toolkit check: every toolkit under toolkits/ is loaded exactly as the app loads it. Run it
 * for all toolkits with `npm run check:toolkit`, or for one with
 * `npm run check:toolkit -- -t my-toolkit` (lab/scripts/check-toolkit.mjs passes the id as
 * SGL_CHECK_TOOLKIT, never as vitest's name filter: owner 2026-11-26). A requested toolkit that is
 * not found fails with what to do (missing, toolkit.ts one folder too deep, a misnamed folder), and
 * the folder well-formedness test always runs. It fails on anything the app would show as an error:
 * invalid toolkit/type/algorithm definitions, invalid designs, façade assets a design uses that no
 * file in `assets/` provides (imported as the app imports them), and algorithms that fail when run
 * with their default parameters on the toolkit's default design (or the built-in example).
 * Design warnings (e.g. an invalid attribute value) are printed but do not fail the check,
 * because the app never refuses to load a design for them.
 */

const { toolkits, diagnostics: folderProblems } = discoverToolkits(TOOLKIT_GLOBS);

const lines = (items: readonly { readonly message: string }[]) => items.map((d) => d.message);

/** Inputs for an analysis run by the check; undefined for a transformation (it has no inputs). */
function sampleInputs(definition: ActiveToolkit['algorithms'][number]['definition'], doc: DesignDocumentV2): number[] | undefined {
  if (!('inputs' in definition) || !Array.isArray(definition.inputs)) return undefined;
  return definition.inputs.map((input) =>
    input.kind === 'node' ? (doc.nodes[0]?.id ?? 0) : input.kind === 'edge' ? (doc.edges[0]?.id ?? 0) : (input.default ?? input.min ?? 1),
  );
}

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
/** The toolkit `npm run check:toolkit -- -t <id>` asks for (lab/scripts/check-toolkit.mjs), or null for all. */
const requested = env['SGL_CHECK_TOOLKIT']?.trim() || null;

/** Every file under toolkits/ (paths only: nothing is loaded), to explain a toolkit that was not found. */
const TOOLKIT_FILES = Object.keys(import.meta.glob('/toolkits/*/**/*'));

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Why the requested toolkit `id` is not among the `found` ones, in words a student can act on, or
 * null when it was found. `files` are repository paths such as `/toolkits/house/toolkit.ts`.
 */
function requestedToolkitProblem(id: string, found: readonly string[], files: readonly string[]): string | null {
  if (found.includes(id)) return null;
  if (!TOOLKIT_ID_PATTERN.test(id)) {
    return `"${id}" is not a valid toolkit name: use lowercase letters, digits and "-", starting with a letter (e.g. u123-hk-house).`;
  }
  const paths = files.map((f) => f.replace(/^\//, ''));
  const own = paths.filter((f) => f.startsWith(`toolkits/${id}/`));
  const deeper = own.filter((f) => f.endsWith('/toolkit.ts')).sort((a, b) => a.length - b.length)[0];
  if (deeper !== undefined) {
    const inner = deeper.slice(0, -'toolkit.ts'.length);
    return inner.split('/').length === 4
      ? `toolkit.ts is one folder too deep: move the contents of ${inner} up one level, into toolkits/${id}/, and delete the empty ${inner} folder.`
      : `toolkit.ts is in ${inner}, not directly in toolkits/${id}/: move the contents of ${inner} up into toolkits/${id}/.`;
  }
  if (own.length > 0) return `toolkits/${id}/ has no toolkit.ts directly inside it. The folder must be toolkits/${id}/ with toolkit.ts directly inside it.`;
  const folders = [...new Set(paths.map((f) => f.split('/')[1]!))];
  const similar = folders.find((folder) => folder !== id && slug(folder) === id);
  if (similar !== undefined) {
    return `No toolkit "${id}" was found, but there is a folder toolkits/${similar}/: rename it to exactly ${id} (lowercase letters, digits and "-").`;
  }
  return `No toolkit "${id}" was found. The folder must be toolkits/${id}/ with toolkit.ts directly inside it.${found.length > 0 ? ` Toolkits found: ${found.join(', ')}.` : ''}`;
}

describe('toolkits/ folders', () => {
  it('every toolkit folder is well-formed', () => {
    expect(lines(folderProblems)).toEqual([]);
  });

  if (requested !== null) {
    it(`the requested toolkit "${requested}" exists`, () => {
      const problem = requestedToolkitProblem(requested, toolkits.map((p) => p.id), TOOLKIT_FILES);
      if (problem !== null) throw new Error(problem);
    });
  }
});

describe('check:toolkit -t <id>: a toolkit that is not found is explained', () => {
  const house = ['/toolkits/house/toolkit.ts', '/toolkits/house/functions/bath.ts'];
  it('found: no problem', () => {
    expect(requestedToolkitProblem('house', ['house'], house)).toBeNull();
  });
  it('missing', () => {
    expect(requestedToolkitProblem('hk-library', ['house'], house)).toBe(
      'No toolkit "hk-library" was found. The folder must be toolkits/hk-library/ with toolkit.ts directly inside it. Toolkits found: house.',
    );
  });
  it('toolkit.ts one folder too deep (a common unzip mistake)', () => {
    const files = [...house, '/toolkits/hk-library/hk-library/toolkit.ts', '/toolkits/hk-library/hk-library/functions/room.ts'];
    expect(requestedToolkitProblem('hk-library', ['house'], files)).toBe(
      'toolkit.ts is one folder too deep: move the contents of toolkits/hk-library/hk-library/ up one level, into toolkits/hk-library/, and delete the empty toolkits/hk-library/hk-library/ folder.',
    );
  });
  it('toolkit.ts two folders too deep', () => {
    const files = [...house, '/toolkits/hk-library/download/hk-library/toolkit.ts'];
    expect(requestedToolkitProblem('hk-library', ['house'], files)).toMatch(/^toolkit\.ts is in toolkits\/hk-library\/download\/hk-library\/, not directly in toolkits\/hk-library\//);
  });
  it('a folder without toolkit.ts', () => {
    expect(requestedToolkitProblem('hk-library', ['house'], [...house, '/toolkits/hk-library/README.md'])).toMatch(/^toolkits\/hk-library\/ has no toolkit\.ts directly inside it/);
  });
  it('a misnamed folder', () => {
    expect(requestedToolkitProblem('hk-library', ['house'], [...house, '/toolkits/HK-Library/toolkit.ts'])).toBe(
      'No toolkit "hk-library" was found, but there is a folder toolkits/HK-Library/: rename it to exactly hk-library (lowercase letters, digits and "-").',
    );
    expect(requestedToolkitProblem('hk-library', ['house'], [...house, '/toolkits/hk library/toolkit.ts'])).toMatch(/there is a folder toolkits\/hk library\//);
  });
  it('an invalid id', () => {
    expect(requestedToolkitProblem('HK-Library', ['house'], house)).toMatch(/^"HK-Library" is not a valid toolkit name/);
  });
});

/** lab/scripts/check-toolkit.mjs, imported (it runs only when started as a script). */
interface CheckScript {
  requestedId(args: readonly string[]): string | null;
  resultLine(id: string | null, status: number): string;
  upperDrive(path: string): string;
}
const loadScript = async (): Promise<CheckScript> =>
  (await import(/* @vite-ignore */ new URL('../../scripts/check-toolkit.mjs', import.meta.url).href)) as CheckScript;

describe('check:toolkit script (lab/scripts/check-toolkit.mjs, owner 2026-11-26)', () => {
  it('ends with one clear PASSED or FAILED line (vitest also prints "N passed" when a test failed)', async () => {
    const { resultLine } = await loadScript();
    expect(resultLine('hk-small-library', 0)).toBe('PASSED: toolkit "hk-small-library" is ready.');
    expect(resultLine('hk-small-library', 1)).toBe('FAILED: toolkit "hk-small-library" has a problem (read the red message above).');
    expect(resultLine(null, 0)).toBe('PASSED: every toolkit in toolkits/ is ready.');
    expect(resultLine(null, 1)).toMatch(/^FAILED: /);
  });
  it('hands vitest the folder with an uppercase drive letter (a lowercase c:\\ crashes vitest)', async () => {
    const { upperDrive } = await loadScript();
    expect(upperDrive('c:\\Users\\you\\source\\repos\\spatial-graph-lab-course')).toBe('C:\\Users\\you\\source\\repos\\spatial-graph-lab-course');
    expect(upperDrive('c:/Users/you')).toBe('C:/Users/you');
    expect(upperDrive('C:\\Users\\you')).toBe('C:\\Users\\you');
    expect(upperDrive('/Users/you/source/repos')).toBe('/Users/you/source/repos');
  });
  it('reads the toolkit id however the shell passes it', async () => {
    const { requestedId } = await loadScript();
    expect(requestedId([])).toBeNull();
    expect(requestedId(['-t', 'hk-small-library'])).toBe('hk-small-library');
    expect(requestedId(['--toolkit=hk-small-library'])).toBe('hk-small-library');
    expect(requestedId(['hk-small-library'])).toBe('hk-small-library'); // PowerShell 5.1 drops the `--`
    expect(() => requestedId(['-t'])).toThrow(/needs your toolkit name/);
    expect(() => requestedId(['a', 'b'])).toThrow(/give one toolkit name/);
  });
});

const checked = requested === null ? toolkits : toolkits.filter((p) => p.id === requested);

describe.each(checked.map((p) => [p.id, p] as const))('toolkit "%s"', (_id, source) => {
  const activation = activateToolkit(source);
  const active = async (): Promise<ActiveToolkit> => {
    const result = await activation;
    if (result.status === 'failed') throw new Error(`not activated:\n${lines(result.diagnostics).join('\n')}`);
    if (result.status !== 'active') throw new Error('not activated');
    return result.toolkit;
  };

  it('activates, and every definition and design is valid', async () => {
    const toolkit = await active();
    expect(lines(toolkit.diagnostics.filter((d) => d.severity === 'error'))).toEqual([]);
  });

  it('its designs conform to its node types (warnings are reported, not failed)', async () => {
    const toolkit = await active();
    for (const design of toolkit.designs) {
      if (!design.result.ok) continue; // reported by the previous check
      const problems = checkConformance(design.result.value, toolkit).filter((d) => d.severity !== 'info');
      if (problems.length > 0) console.warn(`${design.file}:\n  ${lines(problems).join('\n  ')}`);
      expect(problems.filter((d) => d.severity === 'error').map((d) => d.message)).toEqual([]);
    }
  });

  it('every façade asset its designs use is provided by a file in its assets/ folder', async () => {
    const toolkit = await active();
    for (const design of toolkit.designs) {
      if (!design.result.ok) continue; // reported by the first check
      const needed = designAssetIds(design.result.value);
      if (needed.length === 0) continue;
      // The file path stands in for its URL: `nodeAssetIo` reads it from the repository.
      const files = source.assets.map((f) => ({ ...f, load: async () => f.file }));
      const result = await loadToolkitAssets(source.id, files, needed, nodeAssetIo);
      expect(result.ok ? [] : [`${design.file}: ${result.message}`]).toEqual([]);
    }
  }, 60_000);

  it('every enabled algorithm runs on the default design with default parameters', async () => {
    const toolkit = await active();
    const chosen = toolkit.designs.find((d) => d.id === toolkit.definition.defaultDesign);
    const builtIn = validateDocumentV2(exampleDesign);
    // The app runs algorithms on the stored schema-v2 document (v1 files are migrated on load).
    const doc: DesignDocumentV2 | undefined = chosen?.result.ok ? chosen.result.value : builtIn.ok ? builtIn.value : undefined;
    expect(doc).toBeDefined();
    for (const algorithm of toolkit.algorithms.filter((a) => a.status.ok)) {
      // Analyses get sample inputs (2026-11-24): the design's first node / first edge, a number's
      // default (else its min, else 1), so a Node, Edge or Queries analysis is checked too.
      const inputs = sampleInputs(algorithm.definition, doc!);
      const outcome = runAlgorithmV2(doc!, toolkit, algorithm.id, undefined, inputs === undefined ? {} : { inputs });
      expect(outcome.ok ? [] : lines(outcome.issues), `${algorithm.file}`).toEqual([]);
    }
  });
});
