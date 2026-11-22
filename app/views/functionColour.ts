import { createContext, useContext } from 'react';
import { AUTOMATIC_FUNCTION_COLOUR, ID_AS_FUNCTION_NAME, type FunctionColour, type FunctionName } from '@app/extensions';

/**
 * The colour of each function (20 November 2026): the project's own colour → the toolkit
 * function's `colour` → automatic (`functionColourResolver`), provided by the shell. Every view,
 * legend and swatch reads it here so they always agree. Without a provider: the automatic colours.
 */
export const FunctionColourContext = createContext<FunctionColour>(AUTOMATIC_FUNCTION_COLOUR);

export const useFunctionColour = (): FunctionColour => useContext(FunctionColourContext);

/**
 * The readable name of each function (22 November 2026): its current label (`functionNameResolver`),
 * provided by the shell, so a rename shows in every view at once. Without a provider: the id.
 */
export const FunctionNameContext = createContext<FunctionName>(ID_AS_FUNCTION_NAME);

export const useFunctionName = (): FunctionName => useContext(FunctionNameContext);
