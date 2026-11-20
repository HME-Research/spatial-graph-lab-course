import { createContext, useContext } from 'react';
import { AUTOMATIC_FUNCTION_COLOUR, type FunctionColour } from '@app/extensions';

/**
 * The colour of each function (20 November 2026): the project's own colour → the toolkit
 * function's `colour` → automatic (`functionColourResolver`), provided by the shell. Every view,
 * legend and swatch reads it here so they always agree. Without a provider: the automatic colours.
 */
export const FunctionColourContext = createContext<FunctionColour>(AUTOMATIC_FUNCTION_COLOUR);

export const useFunctionColour = (): FunctionColour => useContext(FunctionColourContext);
