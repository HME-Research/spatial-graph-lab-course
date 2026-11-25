import type { AttributeSpecs } from './attributes';

/** Exterior façade parameters of a function. 0 = closed wall, 1 = fully glazed. */
export interface FacadeParameters {
  readonly windowFraction: number;
}

/** `toolkits/<id>/functions/<file>.ts` default export: one function (the room's programme). */
export interface FunctionDefinition<A extends AttributeSpecs = AttributeSpecs> {
  /** The node's `function` in designs, e.g. "gallery": lowercase letters, digits and "-", starting with a letter. */
  readonly id: string;
  readonly label: string;
  /**
   * Default colour of rooms with this function in every view, as hex `#rrggbb` (e.g. "#e8a33d").
   * Omitted: an automatic colour derived from the id. A project can still change it in the
   * Functions dialog.
   */
  readonly colour?: string;
  /** Omitted: the application's existing façade for this function is used. */
  readonly facade?: FacadeParameters;
  /** Custom attributes of rooms with this function (stored under the node's `custom`). */
  readonly custom?: A;
}

/**
 * Identity helper: returns its argument unchanged. It exists so TypeScript infers literal types
 * (for example an enum's allowed values) for `AttributesOf<…>`. The definition is validated again
 * at runtime when the project is activated.
 */
export const defineFunction = <const A extends AttributeSpecs = Record<never, never>>(
  fn: FunctionDefinition<A>,
): FunctionDefinition<A> => fn;
