import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  describeFacadeAsset,
  FACADE_LIMITS,
  facadeAssetsBytes,
  formatBytes,
  METRES_PER_UNIT,
  type FacadeAssetV1,
  type FacadeMaterial,
  type FacadeRole,
  type SourceUnit,
} from '@app/assets';
import type { ImportFacadeResult } from '@app/assets/importFacade';
import { FACADE_PLACEMENTS, type FacadePlacement } from '@app/document/v2';
import { CollapsibleSection } from '@app/ui';
import { FACADE_PLACEMENT_HELP, FACADE_PLACEMENT_LABELS } from './designerModel';
import { FacadeMaterialsDialog } from './FacadeMaterialsDialog';
import './designer.css';

/**
 * Imported façades (3DM) in Building Designer → Function-Specific (owner 2026-11-17: the façade is
 * chosen per function; there is no Defaults section and no design-wide default):
 *  - `FacadeImport`: Import .3dm… inside a function's card; the imported module is given to that
 *    function at once (`onImported`).
 *  - `FacadeAssetDetails`: the chosen façade's size, source file, import notes and Rename.
 *  - `FacadeLibraryFooter`: what the project file holds and Remove unused.
 *
 * The 3DM reader (rhino3dm, ~2.6 MB WASM) is loaded on the first import only, through a dynamic
 * `import()`. Imported façades belong to the PROJECT (all scenarios share them, they are saved and
 * exported with it, not undoable); which function uses which belongs to the scenario (undoable).
 */

type Outcome = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface DesignerFacades {
  /** The project's imported façades. */
  readonly assets: readonly FacadeAssetV1[];
  readonly add: (asset: FacadeAssetV1) => Outcome;
  /** Remove a façade; with `replaceUses`, every function using it goes back to Automatic first. */
  readonly remove: (assetId: string, options?: { readonly replaceUses?: boolean }) => Outcome;
  /** Where a façade is used (scenario name, function type ids), for the removal confirmation. */
  readonly uses?: (assetId: string) => readonly { readonly scenario: string; readonly cards: readonly string[] }[];
  readonly rename: (assetId: string, name: string) => Outcome;
  /** Colour and finish per material group for one use (Materials dialog); `null` = a bay uses the façade's. */
  readonly setMaterials: (assetId: string, materials: readonly FacadeMaterial[] | null, role?: FacadeRole) => Outcome;
}

const UNIT_LABELS: Readonly<Record<SourceUnit, string>> = { m: 'metres', cm: 'centimetres', mm: 'millimetres', in: 'inches', ft: 'feet' };

type ImportState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy'; readonly fileName: string }
  | { readonly kind: 'needs-unit'; readonly fileName: string; readonly bytes: Uint8Array }
  | { readonly kind: 'done'; readonly name: string; readonly warnings: readonly string[]; readonly existed: boolean }
  | { readonly kind: 'error'; readonly fileName: string; readonly messages: readonly string[] };

export interface FacadeImportProps {
  readonly idBase: string;
  readonly facades: DesignerFacades;
  /** Called with the asset once it is in the project (also when it was there already). */
  readonly onImported: (asset: FacadeAssetV1) => void;
  /** Shown on the same row before the Import button (the façade menu). */
  readonly children?: ReactNode;
}

