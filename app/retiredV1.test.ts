import { describe, expect, it } from 'vitest';
import { readDesign, readDesignJson, validateDocumentV2 } from '@app/document/v2';
import { readProjectFile } from '@app/project';
import exampleJson from './document/examples/house.json';

/**
 * P4 (owner decision 2026-11-19): schema v1 is retired completely and is never read again. This test
 * fails if a v1 module or identifier comes back anywhere in the application, or if a schema-v1
 * document (or a pre-version-2 project file) is accepted. `student-api/retiredV1.test.ts` checks the
 * Student API.
 */

const sources: Record<string, string> = import.meta.glob<string>('./**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
const SELF = './retiredV1.test.ts';

/** Modules of the retired v1 document and its bridges. */
const RETIRED_FILES = [
  /^\.\/document\/(schema|validate|commands|apply|serialize|adjacency)\.ts$/,
  /^\.\/document\/v2\/migrate\.ts$/,
  /^\.\/document\/examples\/two-storey-example\.json$/,
  /^\.\/session\/legacyBridge\.ts$/,
  /^\.\/extensions\/transform\.ts$/,
];

/** Identifiers that only existed for schema v1. */
const RETIRED_IDENTIFIERS = [
  'migrateV1toV2',
  'V1_KIND_TO_RELATIONSHIP',
  'relationshipKindForV1',
  'v1KindFor',
  'legacyProjection',
  'designCommandFromLegacy',
  'SpatialEdgeKind',
  'canConnect',
  'applyGraphCommand',
  'GraphCommand',
  'parseDesignJson',
  'EDGE_KINDS',
  'EdgeKind',
  'isEdgeGeometryValid',
  'modelFromV1',
  'changeV1EdgeKindCommand',
  'defaultV1ConnectionKind',
  'runAlgorithm',
  'migrateProjectFileV1',
];

describe('schema v1 is retired (P4)', () => {
  it('scans the sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
  });

  it('no v1 module exists', () => {
    const all = [
      ...Object.keys(sources),
      ...Object.keys(import.meta.glob('./**/*.json')),
    ];
    expect(all.filter((f) => RETIRED_FILES.some((r) => r.test(f)))).toEqual([]);
  });

  it('no v1 identifier is used', () => {
    const found: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      if (file === SELF) continue;
      for (const id of RETIRED_IDENTIFIERS) if (new RegExp(`\\b${id}\\b`).test(text)) found.push(`${file}: ${id}`);
      // A test may build a v1 document only to show that it is refused (marked "// v1 refused").
      for (const line of text.split('\n')) if (/schemaVersion:\s*1\b/.test(line) && !line.includes('// v1 refused')) found.push(`${file}: ${line.trim()}`);
    }
    expect(found).toEqual([]);
  });

  it('a schema-v1 design and an older project file are refused, never migrated', () => {
    const v1 = { ...exampleJson, schemaVersion: 1 };
    for (const r of [validateDocumentV2(v1), readDesign(v1), readDesignJson(JSON.stringify(v1))]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues.map((i) => i.code)).toEqual(['unsupported-schema-version']);
    }
    const project = readProjectFile({ format: 'spatial-graph-lab/project', version: 1 });
    expect(!project.ok && project.issues.map((i) => i.code)).toEqual(['unsupported-version']);
  });
});
