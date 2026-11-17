import { createContext, useContext } from 'react';
import type { ComponentSize, FacadeAssetV1 } from '@app/assets';

/**
 * The open project's imported façades (`ProjectFileV1.assets`), provided by the shell so views
 * can draw them without a change to `ViewProps`. Project-level: every scenario shares them.
 */
export interface FacadeLibrary {
  readonly assets: readonly FacadeAssetV1[];
  readonly byId: ReadonlyMap<string, FacadeAssetV1>;
  /** Width and height of an asset (for placement), or null when the project lacks it. */
  readonly sizeOf: (assetId: string) => ComponentSize | null;
}

export function facadeLibraryOf(assets: readonly FacadeAssetV1[]): FacadeLibrary {
  const byId = new Map(assets.map((a) => [a.id, a] as const));
  return {
    assets,
    byId,
    sizeOf: (assetId) => {
      const a = byId.get(assetId);
      return a ? { width: a.size[0], height: a.size[1], depth: a.size[2] } : null;
    },
  };
}

export const EMPTY_FACADE_LIBRARY: FacadeLibrary = facadeLibraryOf([]);

export const FacadeLibraryContext = createContext<FacadeLibrary>(EMPTY_FACADE_LIBRARY);

export const useFacadeLibrary = (): FacadeLibrary => useContext(FacadeLibraryContext);
