import { createContext, useContext, useEffect } from 'react';

/**
 * Lets `SceneCanvas` know that an on-canvas manipulator (the snapped room gizmo) is shown, so its
 * own navigation aids (view cube, projection toggle) step back: they fade and let pointer presses
 * through instead of covering a handle that reaches the canvas edge. Generic: any manipulator
 * drawn inside a SceneCanvas calls `useManipulatorPresence()`.
 */
export const ManipulatorContext = createContext<((delta: 1 | -1) => void) | null>(null);

/** Registers the calling component as a shown manipulator for as long as it is mounted. */
export function useManipulatorPresence(): void {
  const report = useContext(ManipulatorContext);
  useEffect(() => {
    if (!report) return;
    report(1);
    return () => report(-1);
  }, [report]);
}
