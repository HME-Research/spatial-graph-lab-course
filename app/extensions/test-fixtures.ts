/** Shared helpers for app/extensions tests (imported by *.test.ts only). */
import { expect } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { defineFunction, defineToolkit } from '@student-api';
import { activate, type ActiveToolkit } from './activate';
import type { ExtensionDiagnostic, ExtensionIssueCode, ExtensionResult } from './diagnostics';
import type { ModuleLoader, ToolkitGlobs, TextLoader } from './discover';

/** Marks a module that fails to load (e.g. a syntax error in the student's file). */
export const LOAD_FAILS = Symbol('load fails');

/**
 * In-memory stand-in for `import.meta.glob`: keys are repository paths, values are module
 * objects (`{ default: … }`), JSON text for designs, or LOAD_FAILS.
 */
export function fakeGlobs(files: Readonly<Record<string, unknown>>): ToolkitGlobs {
  const toolkit: Record<string, ModuleLoader> = {};
  const functions: Record<string, ModuleLoader> = {};
  const algorithms: Record<string, ModuleLoader> = {};
  const designs: Record<string, TextLoader> = {};
  for (const [path, value] of Object.entries(files)) {
    const load = async (): Promise<never> => {
      if (value === LOAD_FAILS) throw new SyntaxError(`Unexpected token in ${path}`);
      return value as never;
    };
    const key = `/${path}`;
    if (path.endsWith('.json')) designs[key] = load;
    else if (path.endsWith('/toolkit.ts')) toolkit[key] = load;
    else if (path.includes('/functions/')) functions[key] = load;
    else if (path.includes('/algorithms/')) algorithms[key] = load;
  }
  return { toolkit, functions, algorithms, designs };
}

export const galleryType = defineFunction({
  id: 'gallery',
  label: 'Gallery',
  facade: { windowFraction: 0.6 },
  custom: {
    daylight: { kind: 'enum', values: ['high', 'medium', 'low'] },
    public: { kind: 'boolean', default: true },
  },
});

export const studioType = defineFunction({
  id: 'studio',
  label: 'Studio',
  custom: { occupancy: { kind: 'number', min: 0 }, public: { kind: 'boolean', default: false } },
});

/** Base files of the "lab" test toolkit; tests add or override entries. */
export const LAB_FILES: Readonly<Record<string, unknown>> = {
  'toolkits/lab/toolkit.ts': { default: defineToolkit({ name: 'Lab' }) },
  'toolkits/lab/functions/gallery.ts': { default: galleryType },
  'toolkits/lab/functions/studio.ts': { default: studioType },
};

export async function labToolkit(extra: Readonly<Record<string, unknown>> = {}): Promise<ActiveToolkit> {
  const { activation } = await activate(fakeGlobs({ ...LAB_FILES, ...extra }), { query: 'lab' });
  if (activation.status !== 'active') throw new Error(`expected an active toolkit, got ${JSON.stringify(activation)}`);
  return activation.toolkit;
}

/**
 * g1, g2 (galleries) and s1 (studio) on storey 0, plus k1 of a type the lab toolkit does not define.
 * g2 has an invalid daylight value and an undeclared legacy attribute; e1 has an edge attribute.
 */
export function labDoc(): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'Lab' },
      nodes: [
        { id: 1, position: [0, 0, 0], function: 'gallery', custom: { daylight: 'high', public: true } },
        { id: 2, position: [1, 0, 0], function: 'gallery', custom: { daylight: 'bright', legacy: 'kept' } },
        { id: 3, position: [0, 1, 0], function: 'studio', custom: { occupancy: 4 } },
        { id: 4, position: [5, 5, 0], function: 'kiosk', custom: {} },
      ],
      edges: [
        { id: 1, source: 1, target: 2, relationship: 'access', custom: { width: 0.9 } },
        { id: 2, source: 1, target: 3, relationship: 'open', custom: {} },
      ],
      diagram: { positions: { 1: [0, 0] } },
    }),
  );
}

export function expectExtOk<T>(result: ExtensionResult<T>): T {
  if (!result.ok) throw new Error(`expected ok, got: ${JSON.stringify(result.issues, null, 2)}`);
  return result.value;
}

/** Asserts failure with a diagnostic of `code` and returns it. */
export function expectDiagnostic<T>(result: ExtensionResult<T>, code: ExtensionIssueCode): ExtensionDiagnostic {
  expect(result.ok, 'expected failure').toBe(false);
  if (result.ok) throw new Error('unreachable');
  const found = result.issues.find((d) => d.code === code);
  expect(found, `expected ${code}; got ${JSON.stringify(result.issues.map((d) => `${d.code}: ${d.message}`))}`).toBeDefined();
  return found!;
}
