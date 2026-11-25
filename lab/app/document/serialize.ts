import { fail, issue, ok, type Result } from './errors';
import { canonicalFacadeModule, type CorridorLook, type DesignDocumentV2, type Look } from './schema';

/** A corridor look with its set fields in a fixed order (`walls`, `roof`, `width`), or undefined when nothing is set. */
const canonicalCorridor = (c: CorridorLook | undefined): CorridorLook | undefined =>
  c && (c.walls !== undefined || c.roof !== undefined || c.width !== undefined)
    ? {
        ...(c.walls === undefined ? {} : { walls: c.walls }),
        ...(c.roof === undefined ? {} : { roof: c.roof }),
        ...(c.width === undefined ? {} : { width: c.width }),
      }
    : undefined;
const corridorField = <K extends string>(key: K, c: CorridorLook | undefined): { [P in K]?: CorridorLook } => {
  const canonical = canonicalCorridor(c);
  return (canonical ? { [key]: canonical } : {}) as { [P in K]?: CorridorLook };
};

/** Canonical look: fixed key order, only fields that are set. */
const canonicalLook = (a: Look): Look => ({
  ...(a.windowFraction === undefined ? {} : { windowFraction: a.windowFraction }),
  ...(a.windowLayout === undefined ? {} : { windowLayout: a.windowLayout }),
  ...(a.walls === undefined ? {} : { walls: a.walls }),
  ...(a.roof === undefined ? {} : { roof: a.roof }),
  ...(a.facade === undefined ? {} : { facade: a.facade === 'none' ? ('none' as const) : canonicalFacadeModule(a.facade) }),
});
import { validateDocumentV2, type ValidationOptionsV2 } from './validate';

/**
 * Reading and writing. Schema v2 is the only document format (P4: schema v1 is retired; no file
 * of another version is read: `validateDocumentV2` reports `unsupported-schema-version`).
 * `serializeDesignV2` writes the canonical text.
 */

export interface ReadDesign {
  readonly doc: DesignDocumentV2;
}

/** Validate an unknown value as a design. Never throws. */
export function readDesign(input: unknown, options: ValidationOptionsV2 = {}): Result<ReadDesign> {
  const v2 = validateDocumentV2(input, options);
  return v2.ok ? ok({ doc: v2.value }) : v2;
}

/** Parse JSON text as a design. Never throws. */
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
 * omitted when undefined, trailing newline. Same document → identical text. Formatting:
 * `formatJson` (arrays of numbers on one line).
 */
export function serializeDesignV2(doc: DesignDocumentV2): string {
  const canonical = {
    schemaVersion: doc.schemaVersion,
    metadata:
      doc.metadata.description === undefined
        ? { name: doc.metadata.name }
        : { name: doc.metadata.name, description: doc.metadata.description },
    nextNodeId: doc.nextNodeId,
    nextEdgeId: doc.nextEdgeId,
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      function: n.function,
      position: [...n.position],
      size: [...n.size],
      custom: { ...n.custom },
    })),
    edges: doc.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      relationship: e.relationship,
      ...corridorField('corridor', e.corridor),
      // A boundary-shift request (2026-11-24): written only when one is requested.
      ...(e.boundaryShift === undefined || e.boundaryShift === 'none' ? {} : { boundaryShift: e.boundaryShift }),
      custom: { ...e.custom },
    })),
    diagram: { positions: { ...doc.diagram.positions } },
    settings: {
      styleBy: doc.settings.styleBy,
      styles: Object.fromEntries(
        Object.entries(doc.settings.styles).map(([by, setup]) => [
          by,
          {
            ...(setup.default === undefined ? {} : { default: canonicalLook(setup.default) }),
            ...(setup.groups === undefined ? {} : { groups: setup.groups.map((g) => ({ value: g.value, look: canonicalLook(g.look) })) }),
            ...(setup.dividers === undefined ? {} : { dividers: [...setup.dividers] }),
            ...(setup.bands === undefined ? {} : { bands: setup.bands.map(canonicalLook) }),
            ...(setup.mode === undefined ? {} : { mode: setup.mode }),
          },
        ]),
      ),
      // The Corridors look card (2026-11-19): written only when something is set.
      ...corridorField('corridors', doc.settings.corridors),
    },
  };
  return `${formatJson(canonical)}\n`;
}

/**
 * JSON text in the app's one written style (owner 2026-11-19): two-space indent; every array of
 * numbers on ONE line with a space after each comma (`[1, 0, 0]`); other arrays and objects
 * multi-line, an object's first entry on the line after its `{`; empty objects and arrays as
 * `{}` / `[]`. Values must be JSON values (`undefined` entries are skipped, as in
 * `JSON.stringify`). No trailing newline.
 */
export function formatJson(value: unknown, indent = ''): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    if (items.length === 0) return '[]';
    if (items.every((x) => typeof x === 'number')) return `[${items.map((x) => JSON.stringify(x)).join(', ')}]`;
    return `[\n${items.map((x) => `${inner}${x === undefined ? 'null' : formatJson(x, inner)}`).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${formatJson(v, inner)}`).join(',\n')}\n${indent}}`;
}
