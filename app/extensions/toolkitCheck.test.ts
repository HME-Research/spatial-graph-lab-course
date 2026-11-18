import { describe, expect, it } from 'vitest';
import { validateDocument } from '@app/document';
import { migrateV1toV2, type DesignDocumentV2 } from '@app/document/v2';
import exampleDesign from '../document/examples/two-storey-example.json';
import { activateToolkit, type ActiveToolkit } from './activate';
import { checkConformance } from './conformance';
import { discoverToolkits } from './discover';
import { TOOLKIT_GLOBS } from './toolkitGlobs';
import { runAlgorithmV2 } from './run';

/**
 * Toolkit check: every toolkit under toolkits/ is loaded exactly as the app loads it. Run it
 * for all toolkits with `npm run check:toolkit`, or for one with
 * `npm run check:toolkit -- -t my-toolkit`. It fails on anything the app would show as an error:
 * invalid toolkit/type/algorithm definitions, invalid designs, and algorithms that fail when run
 * with their default parameters on the toolkit's default design (or the built-in example).
 * Design warnings (e.g. an invalid attribute value) are printed but do not fail the check,
 * because the app never refuses to load a design for them.
 */

const { toolkits, diagnostics: folderProblems } = discoverToolkits(TOOLKIT_GLOBS);

const lines = (items: readonly { readonly message: string }[]) => items.map((d) => d.message);

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

  it('every enabled algorithm runs on the default design with default parameters', async () => {
    const toolkit = await active();
    const chosen = toolkit.designs.find((d) => d.id === toolkit.definition.defaultDesign);
    const builtIn = validateDocument(exampleDesign);
    // The app runs algorithms on the stored schema-v2 document (v1 files are migrated on load).
    const doc: DesignDocumentV2 | undefined = chosen?.result.ok ? chosen.result.value : builtIn.ok ? migrateV1toV2(builtIn.value) : undefined;
    expect(doc).toBeDefined();
    for (const algorithm of toolkit.algorithms.filter((a) => a.status.ok)) {
      const outcome = runAlgorithmV2(doc!, toolkit, algorithm.id);
      expect(outcome.ok ? [] : lines(outcome.issues), `${algorithm.file}`).toEqual([]);
    }
  });
});
