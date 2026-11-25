import { createContext, useContext, useMemo } from 'react';

/**
 * View-local state that should outlive a view instance, kept by the panel that hosts it: the camera
 * of a 3D view or the viewport of the 2D diagram, so closing and reopening a split panel (or switching
 * a panel's mode away and back) restores it without keeping a hidden renderer running.
 *
 * Plain synchronous storage, not React state: saving never re-renders anything. Optional: without a
 * provider (tests, other hosts) views simply start fresh, exactly as before.
 */
export interface PanelMemory {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export function createPanelMemory(): PanelMemory {
  const values = new Map<string, unknown>();
  return {
    get: (key) => values.get(key),
    set: (key, value) => void values.set(key, value),
  };
}

export const PanelMemoryContext = createContext<PanelMemory | null>(null);

/** One remembered value of the hosting panel. */
export interface Remembered<T> {
  load(): T | undefined;
  save(value: T): void;
}

/**
 * The hosting panel's memory slot `key` (e.g. `camera:graph3d`), or undefined outside a panel.
 * The caller is responsible for storing only values of type `T` under its key.
 */
export function useRemembered<T>(key: string): Remembered<T> | undefined {
  const memory = useContext(PanelMemoryContext);
  return useMemo(
    () => (memory ? { load: () => memory.get(key) as T | undefined, save: (value: T) => memory.set(key, value) } : undefined),
    [memory, key],
  );
}
