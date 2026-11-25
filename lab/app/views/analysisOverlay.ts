import { createContext, useContext } from 'react';
import type { AnalysisPresentation } from './presentation/analysis';

/**
 * The analysis result currently shown on the model (Stage 07 overlay), or null. Provided by the
 * shell (Workspace) and read by renderers with `analysisNodeStyle`. Deliberately a context, not a
 * `ViewProps` field: the view contract stays frozen, and the overlay is never part of the document
 * or the selection. Without a provider every view behaves as before (null).
 */
export const AnalysisOverlayContext = createContext<AnalysisPresentation | null>(null);

export const useAnalysisOverlay = (): AnalysisPresentation | null => useContext(AnalysisOverlayContext);
