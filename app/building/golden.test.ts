import {
  type ConnectorStyle,
  type DesignDocumentV2,
  functionStyleSettings,
  type Look,
  readDesign,
  type RelationshipKind,
  validateDocumentV2,
} from '@app/document';
import { describe, expect, it } from 'vitest';
import exampleJson from '../document/test-designs/two-storey.json';
import { expectOk } from '@app/document/test-fixtures';
import type { GridCoord } from '@core/spatial';
import { buildBuildingV2 } from './buildingV2';
import { buildArchitecture } from './geometry';
import { resolveRelationships } from '@app/spatial';
import { resolveBuildingFaces, toResolvedFace } from './multicellFaces';

/**
 * Golden geometry (Gate F, F-C). The JSON files under `__golden__/` were generated from the
 * building pipeline at `88f408e`, BEFORE `buildArchitecture` was refactored onto `layoutFaces`.
 * The comparison is on the exact JSON text (shortest round-trip number formatting), so any change
 * of an element, its order, id or a single floating-point bit fails. Never regenerate these files
 * to make a refactor pass; a deliberate geometry change must say so in its report.
 *
 * Each fixture is read with `fs.readFileSync` and compared as an exact string (`toBe`); Vitest's
 * snapshot machinery (`-u`, CI mode) is NOT used, and a missing fixture FAILS the test. The only
 * way to (re)write the files is the explicit opt-in
 *   SGL_UPDATE_GOLDEN=1 npx vitest --run app/building/golden.test.ts
 * which overwrites them; review the `__golden__/` diff before keeping it.
 */

type N = { id: string; grid: GridCoord; size?: [number, number, number]; typeId?: string };
type E = { id: string; source: string; target: string; kind?: RelationshipKind; connectorStyle?: ConnectorStyle };

function v2(nodes: N[], edges: E[] = [], typeAppearance: Record<string, unknown> = {}): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'golden' },
      nodes: nodes.map((n) => ({ id: n.id, grid: n.grid, size: n.size ?? [1, 1, 1], typeId: n.typeId ?? 'gallery' })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        kind: e.kind ?? 'access',
        ...(e.connectorStyle ? { connectorStyle: e.connectorStyle } : {}),
      })),
      settings: functionStyleSettings(typeAppearance as Record<string, Look>),
    }),
  );
}

const example = expectOk(readDesign(exampleJson)).doc;
const exampleTypes = [...new Set(example.nodes.map((n) => n.typeId))].sort();

const FIXTURES: Readonly<Record<string, DesignDocumentV2>> = {
  'two-storey-example': example,
  'two-storey-example-roofs-off': {
    ...example,
    settings: functionStyleSettings(Object.fromEntries(exampleTypes.map((t) => [t, { roof: 'none' as const }]))),
  },
  'two-storey-example-appearance': {
    ...example,
    settings: functionStyleSettings({ gallery: { windowFraction: 1 }, studio: { windowFraction: 0, roof: 'none' as const } }),
  },
  'multi-cell-rooms': v2(
    [
      { id: 'm', grid: [0, 0, 0], size: [2, 3, 1] },
      { id: 'n', grid: [2, 0, 0], size: [1, 1, 2], typeId: 'studio' },
      { id: 'o', grid: [0, 0, 1], size: [2, 2, 1], typeId: 'storage' },
      { id: 'p', grid: [0, 2, 1], typeId: 'studio' },
      { id: 'q', grid: [3, 0, 0], size: [1, 1, 2] },
      { id: 'r', grid: [1, 2, 1], size: [1, 1, 2], typeId: 'lab' },
    ],
    [
      { id: 'mn', source: 'm', target: 'n', kind: 'access' },
      { id: 'mo', source: 'm', target: 'o', kind: 'open' },
      { id: 'mp', source: 'p', target: 'm', kind: 'access' },
      { id: 'nq', source: 'n', target: 'q', kind: 'open' },
      { id: 'pr', source: 'p', target: 'r', kind: 'access' },
    ],
  ),
  'vertical-access-and-open': v2(
    [
      { id: 'g0', grid: [0, 0, 0], size: [2, 2, 1] },
      { id: 'g1', grid: [0, 0, 1], size: [2, 1, 1], typeId: 'studio' },
      { id: 'g2', grid: [0, 1, 1], size: [2, 1, 1], typeId: 'storage' },
      { id: 'g3', grid: [0, 0, 2], size: [2, 2, 1] },
    ],
    [
      { id: 'v-access', source: 'g0', target: 'g1', kind: 'access' },
      { id: 'v-open', source: 'g2', target: 'g0', kind: 'open' },
      { id: 'v-up', source: 'g1', target: 'g3', kind: 'open' },
      { id: 'h-access', source: 'g1', target: 'g2', kind: 'access' },
    ],
  ),
  'routed-connectors': v2(
    [
      { id: 'a', grid: [0, 0, 0] },
      { id: 'b', grid: [4, 0, 0], typeId: 'studio' },
      { id: 'c', grid: [0, 2, 0], size: [1, 1, 2] },
      { id: 'd', grid: [4, 2, 0], typeId: 'storage' },
      { id: 'e', grid: [0, 4, 0], size: [2, 1, 1] },
      { id: 'f', grid: [5, 4, 0] },
      { id: 'g', grid: [0, 6, 0] },
      { id: 'h', grid: [4, 6, 0] },
      { id: 'i', grid: [0, 7, 0], typeId: 'studio' },
      { id: 'j', grid: [4, 7, 0], typeId: 'studio' },
      { id: 'k', grid: [2, 6, 1], typeId: 'storage' },
      { id: 'l', grid: [10, 10, 3] },
      { id: 's', grid: [2, 9, 0] },
      { id: 't', grid: [2, 12, 0], size: [1, 2, 1] },
    ],
    [
      { id: 'ab', source: 'a', target: 'b', kind: 'access' },
      { id: 'cd', source: 'c', target: 'd', kind: 'open', connectorStyle: 'covered' },
      { id: 'ef', source: 'f', target: 'e', kind: 'access', connectorStyle: 'deck' },
      { id: 'gh', source: 'g', target: 'h', kind: 'access', connectorStyle: 'enclosed' },
      { id: 'ij', source: 'i', target: 'j', kind: 'open', connectorStyle: 'covered' },
      { id: 'al', source: 'a', target: 'l', kind: 'access' },
      { id: 'st', source: 's', target: 't', kind: 'access' },
    ],
  ),
};

