import type { AttributeSpecs } from './attributes';

/** Exterior façade parameters of a node type. 0 = closed wall, 1 = fully glazed. */
export interface FacadeParameters {
  readonly windowFraction: number;
}

/** `projects/<id>/types/<file>.ts` default export: one programme/node type. */
export interface NodeTypeDefinition<A extends AttributeSpecs = AttributeSpecs> {
  /** The document `typeId`, e.g. "gallery": lowercase letters, digits and "-", starting with a letter. */
  readonly id: string;
  readonly label: string;
  /** Omitted: the application's existing façade for this type id is used. */
  readonly facade?: FacadeParameters;
  readonly attributes?: A;
}

/**
 * Identity helper: returns its argument unchanged. It exists so TypeScript infers literal types
 * (for example an enum's allowed values) for `AttributesOf<…>`. The definition is validated again
 * at runtime when the project is activated.
 */
export const defineNodeType = <const A extends AttributeSpecs = Record<never, never>>(
  type: NodeTypeDefinition<A>,
): NodeTypeDefinition<A> => type;
