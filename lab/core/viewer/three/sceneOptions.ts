import { createContext, useContext } from 'react';

/**
 * Generic appearance and navigation options of one `SceneCanvas` (workstream E). Plain data,
 * provided by the host around a canvas (the application derives it per viewport from its display
 * settings); a canvas without a provider uses `DEFAULT_SCENE_OPTIONS`, i.e. exactly the behaviour
 * before these options existed plus the navigation cube.
 *
 * Appearance only: none of these options changes what a view builds from its data.
 */
export const SCENE_LIGHTING = ['default', 'soft'] as const;
export type SceneLighting = (typeof SCENE_LIGHTING)[number];

export interface SceneOptions {
  /** `soft`: low-contrast even lighting replaces the view's own lights. */
  readonly lighting: SceneLighting;
  /** Text labels anchored in 3D (`SceneLabel`, level labels). */
  readonly labels: boolean;
  /** Overlay legends (`.viewer3d-legend`). */
  readonly legend: boolean;
  /** The canvas may switch to (and accept poses in) an orthographic projection. */
  readonly orthographic: boolean;
  /** Show the navigation cube. */
  readonly navigationCube: boolean;
}

export const DEFAULT_SCENE_OPTIONS: SceneOptions = Object.freeze({
  lighting: 'default',
  labels: true,
  legend: true,
  orthographic: false,
  navigationCube: true,
});

export const SceneOptionsContext = createContext<SceneOptions>(DEFAULT_SCENE_OPTIONS);

export function useSceneOptions(): SceneOptions {
  return useContext(SceneOptionsContext);
}
