import { describe, expect, it } from 'vitest';
import { type DesignDocumentV2, validateDocumentV2 } from '@app/document';
import exampleDesign from '../document/test-designs/two-storey.json';
import { activateToolkit, type ActiveToolkit } from './activate';
import { checkConformance } from './conformance';
import { discoverToolkits } from './discover';
import { TOOLKIT_GLOBS } from './toolkitGlobs';
import { runAlgorithmV2 } from './run';
import { designAssetIds, loadToolkitAssets, type ToolkitAssetIo } from './toolkitExamples';
import { importFacade3dm } from '../assets/importFacade';
import { loadRhino3dm, RHINO3DM_VERSION } from '../assets/rhino/loader';

// Node only (vitest runs in Node): read toolkit asset files without a @types/node dependency.
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): { readFileSync(url: URL): Uint8Array } } }).process.getBuiltinModule('node:fs');

/** Asset files are read from the repository and imported exactly as the app imports them (Outside −Y). */
const nodeAssetIo: ToolkitAssetIo = {
  fetchBytes: async (file) => new Uint8Array(fs.readFileSync(new URL(`../../${file}`, import.meta.url))),
  importFile: async (bytes, fileName) => importFacade3dm(bytes, { fileName, outward: '-y', rhino: await loadRhino3dm(), reader: `rhino3dm@${RHINO3DM_VERSION}` }),
};

/**
 * Toolkit check: every toolkit under toolkits/ is loaded exactly as the app loads it. Run it
 * for all toolkits with `npm run check:toolkit`, or for one with
 * `npm run check:toolkit -- -t my-toolkit`. It fails on anything the app would show as an error:
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

describe('toolkits/ folders', () => {
  it('every toolkit folder is well-formed', () => {
    expect(lines(folderProblems)).toEqual([]);
  });
});

describe.each(toolkits.map((p) => [p.id, p] as const))('toolkit "%s"', (_id, source) => {
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
