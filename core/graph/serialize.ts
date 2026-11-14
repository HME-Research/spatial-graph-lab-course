import { fail, issue, type Result } from './errors';
import type { DesignDocument } from './schema';
import { validateDocument, type ValidationOptions } from './validate';

/** Parse JSON text and validate it as a DesignDocument. Never throws for bad input. */
export function parseDesignJson(text: string, options?: ValidationOptions): Result<DesignDocument> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail([issue([], 'invalid-json', `file is not valid JSON: ${detail}`)]);
  }
  return validateDocument(raw, options);
}

/**
 * Serialise with a fixed key order and the document's own array order, so that
 * the same document always produces identical text.
 */
export function serializeDesign(doc: DesignDocument): string {
  const canonical = {
    schemaVersion: doc.schemaVersion,
    metadata:
      doc.metadata.description === undefined
        ? { name: doc.metadata.name }
        : { name: doc.metadata.name, description: doc.metadata.description },
    nodes: doc.nodes.map((n) => ({ id: n.id, grid: [...n.grid], typeId: n.typeId, attributes: { ...n.attributes } })),
    edges: doc.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: e.kind,
      attributes: { ...e.attributes },
    })),
    diagram: { positions: { ...doc.diagram.positions } },
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
