import { createContext, useContext } from 'react';
import { GRID_CELL_SIZE } from '@core/spatial';
import { EMPTY_ATTRIBUTE_SCHEMA, isBaselineField, isProjectFunction, metricInfos, type ActiveToolkit, type AttributeField, type ProjectAttributeSchema } from '@app/extensions';
import type { ProjectSheetInput, SheetField } from './aiKits';

/**
 * The open project as the This project kit describes it (owner 2026-11-20): its toolkit, its
 * Functions and every custom field (tagged Toolkit or Yours, as Attributes tags them), the
 * calculated values and the grid. Plain data only: never the design itself.
 */
export function projectSheetInput(project: ActiveToolkit, schema: ProjectAttributeSchema, hasToolkit: boolean): ProjectSheetInput {
  const baseline = hasToolkit ? project.attributeBaseline.schema : EMPTY_ATTRIBUTE_SCHEMA;
  const field = (f: AttributeField, collection: 'nodes' | 'edges'): SheetField => ({
    key: f.key,
    label: f.label,
    kind: f.kind,
    ...(f.values !== undefined && { values: [...f.values] }),
    ...(f.min !== undefined && { min: f.min }),
    ...(f.max !== undefined && { max: f.max }),
    ...(f.default !== undefined && { default: f.default }),
    ...(f.description !== undefined && { description: f.description }),
    origin: isBaselineField(f, collection, baseline) ? 'toolkit' : 'yours',
    functionDefaults:
      collection === 'nodes'
        ? Object.entries(schema.functionDefaults).flatMap(([fn, defaults]) => (defaults[f.id] !== undefined ? [[fn, defaults[f.id]!] as const] : []))
        : [],
  });
  return {
    toolkit: hasToolkit ? { id: project.id, name: project.definition.name } : null,
    functions: project.functions
      .filter((f) => f.status.ok)
      .map((f) => ({ id: f.id, label: f.definition.label, origin: hasToolkit && !isProjectFunction(f) ? 'toolkit' : 'yours' })),
    nodeFields: schema.nodes.map((f) => field(f, 'nodes')),
    edgeFields: schema.edges.map((f) => field(f, 'edges')),
    metrics: metricInfos().map((m) => ({ ...m })),
    cell: { horizontal: GRID_CELL_SIZE.horizontal, vertical: GRID_CELL_SIZE.vertical },
  };
}

/** The open project for the AI kit tabs (provided by the app shell; null when no project is open). */
export const AiKitProjectContext = createContext<ProjectSheetInput | null>(null);

export const useAiKitProject = (): ProjectSheetInput | null => useContext(AiKitProjectContext);
