/**
 * Typed primitive attributes. These are compile-time contracts: the application checks every
 * definition and every stored value again at runtime (app/extensions), because Vite runs student
 * TypeScript without type checking.
 */

/** A stored attribute value: the same JSON primitives as the schema-v1 document. */
export type AttributeValue = string | number | boolean | null;

/** Declares one attribute of a node type, or one algorithm parameter. */
export type AttributeSpec =
  | { readonly kind: 'number'; readonly default?: number; readonly min?: number; readonly max?: number }
  | { readonly kind: 'text'; readonly default?: string }
  | { readonly kind: 'boolean'; readonly default?: boolean }
  | { readonly kind: 'enum'; readonly values: readonly [string, ...string[]]; readonly default?: string };

export type AttributeSpecs = { readonly [key: string]: AttributeSpec };

/** The TypeScript type an attribute spec describes (compile time only). */
export type ValueOf<S extends AttributeSpec> = S extends { readonly kind: 'number' }
  ? number
  : S extends { readonly kind: 'text' }
    ? string
    : S extends { readonly kind: 'boolean' }
      ? boolean
      : S extends { readonly kind: 'enum'; readonly values: readonly (infer V)[] }
        ? V
        : never;

/**
 * Effective attribute values: a valid stored value, otherwise the declared default, otherwise
 * `undefined`. `null` and invalid stored values count as "no value".
 */
export type AttributesOf<A extends AttributeSpecs> = { readonly [K in keyof A]?: ValueOf<A[K]> };