/** Import .3dm… for one function: Outside side, unit prompt for unitless files, errors and notes. */
export function FacadeImport({ idBase, facades, onImported, children }: FacadeImportProps) {
  const [state, setState] = useState<ImportState>({ kind: 'idle' });
  const [unit, setUnit] = useState<SourceUnit>('m');
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = state.kind === 'busy';

  /** `bytes` are kept only while the student chooses a unit for a unitless file. */
  const finish = (fileName: string, bytes: Uint8Array, result: ImportFacadeResult) => {
    if (result.status === 'needs-unit') {
      setState({ kind: 'needs-unit', fileName, bytes });
      return;
    }
    if (result.status === 'refused') {
      setState({ kind: 'error', fileName, messages: result.diagnostics.filter((d) => d.severity === 'error').concat(result.diagnostics.filter((d) => d.severity !== 'error')).map((d) => d.message) });
      return;
    }
    const existing = facades.assets.find((a) => a.id === result.asset.id);
    const added = facades.add(result.asset);
    if (!added.ok) {
      setState({ kind: 'error', fileName, messages: [added.message] });
      return;
    }
    setState({ kind: 'done', name: existing?.name ?? result.asset.name, warnings: result.warnings.map((w) => w.message), existed: existing !== undefined });
    onImported(existing ?? result.asset);
  };

  const run = async (fileName: string, bytes: Uint8Array, unitIfUnitless?: SourceUnit) => {
    setState({ kind: 'busy', fileName });
    try {
      const { importFacadeFile } = await import('@app/assets/rhino/browser');
      // Always read with the Front view (−Y) outside; the function's Outside toggle turns it round live.
      finish(fileName, bytes, await importFacadeFile(bytes, fileName, { outward: '-y', ...(unitIfUnitless && { unitIfUnitless }) }));
    } catch (error) {
      setState({
        kind: 'error',
        fileName,
        messages: [`The 3DM reader could not be loaded or failed: ${error instanceof Error ? error.message : String(error)}. Check the connection and try again.`],
      });
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > FACADE_LIMITS.maxFileBytes) {
      setState({ kind: 'error', fileName: file.name, messages: [`The file is ${formatBytes(file.size)}; the limit is ${formatBytes(FACADE_LIMITS.maxFileBytes)}. Export only the façade component from Rhino (Export Selected).`] });
      return;
    }
    await run(file.name, new Uint8Array(await file.arrayBuffer()));
  };

  return (
    <div className="sgl-designer-facade-import">
      <div className="sgl-designer-import">
        {children}
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          title="A façade module drawn in Rhino: one bay 3 m wide and one storey (3 m) high, x along the wall, z up, the outside facing −Y (Front view). It replaces this function's exterior walls."
        >
          {busy ? 'Reading…' : 'Import .3dm…'}
        </button>
        <input ref={fileInput} type="file" accept=".3dm" hidden onChange={(e) => void onFile(e)} aria-label="Rhino .3dm file to import as a façade" />
      </div>

      {state.kind === 'busy' && (
        <p className="sgl-designer-source" role="status">
          Reading {state.fileName}… (the first import also loads the 3DM reader)
        </p>
      )}
      {state.kind === 'needs-unit' && (
        <div className="sgl-designer-unit" role="group" aria-label="Unit of the file">
          <p className="sgl-designer-warning" role="note">
            ⚠ {state.fileName} has no unit. Choose the unit it was drawn in (it is never guessed):
          </p>
          <div className="sgl-designer-field">
            <label htmlFor={`${idBase}-unit`}>Unit</label>
            <select id={`${idBase}-unit`} value={unit} onChange={(e) => setUnit(e.currentTarget.value as SourceUnit)}>
              {(Object.keys(METRES_PER_UNIT) as SourceUnit[]).map((u) => (
                <option key={u} value={u}>
                  {UNIT_LABELS[u]}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void run(state.fileName, state.bytes, unit)}>
              Import
            </button>
            <button type="button" onClick={() => setState({ kind: 'idle' })}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {state.kind === 'done' && (state.existed || state.warnings.length > 0) && (
        <div className="sgl-designer-source" role="status">
          {state.existed ? `“${state.name}” was already in the project; it is used here.` : `Imported “${state.name}”.`}
          {state.warnings.length > 0 && (
            <ul className="sgl-designer-facade-warnings">
              {state.warnings.map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {state.kind === 'error' && (
        <div className="sgl-designer-error" role="alert">
          <strong>{state.fileName} was not imported.</strong>
          <ul className="sgl-designer-facade-warnings">
            {state.messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The chosen façade: size and source, import notes, Rename (project-wide, every function using it). */
export function FacadeAssetDetails({ asset, facades }: { readonly asset: FacadeAssetV1; readonly facades: DesignerFacades }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (renaming === null) return;
    setRenaming(null);
    if (renaming.trim() !== asset.name) {
      const outcome = facades.rename(asset.id, renaming);
      setError(outcome.ok ? null : outcome.message);
    }
  };
  return (
    <div className="sgl-designer-library-item">
      {renaming !== null ? (
        <input
          className="sgl-designer-library-rename"
          aria-label="Façade name"
          value={renaming}
          maxLength={FACADE_LIMITS.maxNameLength}
          autoFocus
          onChange={(e) => setRenaming(e.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') setRenaming(null);
          }}
        />
      ) : (
        <span className="sgl-designer-source">
          {describeFacadeAsset(asset)} · {asset.source.fileName} ({UNIT_LABELS[asset.source.unit]}
          {asset.source.unitAssumed ? ', chosen' : ''}){' '}
          <button type="button" className="sgl-link" onClick={() => setRenaming(asset.name)} title="Rename this façade everywhere in the project">
            Rename
          </button>{' '}
          <button
            type="button"
            className="sgl-link"
            onClick={() => {
              const message = confirmAndRemoveFacade(facades, asset);
              if (message !== null) setError(message);
            }}
            title="Remove this façade from the project (asks first; functions using it go back to Automatic)"
          >
            Remove
          </button>
        </span>
      )}
      {asset.warnings.length > 0 && (
        <details className="sgl-designer-facade-details">
          <summary>⚠ {asset.warnings.length} import {asset.warnings.length === 1 ? 'note' : 'notes'}</summary>
          <ul className="sgl-designer-facade-warnings">
            {asset.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p className="sgl-designer-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Below the functions: how much the imported façades add to the project file, and Remove unused
 * (façades no function of any scenario uses; ones used elsewhere are refused and kept).
 */
export function FacadeLibraryFooter({ facades, usedHere }: { readonly facades: DesignerFacades; readonly usedHere: ReadonlySet<string> }) {
  const [message, setMessage] = useState<string | null>(null);
  if (facades.assets.length === 0) return null;
  const total = facadeAssetsBytes(facades.assets);
  const candidates = facades.assets.filter((a) => !usedHere.has(a.id));
  const removeUnused = () => {
    let removed = 0;
    const kept: string[] = [];
    for (const a of candidates) {
      if (facades.remove(a.id).ok) removed++;
      else kept.push(a.name);
    }
    setMessage(
      [removed > 0 ? `Removed ${removed} unused ${removed === 1 ? 'façade' : 'façades'}.` : '', kept.length > 0 ? `Kept ${kept.join(', ')}: used in another scenario.` : '']
        .filter(Boolean)
        .join(' '),
    );
  };
  const warn = total > FACADE_LIMITS.warnTotalBytes;
  return (
    <div className="sgl-designer-facade-footer">
      <p className={warn ? 'sgl-designer-warning' : 'sgl-designer-source'}>
        {warn ? '⚠ ' : ''}Imported façades: {facades.assets.length}, {formatBytes(total)} of {formatBytes(FACADE_LIMITS.maxTotalBytes)} in the project file
        {warn ? '. Large façades slow down saving; simplify meshes in Rhino if you can.' : '.'}
        {candidates.length > 0 && (
          <>
            {' '}
            <button type="button" className="sgl-link" onClick={removeUnused} title="Remove imported façades that no function uses">
              Remove unused ({candidates.length})
            </button>
          </>
        )}
      </p>
      {message && (
        <p className="sgl-designer-source" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

/** Repeat / Stretch for an imported façade (label above: it shares a row with Outside). */
export function PlacementControl({ idBase, placement, onPlacement }: { readonly idBase: string; readonly placement: FacadePlacement; readonly onPlacement: (p: FacadePlacement) => void }) {
  return (
    <div className="sgl-designer-stacked">
      <span className="sgl-designer-label" id={`${idBase}-placement`} title="How the module is fitted to the exterior walls">
        Placement
      </span>
      <div className="sgl-segmented sgl-segmented-sm" role="radiogroup" aria-labelledby={`${idBase}-placement`}>
        {FACADE_PLACEMENTS.map((p) => (
          <label key={p} className={placement === p ? 'checked' : undefined} title={FACADE_PLACEMENT_HELP[p]}>
            <input type="radio" name={`${idBase}-placement`} value={p} checked={placement === p} onChange={() => onPlacement(p)} />
            {FACADE_PLACEMENT_LABELS[p]}
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Project → **Imported façades** (owner 2026-11-17; in addition to the Designer's per-function
 * import): the project's façade library on its own. Import .3dm… adds a façade without giving it
 * to a function; each façade has its details (Rename), Materials… (all three uses) and Remove
 * (refused while any scenario uses it). Collapsible, collapsed until opened.
 */
export function FacadeLibrarySection({ facades }: { readonly facades: DesignerFacades }) {
  const [materialsOf, setMaterialsOf] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const shown = materialsOf ? facades.assets.find((a) => a.id === materialsOf) : undefined;
  const total = facadeAssetsBytes(facades.assets);
  const remove = (asset: FacadeAssetV1) => {
    const message = confirmAndRemoveFacade(facades, asset);
    if (message !== null) setMessage(message);
  };
  return (
    <CollapsibleSection title="Imported façades" sectionId="project-facades" meta={facades.assets.length > 0 ? String(facades.assets.length) : undefined}>
      <div className="sgl-designer-facade sgl-project-facades">
        <p className="sgl-help">
          Façade modules drawn in Rhino (.3dm), shared by every scenario of this project. Give one to a function in Designer → Façade → Import.
        </p>
        <FacadeImport idBase="sgl-project-facades" facades={facades} onImported={(a) => setMessage(`“${a.name}” is in the project.`)} />
        {facades.assets.length > 0 && (
          <ul className="sgl-project-facades-list">
            {facades.assets.map((a) => (
              <li key={a.id}>
                <strong className="sgl-project-facades-name">{a.name}</strong>
                <FacadeAssetDetails asset={a} facades={facades} />
                <div className="sgl-designer-import">
                  <button type="button" className="sgl-designer-materials-button" onClick={() => setMaterialsOf(a.id)} title="Solid, glass or open, and the colour, of each part: as a façade, a door bay or an open bay">
                    Materials…
                  </button>
                  <button type="button" onClick={() => remove(a)} title="Remove this façade from the project (asks first when a function uses it; those go back to Automatic)">
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {facades.assets.length > 0 && (
          <p className="sgl-designer-source">
            {formatBytes(total)} of {formatBytes(FACADE_LIMITS.maxTotalBytes)} in the project file.
          </p>
        )}
        {message && (
          <p className="sgl-designer-source" role="status">
            {message}
          </p>
        )}
        {shown && <FacadeMaterialsDialog asset={shown} facades={facades} onClose={() => setMaterialsOf(null)} />}
      </div>
    </CollapsibleSection>
  );
}

/** The confirmation text for removing a façade that is in use (pure; exported for tests). */
export function removeFacadeQuestion(asset: Pick<FacadeAssetV1, 'name'>, uses: readonly { readonly scenario: string; readonly cards: readonly string[] }[]): string {
  const where = uses.map((u) => `• ${u.scenario}: ${u.cards.join(', ')}`).join('\n');
  return `“${asset.name}” is used by:\n${where}\n\nRemove it anyway? Those styles (and door / open bays) go back to Automatic. Undo in a scenario restores its setting, but the removed façade itself is not restored.`;
}

/**
 * Remove a façade, asking first when any scenario uses it (owner 2026-11-17). Returns the message
 * to show, or null when the student cancelled.
 */
export function confirmAndRemoveFacade(facades: DesignerFacades, asset: FacadeAssetV1, confirm: (text: string) => boolean = (t) => window.confirm(t)): string | null {
  const uses = facades.uses?.(asset.id) ?? [];
  if (uses.length > 0 && !confirm(removeFacadeQuestion(asset, uses))) return null;
  const outcome = facades.remove(asset.id, { replaceUses: uses.length > 0 });
  if (!outcome.ok) return outcome.message;
  const count = uses.reduce((n, u) => n + u.cards.length, 0);
  return uses.length > 0 ? `Removed “${asset.name}”; ${count} ${count === 1 ? 'style is' : 'styles are'} Automatic again.` : `Removed “${asset.name}”.`;
}
