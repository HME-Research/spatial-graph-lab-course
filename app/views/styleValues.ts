import { useMemo } from 'react';
import type { DesignDocumentV2, StyleBy, StyleValues } from '@app/document';
import { EMPTY_ATTRIBUTE_SCHEMA, resolveField, type ProjectAttributeSchema } from '@app/extensions';
import { BUILT_IN_METRICS, defaultMetricEvaluator } from '@app/metrics';
import type { SpatialResolution } from '@app/spatial';

/**
 * Values for "Style rooms by" (S3, 2026-11-19). The document resolves Function and Level itself;
 * a custom attribute or a measured value lives above it, so views and the Designer supply it here
 * as `node id → value`:
 * - `attribute:<field id>`: the effective value through THE attribute resolver (instance value,
 *   else type default, else schema default); a field no longer in the schema gives no values;
 * - `metric:<id>`: the catalogue node metric (geometry / topology only, never the look, so there
 *   is no feedback loop); an unknown metric gives no values.
 * Rooms without a value are simply missing (they use Default).
 */
export function styleValuesFor(
  doc: DesignDocumentV2,
  spatial: SpatialResolution,
  by: StyleBy,
  schema: ProjectAttributeSchema,
): StyleValues | undefined {
  if (by.startsWith('attribute:')) {
    const id = by.slice('attribute:'.length);
    const field = schema.nodes.find((f) => f.id === id);
    const out = new Map<string, unknown>();
    if (!field) return out;
    for (const node of doc.nodes) {
      const defaults = Object.prototype.hasOwnProperty.call(schema.nodeTypeDefaults, node.typeId) ? schema.nodeTypeDefaults[node.typeId]! : {};
      const value = resolveField(field, node.attributes, Object.prototype.hasOwnProperty.call(defaults, id) ? defaults[id] : undefined).value;
      if (value !== null && value !== undefined) out.set(node.id, value);
    }
    return out;
  }
  if (by.startsWith('metric:')) {
    const id = by.slice('metric:'.length);
    const out = new Map<string, unknown>();
    if (!BUILT_IN_METRICS.some((m) => m.id === id && m.collection === 'nodes')) return out;
    for (const [nodeId, value] of defaultMetricEvaluator.values({ doc, spatial }, id)) {
      if (value !== null) out.set(nodeId, value);
    }
    return out;
  }
  return undefined;
}

/** `styleValuesFor` the active "Style rooms by" attribute, memoised on the design and the schema. */
export function useStyleValues(doc: DesignDocumentV2 | undefined, spatial: SpatialResolution | undefined, schema: ProjectAttributeSchema | undefined): StyleValues | undefined {
  const by = doc?.settings.styleBy;
  const nodes = doc?.nodes;
  const edges = doc?.edges;
  return useMemo(
    () => (doc && spatial && by ? styleValuesFor(doc, spatial, by, schema ?? EMPTY_ATTRIBUTE_SCHEMA) : undefined),
    // Values read the rooms, the relationships, the resolution and the schema only (never the looks).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, edges, spatial, by, schema],
  );
}