const snapshot = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

// The project has no Node type definitions (tsconfig `types: ["vite/client"]`, no @types/node
// dependency), so the Node built-ins this Vitest-only file needs are typed locally.
interface NodeFs {
  existsSync(path: URL): boolean;
  readFileSync(path: URL, encoding: 'utf8'): string;
  writeFileSync(path: URL, data: string): void;
}
const NODE_FS = 'node:fs';
const fs = (await import(/* @vite-ignore */ NODE_FS)) as NodeFs;
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const UPDATE = env['SGL_UPDATE_GOLDEN'] === '1';

/**
 * Exact comparison with `__golden__/<file>`; writes the file only under SGL_UPDATE_GOLDEN=1.
 * CRLF in the fixture is read as LF (a Windows `core.autocrlf` checkout artefact, not geometry).
 */
function expectGolden(actual: string, file: string): void {
  const path = new URL(`./__golden__/${file}`, import.meta.url);
  if (UPDATE) {
    fs.writeFileSync(path, actual);
    return;
  }
  if (!fs.existsSync(path)) throw new Error(`golden fixture __golden__/${file} is missing (only SGL_UPDATE_GOLDEN=1 may create it)`);
  expect(actual, `golden fixture __golden__/${file}`).toBe(fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
}

describe('golden building geometry (pre-refactor output, byte-identical)', () => {
  for (const [name, doc] of Object.entries(FIXTURES)) {
    it(`buildBuildingV2: ${name}`, () => {
      const model = buildBuildingV2(doc);
      expectGolden(
        snapshot({ faces: model.faces, elements: model.elements, connectors: model.connectors, relationships: model.relationships }),
        `building-${name}.json`,
      );
    });
  }

  // The room faces of the two-storey design (one-cell rooms), laid out with the plain geometry step.
  const faces = resolveBuildingFaces(example, resolveRelationships(example)).map(toResolvedFace);
  const OPTION_SETS = {
    default: {},
    'custom-cell-thickness': { cell: { horizontal: 4, vertical: 3.5 }, wallThickness: 0.3, slabThickness: 0.25 },
    'facade-closed-open-nan': {
      facade: (typeId: string) => ({ windowFraction: typeId === 'gallery' ? 1 : typeId === 'studio' ? 0 : Number.NaN }),
    },
  } as const;
  for (const [name, options] of Object.entries(OPTION_SETS)) {
    it(`buildArchitecture (example faces): ${name}`, () => {
      expectGolden(snapshot(buildArchitecture(faces, options)), `architecture-${name}.json`);
    });
  }
});
