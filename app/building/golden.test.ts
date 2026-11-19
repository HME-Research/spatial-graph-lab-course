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

type N = { id: number; grid: GridCoord; size?: [number, number, number]; typeId?: string };
type E = { id: number; source: number; target: number; kind?: RelationshipKind; connectorStyle?: ConnectorStyle };

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

/**
 * Ids are numbered in the alphabetical order of the letters they replaced (m..r = 1..6, g0..g3 = 1..4,
 * a..l, s, t = 1..14; edges likewise: h-access, v-access, v-open, v-up = 1..4; ab, al, cd, ef, gh, ij,
 * st = 1..7), so ownership and routing order are unchanged by the move to numeric ids.
 */
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
      { id: 1, grid: [0, 0, 0], size: [2, 3, 1] }, // m
      { id: 2, grid: [2, 0, 0], size: [1, 1, 2], typeId: 'studio' }, // n
      { id: 3, grid: [0, 0, 1], size: [2, 2, 1], typeId: 'storage' }, // o
      { id: 4, grid: [0, 2, 1], typeId: 'studio' }, // p
      { id: 5, grid: [3, 0, 0], size: [1, 1, 2] }, // q
      { id: 6, grid: [1, 2, 1], size: [1, 1, 2], typeId: 'lab' }, // r
    ],
    [
      { id: 1, source: 1, target: 2, kind: 'access' }, // mn
      { id: 2, source: 1, target: 3, kind: 'open' }, // mo
      { id: 3, source: 4, target: 1, kind: 'access' }, // mp
      { id: 4, source: 2, target: 5, kind: 'open' }, // nq
      { id: 5, source: 4, target: 6, kind: 'access' }, // pr
    ],
  ),
  'vertical-access-and-open': v2(
    [
      { id: 1, grid: [0, 0, 0], size: [2, 2, 1] }, // g0
      { id: 2, grid: [0, 0, 1], size: [2, 1, 1], typeId: 'studio' }, // g1
      { id: 3, grid: [0, 1, 1], size: [2, 1, 1], typeId: 'storage' }, // g2
      { id: 4, grid: [0, 0, 2], size: [2, 2, 1] }, // g3
    ],
    [
      { id: 2, source: 1, target: 2, kind: 'access' }, // v-access
      { id: 3, source: 3, target: 1, kind: 'open' }, // v-open
      { id: 4, source: 2, target: 4, kind: 'open' }, // v-up
      { id: 1, source: 2, target: 3, kind: 'access' }, // h-access
    ],
  ),
  'routed-connectors': v2(
    [
      { id: 1, grid: [0, 0, 0] }, // a
      { id: 2, grid: [4, 0, 0], typeId: 'studio' }, // b
      { id: 3, grid: [0, 2, 0], size: [1, 1, 2] }, // c
      { id: 4, grid: [4, 2, 0], typeId: 'storage' }, // d
      { id: 5, grid: [0, 4, 0], size: [2, 1, 1] }, // e
      { id: 6, grid: [5, 4, 0] }, // f
      { id: 7, grid: [0, 6, 0] }, // g
      { id: 8, grid: [4, 6, 0] }, // h
      { id: 9, grid: [0, 7, 0], typeId: 'studio' }, // i
      { id: 10, grid: [4, 7, 0], typeId: 'studio' }, // j
      { id: 11, grid: [2, 6, 1], typeId: 'storage' }, // k
      { id: 12, grid: [10, 10, 3] }, // l
      { id: 13, grid: [2, 9, 0] }, // s
      { id: 14, grid: [2, 12, 0], size: [1, 2, 1] }, // t
    ],
    [
      { id: 1, source: 1, target: 2, kind: 'access' }, // ab
      { id: 3, source: 3, target: 4, kind: 'open', connectorStyle: 'covered' }, // cd
      { id: 4, source: 6, target: 5, kind: 'access', connectorStyle: 'deck' }, // ef
      { id: 5, source: 7, target: 8, kind: 'access', connectorStyle: 'enclosed' }, // gh
      { id: 6, source: 9, target: 10, kind: 'open', connectorStyle: 'covered' }, // ij
      { id: 2, source: 1, target: 12, kind: 'access' }, // al
      { id: 7, source: 13, target: 14, kind: 'access' }, // st
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
