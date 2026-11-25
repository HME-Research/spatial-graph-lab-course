import { sha256Hex } from './binary';
import { normaliseFacadeSource, type Diagnostic, type SourceOutward, type SourceUnit } from './facadeAdapter';
import { createFacadeAsset, FACADE_LIMITS, type FacadeAssetV1 } from './facadeAsset';
import { read3dmFacade, type RhinoModule } from './rhino/reader';

/**
 * 3DM façade import pipeline: file bytes → reader → adapter (units, Z-up → Y-up, bounding box)
 * → validated asset. Pure apart from the injected rhino3dm module, so Node tests run exactly
 * what the browser runs (`./rhino/browser.ts` only adds lazy loading and the WASM URL).
 */

export interface ImportFacadeChoices {
  /** Required when the file has no unit system; never guessed. */
  readonly unitIfUnitless?: SourceUnit;
  /** Which source side is the exterior (default '-y': drawn in Rhino's Front view). */
  readonly outward?: SourceOutward;
  /** Display name (default: from the file name). */
  readonly name?: string;
}

export type ImportFacadeResult =
  /** Imported. `warnings` were also stored on the asset. */
  | { readonly status: 'ok'; readonly asset: FacadeAssetV1; readonly warnings: readonly Diagnostic[] }
  /** The file has no unit system: ask the student for one and import again. */
  | { readonly status: 'needs-unit'; readonly warnings: readonly Diagnostic[] }
  /** Refused; at least one `error` diagnostic says why. */
  | { readonly status: 'refused'; readonly diagnostics: readonly Diagnostic[] };

export interface ImportFacadeOptions extends ImportFacadeChoices {
  readonly fileName: string;
  readonly rhino: RhinoModule;
  /** Reader label stored on the asset, e.g. `rhino3dm@8.17.0`. */
  readonly reader: string;
}

export function importFacade3dm(bytes: Uint8Array, options: ImportFacadeOptions): ImportFacadeResult {
  const read = read3dmFacade(bytes, options.rhino, { maxBytes: FACADE_LIMITS.maxFileBytes });
  if (!read.ok) return { status: 'refused', diagnostics: read.diagnostics };
  if (read.unit === 'unitless' && !options.unitIfUnitless) return { status: 'needs-unit', warnings: read.diagnostics };

  const normalised = normaliseFacadeSource(
    { unit: read.unit, meshes: read.source.meshes, ...(read.source.groups && { groups: read.source.groups }), outward: options.outward ?? '-y' },
    {
      ...(options.unitIfUnitless && { assumeUnitlessAs: options.unitIfUnitless }),
      maxTriangles: FACADE_LIMITS.maxTriangles,
      maxExtentMetres: FACADE_LIMITS.maxExtentMetres,
      maxDepthMetres: FACADE_LIMITS.maxDepthMetres,
    },
  );
  if (!normalised.ok) return { status: 'refused', diagnostics: [...normalised.diagnostics, ...read.diagnostics] };
  if (normalised.component.groups.length > FACADE_LIMITS.maxGroups) {
    return {
      status: 'refused',
      diagnostics: [
        { severity: 'error', code: 'too-many-groups', message: `The component uses ${normalised.component.groups.length} layer/colour combinations; at most ${FACADE_LIMITS.maxGroups} are supported. Merge layers in Rhino.` },
      ],
    };
  }
  if (normalised.component.positions.length / 3 > FACADE_LIMITS.maxVertices) {
    return { status: 'refused', diagnostics: [{ severity: 'error', code: 'too-many-vertices', message: `The component has more than ${FACADE_LIMITS.maxVertices.toLocaleString('en-GB')} vertices; reduce its mesh density in Rhino.` }] };
  }

  const warnings = [...read.diagnostics, ...normalised.diagnostics];
  const unit: SourceUnit = read.unit === 'unitless' ? options.unitIfUnitless! : read.unit;
  const created = createFacadeAsset(normalised.component, {
    fileName: options.fileName,
    fileBytes: bytes.byteLength,
    fileSha256: sha256Hex(bytes),
    unit,
    unitAssumed: read.unit === 'unitless',
    reader: options.reader,
    warnings: warnings.map((w) => w.message),
    ...(options.name !== undefined && { name: options.name }),
  });
  if (!created.ok) {
    return { status: 'refused', diagnostics: created.issues.map((i) => ({ severity: 'error' as const, code: 'invalid-asset', message: i.message })) };
  }
  return { status: 'ok', asset: created.value, warnings };
}
