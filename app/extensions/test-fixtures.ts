/** Shared helpers for app/extensions tests (imported by *.test.ts only). */
import { expect } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { validateDocument, type DesignDocument } from '@app/document';
import { defineNodeType, defineToolkit } from '@student-api';
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
  const types: Record<string, ModuleLoader> = {};
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
    else if (path.includes('/types/')) types[key] = load;
    else if (path.includes('/algorithms/')) algorithms[key] = load;
  }
  return { toolkit, types, algorithms, designs };
}

export const galleryType = defineNodeType({
  id: 'gallery',
  label: 'Gallery',
  facade: { windowFraction: 0.6 },
  attributes: {
    daylight: { kind: 'enum', values: ['high', 'medium', 'low'] },
    public: { kind: 'boolean', default: true },
  },
});

export const studioType = defineNodeType({
  id: 'studio',
  label: 'Studio',
  attributes: { occupancy: { kind: 'number', min: 0 }, public: { kind: 'boolean', default: false } },
});

/** Base files of the "lab" test toolkit; tests add or override entries. */
export const LAB_FILES: Readonly<Record<string, unknown>> = {
  'toolkits/lab/toolkit.ts': { default: defineToolkit({ name: 'Lab' }) },
  'toolkits/lab/types/gallery.ts': { default: galleryType },
  'toolkits/lab/types/studio.ts': { default: studioType },
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
export function labDoc(): DesignDocument {
  return expectOk(
    validateDocument({
      schemaVersion: 1,
      metadata: { name: 'Lab' },
      nodes: [
        { id: 'g1', grid: [0, 0, 0], typeId: 'gallery', attributes: { daylight: 'high', public: true } },
        { id: 'g2', grid: [1, 0, 0], typeId: 'gallery', attributes: { daylight: 'bright', legacy: 'kept' } },
        { id: 's1', grid: [0, 1, 0], typeId: 'studio', attributes: { occupancy: 4 } },
        { id: 'k1', grid: [5, 5, 0], typeId: 'kiosk', attributes: {} },
      ],
      edges: [
        { id: 'e1', source: 'g1', target: 'g2', kind: 'door', attributes: { width: 0.9 } },
        { id: 'e2', source: 'g1', target: 's1', kind: 'open', attributes: {} },
      ],
      diagram: { positions: { g1: [0, 0] } },
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
