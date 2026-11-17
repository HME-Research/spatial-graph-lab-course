import { fail, issue, ok, type Result } from '../errors';
import { validateDocument } from '../validate';
import { SCHEMA_VERSION_V2 } from './constants';
import { migrateV1toV2 } from './migrate';
import type { DesignDocumentV2 } from './schema';
import { validateDocumentV2, type ValidationOptionsV2 } from './validate';

/**
 * Reading and writing — FROZEN Gate 0 compatibility policy:
 * - READ both versions: `readDesign` / `readDesignJson` accept schema v1 (validated by the
 *   unchanged v1 validator, then migrated by `migrateV1toV2`) and schema v2.
 * - WRITE v2 only: `serializeDesignV2`. There is no v2 → v1 export; a v1 file is never written
 *   with v2 properties, and the original v1 file is never overwritten by the application.
 * - The v1 `parseDesignJson` / `serializeDesign` keep their exact v1 behaviour (golden tests)
 *   until the integration switches the app's load/export path to these functions.
 */

export interface ReadDesign {
  readonly doc: DesignDocumentV2;
  /** Version of the input; 1 means it was migrated. */
  readonly sourceVersion: 1 | 2;
}

/** Validate an unknown value as a v1 or v2 design and return it as v2. Never throws. */
export function readDesign(input: unknown, options: ValidationOptionsV2 = {}): Result<ReadDesign> {
  const version =
    typeof input === 'object' && input !== null && !Array.isArray(input) && 'schemaVersion' in input
      ? (input as { schemaVersion: unknown }).schemaVersion
      : undefined;
  if (version === 1) {
    const v1 = validateDocument(input, options);
    if (!v1.ok) return v1;
    const migrated = validateDocumentV2(migrateV1toV2(v1.value), options);
    return migrated.ok ? ok({ doc: migrated.value, sourceVersion: 1 }) : migrated;
  }
  if (version !== undefined && version !== SCHEMA_VERSION_V2) {
    return fail([
      issue(
        ['schemaVersion'],
        'unsupported-schema-version',
        `unsupported schemaVersion ${JSON.stringify(version)}; this application reads versions 1 and 2`,
      ),
    ]);
  }
  const v2 = validateDocumentV2(input, options);
  return v2.ok ? ok({ doc: v2.value, sourceVersion: 2 }) : v2;
}

/** Parse JSON text as a v1 or v2 design. Never throws. */
export function readDesignJson(text: string, options?: ValidationOptionsV2): Result<ReadDesign> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail([issue([], 'invalid-json', `file is not valid JSON: ${detail}`)]);
  }
  return readDesign(raw, options);
}

/**
 * Canonical v2 text: fixed key order, the document's own array/record order, optional fields
 * omitted when undefined, trailing newline. Same document → identical text.
 */
export function serializeDesignV2(doc: DesignDocumentV2): string {
  const canonical = {
    schemaVersion: doc.schemaVersion,
    metadata:
      doc.metadata.description === undefined
        ? { name: doc.metadata.name }
        : { name: doc.metadata.name, description: doc.metadata.description },
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      ...(n.displayId === undefined ? {} : { displayId: n.displayId }),
      grid: [...n.grid],
      size: [...n.size],
      typeId: n.typeId,
      attributes: { ...n.attributes },
    })),
    edges: doc.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: e.kind,
      ...(e.connectorStyle === undefined ? {} : { connectorStyle: e.connectorStyle }),
      attributes: { ...e.attributes },
    })),
    diagram: { positions: { ...doc.diagram.positions } },
    settings: {
      typeAppearance: Object.fromEntries(
        Object.entries(doc.settings.typeAppearance).map(([typeId, a]) => [
          typeId,
          {
            ...(a.windowFraction === undefined ? {} : { windowFraction: a.windowFraction }),
            ...(a.windowLayout === undefined ? {} : { windowLayout: a.windowLayout }),
            ...(a.roof === undefined ? {} : { roof: a.roof }),
          },
        ]),
      ),
    },
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
