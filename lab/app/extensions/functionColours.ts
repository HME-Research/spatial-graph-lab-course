import { typeColor } from '@core/viewer/appearance';
import type { ActiveToolkit } from './activate';

/**
 * Function colours (20 November 2026, owner decision): the ONE resolver every view, legend and
 * swatch uses, so they always agree. Resolution:
 *   the project's own colour (`settings.functionColours`, set in the Functions dialog)
 *   → the toolkit function's `colour` (a valid definition only)
 *   → the automatic `typeColor` derived from the id.
 * Colours are `#rrggbb`, always returned in lowercase. Pure.
 */
export type FunctionColour = (functionId: string) => string;

/** A stored colour: `#rrggbb` in lowercase (the project file accepts only this form). */
export const STORED_COLOUR_PATTERN = /^#[0-9a-f]{6}$/;

/** The colour a function has when the project does not set one: the toolkit's, else automatic. */
export function defaultFunctionColour(project: ActiveToolkit | null, functionId: string): string {
  const type = project?.functions.find((t) => t.id === functionId);
  const declared = type?.status.ok ? type.definition.colour : undefined;
  return declared !== undefined ? declared.toLowerCase() : typeColor(functionId);
}

/** Resolver for one project and its overrides (memoised per function id). */
export function functionColourResolver(project: ActiveToolkit | null, overrides?: Readonly<Record<string, string>>): FunctionColour {
  const cache = new Map<string, string>();
  return (functionId) => {
    let colour = cache.get(functionId);
    if (colour === undefined) {
      const own = overrides && Object.hasOwn(overrides, functionId) ? overrides[functionId] : undefined;
      colour = own !== undefined && STORED_COLOUR_PATTERN.test(own) ? own : defaultFunctionColour(project, functionId);
      cache.set(functionId, colour);
    }
    return colour;
  };
}

/** Without a project: the automatic colours (identical to `typeColor`). */
export const AUTOMATIC_FUNCTION_COLOUR: FunctionColour = typeColor;
