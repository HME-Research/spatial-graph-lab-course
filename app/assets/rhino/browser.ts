import wasmUrl from 'rhino3dm/rhino3dm.wasm?url';
import { importFacade3dm, type ImportFacadeChoices, type ImportFacadeResult } from '../importFacade';
import { loadRhino3dm, RHINO3DM_VERSION } from './loader';

/**
 * Browser entry of the 3DM façade import. LOAD THIS MODULE ONLY WITH A DYNAMIC `import()`:
 * it pulls in rhino3dm's glue and the URL of its ~2.6 MB WASM, which must stay out of the main
 * bundle (verified on the production build). The WASM is fetched on the first import only.
 */
export async function importFacadeFile(bytes: Uint8Array, fileName: string, choices: ImportFacadeChoices = {}): Promise<ImportFacadeResult> {
  const rhino = await loadRhino3dm({ wasmUrl });
  return importFacade3dm(bytes, { ...choices, fileName, rhino, reader: `rhino3dm@${RHINO3DM_VERSION}` });
}

/** Start loading the reader early (e.g. when the file picker opens). Errors surface on import. */
export function preloadFacadeReader(): void {
  void loadRhino3dm({ wasmUrl }).catch(() => undefined);
}
