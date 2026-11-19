import { fail, issue, ok, type Result } from '../errors';
import { canonicalFacadeModule, type DesignDocumentV2, type Look } from './schema';

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
    },
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
