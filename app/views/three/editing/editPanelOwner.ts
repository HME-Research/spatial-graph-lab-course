import { createContext } from 'react';

/**
 * Which view panel shows the room edit panel when BOTH panels can edit rooms (Voxels + Building):
 * only one, the panel last interacted with (programme phase 05, audit O04), so two identical
 * editors never contradict each other. Provided by the workspace; absent = always show.
 */
export const EditPanelOwnerContext = createContext<number | null>(null);

/** Index of the view panel a view is rendered in (0 or 1), provided by the workspace. */
export const PanelIndexContext = createContext<number | null>(null);
