import { CollapsibleSection, useRememberedOpen } from '@app/ui';
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { buildingFacesV2, exampleFacadeProvider } from '@app/building';
import { designUsesFacadeModules, facadeAssetIdsOf, layoutFacadeModules, type FacadeAssetV1 } from '@app/assets';
import { FACADE_VARIANTS, ROOF_STYLES, WINDOW_LAYOUTS, type FacadeModule, type FacadeVariant, type FacadeVariantKind } from '@app/document/v2';
import type { DesignPort } from '@app/spatial';
import type { ProjectViewContext } from '@app/views/project';
import { typeColor } from '@core/viewer/appearance';
import type { Selection } from '@core/viewer/selection';
import {
  designerTypeRows,
  distortionMessage,
  FACADE_PLACEMENT_LABELS,
  formatPercent,
  parseWindowPercent,
  resetTypeEdit,
  ROOF_LABELS,
  FACADE_MODE_HELP,
  FACADE_MODE_LABELS,
  FACADE_MODES,
  setFacadeModeEdit,
  type FacadeMode,
  setRoofEdit,
  setWindowFractionEdit,
  setWindowLayoutEdit,
  WINDOW_LAYOUT_LABELS,
  type DesignerEdit,
  type DesignerTypeRow,
} from './designerModel';
import { DesignerGuideButton } from './DesignerGuide';
import { FacadeAssetDetails, FacadeImport, FacadeLibraryFooter, PlacementControl, type DesignerFacades } from './FacadeLibraryPanel';
import { FacadeMaterialsDialog } from './FacadeMaterialsDialog';
import './designer.css';

/**
 * Designer panel (06-designer): per-design, per-node-type window coverage and roof.
 *
 * Reads the v2 document from `design.doc` and changes it ONLY through `design.onCommand` with the
 * frozen `set-type-appearance` command: one committed change (slider release, Enter, blur, roof
 * choice, reset) = one command = one history step. Without a v2 port (before integration) it
 * shows a notice instead of controls.
 */
export interface DesignerPanelProps {
  /** Schema-v2 port (ViewProps.design). Absent: the panel explains that it is unavailable. */
  readonly design?: DesignPort;
  /** Active project (ViewProps.project): registered types and their project façade defaults. */
  readonly project?: ProjectViewContext;
  /** Unused since the Defaults section was removed (2026-11-17); kept so callers stay valid. */
  readonly selection?: Selection;
  /** Unused since the Defaults section was removed (2026-11-17); connector styles are in Properties. */
  readonly onShowRelationship?: (edgeId: string) => void;
  /** The project's imported façades (3DM). Absent: the imported-façade controls are not shown. */
  readonly facades?: DesignerFacades;
}

const NO_ASSETS: readonly FacadeAssetV1[] = [];


export function DesignerPanel({ design, project, facades }: DesignerPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const doc = design?.doc;
  const activeProject = project?.project ?? null;
  const facade = project?.facade ?? exampleFacadeProvider;
  const rows = useMemo(() => (doc ? designerTypeRows(doc, activeProject, facade) : []), [doc, activeProject, facade]);
  const assets = facades?.assets ?? NO_ASSETS;
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a] as const)), [assets]);
  // Where the modules land (for fit warnings): only computed when the design uses imported façades.
  const spatial = design?.spatial;
  const modules = useMemo(() => {
    if (!doc || !spatial || !designUsesFacadeModules(doc)) return [];
    const sizeOf = (id: string) => {
      const a = assetById.get(id);
      return a ? { width: a.size[0], height: a.size[1], depth: a.size[2] } : null;
    };
    return layoutFacadeModules(buildingFacesV2(doc, spatial, facade).faces, doc, sizeOf).instances;
  }, [doc, spatial, facade, assetById]);
  const usedHere = useMemo(() => new Set(doc ? facadeAssetIdsOf(doc) : []), [doc]);

  if (!design || !doc) {
    return (
      <div className="sgl-designer" aria-label="Designer">
        <p className="sgl-designer-notice">
          The Designer needs a schema-v2 design. It becomes available once the app stores v2 documents.
        </p>
      </div>
    );
  }

  const send = (edit: DesignerEdit) => {
    if (edit.kind === 'unchanged') return;
    if (edit.kind === 'invalid') {
      setError(edit.message);
      return;
    }
    const outcome = design.onCommand(edit.command);
    setError(outcome.ok ? null : outcome.issues.map((i) => i.message).join(' '));
  };

  return (
    <div className="sgl-designer" aria-label="Building Designer">
      <div className="sgl-designer-intro">
        <p className="sgl-help">Windows and roofs per function, for this scenario. Colours and lighting are in Display.</p>
        <DesignerGuideButton />
      </div>

      {error && (
        <p className="sgl-designer-error" role="alert">
          {error}
        </p>
      )}

      <CollapsibleSection title="Function-Specific" sectionId="designer-functions" meta={String(rows.length)}>
        {rows.length === 0 ? (
          <p className="sgl-designer-notice">No functions yet: add a room or define a type in your project.</p>
        ) : (
          <ul className="sgl-designer-list">
            {rows.map((row) => (
              <li key={row.typeId}>
                <TypeRow
                  row={row}
                  onWindow={(fraction) =>
                    send(setWindowFractionEdit(doc, row.typeId, fraction, row.projectDefault.windowFraction))
                  }
                  onInvalid={setError}
                  onLayout={(layout) => send(setWindowLayoutEdit(doc, row.typeId, layout))}
                  onMode={(mode) => send(setFacadeModeEdit(doc, row.typeId, mode))}
                  onRoof={(roof) => send(setRoofEdit(doc, row.typeId, roof))}
                  onReset={() => send(resetTypeEdit(doc, row.typeId))}
                  {...(facades && {
                    facade: {
                      module: row.effective.walls === 'enclosed' ? row.effective.facade : null,
                      library: facades,
                      assetById,
                      fit: distortionMessage(modules, row.typeId),
                      onModule: (module) => send(setFacadeModeEdit(doc, row.typeId, 'import', module, assetById.get(module.assetId)?.name)),
                    },
                  })}
                />
              </li>
            ))}
          </ul>
        )}
        {facades && <FacadeLibraryFooter facades={facades} usedHere={usedHere} />}
      </CollapsibleSection>
    </div>
  );
}

interface TypeRowProps {
  readonly row: DesignerTypeRow;
  readonly onWindow: (fraction: number) => void;
  readonly onInvalid: (message: string) => void;
  readonly onLayout: (layout: string) => void;
  readonly onMode: (mode: FacadeMode) => void;
  readonly onRoof: (roof: string) => void;
  readonly onReset: () => void;
  /** Imported façade controls (absent without a project façade library). */
  readonly facade?: TypeRowFacade;
}

interface TypeRowFacade {
  /** This function's imported module (Import mode), or null. */
  readonly module: FacadeModule | null;
  /** The project's imported façades (import, rename, choose). */
  readonly library: DesignerFacades;
  readonly assetById: ReadonlyMap<string, FacadeAssetV1>;
  /** Fit warning for this function's modules, or null. */
  readonly onModule: (module: FacadeModule) => void;
  readonly fit: string | null;
}

/**
 * Import mode: which imported façade (or Import .3dm… for a new one), which side faces outside,
 * Repeat / Stretch, Materials…, details and warnings. Without a module yet, only the menu and the
 * import are shown; choosing or importing one switches the function to Import (one undo step).
 */
function ImportField({ idBase, facade }: { readonly idBase: string; readonly facade: TypeRowFacade }) {
  const { module } = facade;
  const asset = module ? facade.assetById.get(module.assetId) : undefined;
  const assets = facade.library.assets;
  const [materials, setMaterials] = useState(false);
  // Every change keeps the rest of the module (its door / open bay variants included).
  const use = (assetId: string) => facade.onModule(module ? { ...module, assetId } : { assetId, placement: 'repeat' });
  return (
    <section className="sgl-designer-facade" aria-label="Imported façade">
      <FacadeImport idBase={idBase} facades={facade.library} onImported={(imported) => use(imported.id)}>
        {(assets.length > 0 || module) && (
          <select
            id={`${idBase}-facade`}
            className="sgl-designer-facade-select"
            aria-label="Imported façade"
            title="An imported 3DM module that replaces this function's exterior walls"
            value={module ? module.assetId : ''}
            onChange={(e) => e.currentTarget.value && use(e.currentTarget.value)}
          >
            {!module && <option value="">Choose…</option>}
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
            {module && !asset && <option value={module.assetId}>Missing façade</option>}
          </select>
        )}
        {module && asset && (
          <button type="button" className="sgl-designer-materials-button" onClick={() => setMaterials(true)} title="Solid, glass or open, and the colour, of each part of the model">
            Materials…
          </button>
        )}
      </FacadeImport>
      {materials && asset && <FacadeMaterialsDialog asset={asset} facades={facade.library} onClose={() => setMaterials(false)} />}
      {module && (
        <>
          <div className="sgl-designer-pair">
            <OutsideControl idBase={idBase} flip={!!module.flip} onFlip={(flip) => facade.onModule(withFlip(module, flip))} />
            <PlacementControl idBase={idBase} placement={module.placement} onPlacement={(placement) => facade.onModule({ ...module, placement })} />
          </div>
          {asset && <FacadeAssetDetails asset={asset} facades={facade.library} />}
          <p className="sgl-designer-source">{module.placement === 'repeat' ? 'One module per 3 m bay' : 'One module per wall run'}; it replaces the wall and its windows.</p>
          {FACADE_VARIANTS.map((kind) => (
            <VariantField
              key={kind}
              idBase={`${idBase}-${kind}`}
              kind={kind}
              variant={module[kind] ?? null}
              facade={facade}
              onVariant={(variant) => {
                const { [kind]: _old, ...rest } = module;
                facade.onModule(variant ? { ...rest, [kind]: variant } : rest);
              }}
            />
          ))}
        </>
      )}
      {module && !asset && (
        <p className="sgl-designer-warning" role="note">
          ⚠ This façade is no longer in the project; nothing is drawn for it.
        </p>
      )}
      {facade.fit && (
        <p className="sgl-designer-warning" role="note">
          ⚠ {facade.fit}
        </p>
      )}
    </section>
  );
}

/** `value` with `flip` set (true) or removed (false). */
function withFlip<T extends { readonly flip?: true | undefined }>(value: T, flip: boolean): T {
  const { flip: _flip, ...rest } = value;
  return (flip ? { ...rest, flip: true as const } : rest) as T;
}

/** Which side of the Rhino model faces outside: −Y (Front view, default) or +Y. */
function OutsideControl({ idBase, flip, onFlip }: { readonly idBase: string; readonly flip: boolean; readonly onFlip: (flip: boolean) => void }) {
  return (
    <div className="sgl-designer-stacked">
      <span className="sgl-designer-label" id={`${idBase}-outward`} title="Which side of the Rhino model faces outside">
        Outside
      </span>
      <div className="sgl-segmented sgl-segmented-sm" role="radiogroup" aria-labelledby={`${idBase}-outward`}>
        {([false, true] as const).map((value) => (
          <label key={String(value)} className={flip === value ? 'checked' : undefined} title={value ? "The model's +Y side faces outside (Rhino Back view)" : "The model's −Y side faces outside (Rhino Front view)"}>
            <input type="radio" name={`${idBase}-outward`} checked={flip === value} onChange={() => onFlip(value)} />
            {value ? '+Y' : '−Y'}
          </label>
        ))}
      </div>
    </div>
  );
}

const VARIANT_LABELS: Readonly<Record<FacadeVariantKind, string>> = { door: 'Door bay', open: 'Open bay' };
const VARIANT_HELP: Readonly<Record<FacadeVariantKind, string>> = {
  door: 'Optional module for façade bays with a door (where an open-air connector meets the room). Automatic: the built-in glass door.',
  open: 'Optional module for façade bays with an Open relationship (where an open-air connector meets the room). Automatic: the built-in open side.',
};

/** Optional Door / Open bay module: menu (Automatic or an imported façade) and Import .3dm… on one row, then Outside. */
function VariantField({
  idBase,
  kind,
  variant,
  facade,
  onVariant,
}: {
  readonly idBase: string;
  readonly kind: FacadeVariantKind;
  readonly variant: FacadeVariant | null;
  readonly facade: TypeRowFacade;
  readonly onVariant: (variant: FacadeVariant | null) => void;
}) {
  const assets = facade.library.assets;
  const asset = variant ? facade.assetById.get(variant.assetId) : undefined;
  const missing = variant !== null && !asset;
  const [materials, setMaterials] = useState(false);
  const use = (assetId: string) => onVariant(assetId === '' ? null : { ...(variant ?? {}), assetId });
  return (
    <div className="sgl-designer-variant">
      <span className="sgl-designer-label" id={`${idBase}-label`} title={VARIANT_HELP[kind]}>
        {VARIANT_LABELS[kind]} <small>(optional)</small>
      </span>
      <FacadeImport idBase={idBase} facades={facade.library} onImported={(imported) => use(imported.id)}>
        <select
          className="sgl-designer-facade-select"
          aria-labelledby={`${idBase}-label`}
          title={VARIANT_HELP[kind]}
          value={variant ? variant.assetId : ''}
          onChange={(e) => use(e.currentTarget.value)}
        >
          <option value="">Automatic</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
          {missing && <option value={variant.assetId}>Missing façade</option>}
        </select>
        {asset && (
          <button
            type="button"
            className="sgl-designer-materials-button"
            onClick={() => setMaterials(true)}
            title={`Solid, glass or open, and the colour, of each part when used as the ${VARIANT_LABELS[kind]}`}
          >
            Materials…
          </button>
        )}
      </FacadeImport>
      {variant && <OutsideControl idBase={idBase} flip={!!variant.flip} onFlip={(flip) => onVariant(withFlip(variant, flip))} />}
      {materials && asset && <FacadeMaterialsDialog asset={asset} facades={facade.library} role={kind} onClose={() => setMaterials(false)} />}
      {missing && (
        <p className="sgl-designer-warning" role="note">
          ⚠ This façade is no longer in the project; the automatic {kind === 'door' ? 'door' : 'open side'} is drawn.
        </p>
      )}
    </div>
  );
}

/**
 * One function's card. Collapsed by default: the header (a disclosure button) shows the function,
 * a one-line summary of its rules, a warning mark and a small façade preview; the controls stay
 * mounted while collapsed, so drafts survive.
 */
function TypeRow({ row, onWindow, onInvalid, onLayout, onMode, onRoof, onReset, facade }: TypeRowProps) {
  // Collapsed by default; the user's open/closed choice per function sticks (this browser).
  const [open, toggleOpen] = useRememberedOpen(`designer-function:${row.typeId}`, false);
  const enclosed = row.effective.walls === 'enclosed';
  const storedMode: FacadeMode = !enclosed ? 'open' : facade && row.effective.facade ? 'import' : 'automatic';
  // Import chosen but no façade yet: shown here only (nothing is stored until one is chosen or imported).
  const [pendingImport, setPendingImport] = useState(false);
  useEffect(() => {
    if (storedMode !== 'automatic') setPendingImport(false);
  }, [storedMode]);
  const mode: FacadeMode = storedMode === 'automatic' && pendingImport ? 'import' : storedMode;
  const chooseMode = (next: FacadeMode) => {
    if (next === 'import') {
      if (storedMode !== 'import') {
        // Without a module the walls stay as they are until a façade is chosen or imported.
        if (storedMode === 'open') onMode('automatic');
        setPendingImport(true);
      }
      return;
    }
    setPendingImport(false);
    onMode(next);
  };
  const effectivePercent = formatPercent(row.effective.windowFraction);
  // Drafts while dragging/typing; a command is sent only on release, Enter or blur.
  const [slider, setSlider] = useState<number | null>(null);
  const [text, setText] = useState(effectivePercent);
  useEffect(() => setText(effectivePercent), [effectivePercent]);

  const shownFraction = slider ?? row.effective.windowFraction;
  const idBase = `sgl-designer-${row.typeId}`;
  const inherited = row.effective.source.windowFraction === 'project';
  const defaultText =
    row.projectDefault.source === 'broken'
      ? 'invalid definition'
      : `${formatPercent(row.projectDefault.windowFraction)} %${row.projectDefault.source === 'fallback' ? ', fallback' : ''}`;

  const commitSlider = () => {
    if (slider === null) return;
    setSlider(null);
    onWindow(slider);
  };
  const commitText = () => {
    if (text.trim() === effectivePercent) return;
    const parsed = parseWindowPercent(text);
    if (!parsed.ok) {
      onInvalid(parsed.message);
      setText(effectivePercent);
      return;
    }
    onWindow(parsed.fraction);
  };
  const onTextKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') commitText();
    else if (event.key === 'Escape') setText(effectivePercent);
  };

  return (
    <article className={`sgl-designer-type${row.warning ? ' sgl-designer-type--warn' : ''}`} aria-labelledby={`${idBase}-name`}>
      <h4 className="sgl-designer-type-title">
        <button
          type="button"
          className="sgl-designer-type-head"
          aria-expanded={open}
          aria-controls={`${idBase}-body`}
          onClick={toggleOpen}
        >
          <svg className="sgl-designer-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="sgl-designer-swatch" style={{ background: typeColor(row.typeId) }} aria-hidden="true" />
          <span className="sgl-designer-type-text">
            <span id={`${idBase}-name`} className="sgl-designer-type-name">
              {row.name}
            </span>
            <span className="sgl-designer-summary">
              {storedMode === 'open'
                ? 'Open sides'
                : storedMode === 'import' && row.effective.facade
                  ? `${facade?.assetById.get(row.effective.facade.assetId)?.name ?? 'missing façade'} (${FACADE_PLACEMENT_LABELS[row.effective.facade.placement]})${FACADE_VARIANTS.filter((k) => row.effective.facade?.[k])
                      .map((k) => ` + ${k}`)
                      .join('')}`
                  : `${formatPercent(shownFraction)} % · ${WINDOW_LAYOUT_LABELS[row.effective.windowLayout]}`}{' '}
              ·{' '}
              {SHORT_ROOF[row.effective.roof]} ·{' '}
              {row.nodeCount} {row.nodeCount === 1 ? 'room' : 'rooms'}
              {row.hasOverride ? ' · changed' : ''}
            </span>
          </span>
          {row.warning && (
            <span className="sgl-designer-warn-mark" role="img" aria-label="Has a warning" title={row.warning}>
              ⚠
            </span>
          )}
          <FacadePreview fraction={shownFraction} layout={row.effective.windowLayout} roof={row.effective.roof} walls={row.effective.walls} />
        </button>
      </h4>

      <div id={`${idBase}-body`} className="sgl-designer-type-body" hidden={!open}>

      {row.warning && (
        <p className="sgl-designer-warning" role="note">
          ⚠ {row.warning}
        </p>
      )}

      <Subsection idBase={idBase} name="facade" title="Façade" rememberId={`designer-function:${row.typeId}:facade`}>
      <div className="sgl-designer-field sgl-designer-layout sgl-designer-mode">
        <span className="sgl-designer-label" id={`${idBase}-mode`} title="How the exterior walls of this function are made">
          Geometry
        </span>
        <div className="sgl-segmented sgl-segmented-sm" role="radiogroup" aria-labelledby={`${idBase}-mode`}>
          {FACADE_MODES.map((m) => (
            <label key={m} className={mode === m ? 'checked' : undefined} title={FACADE_MODE_HELP[m]}>
              <input type="radio" name={`${idBase}-mode`} value={m} checked={mode === m} disabled={m === 'import' && !facade} onChange={() => chooseMode(m)} />
              {FACADE_MODE_LABELS[m]}
            </label>
          ))}
        </div>
      </div>

      {mode === 'automatic' ? (
      <>
      <div className="sgl-designer-field">
        <label htmlFor={`${idBase}-window`} title="Share of each exterior wall that is glazed. Interior walls are not affected.">
          Windows <small>(exterior walls)</small>
        </label>
        <input
          id={`${idBase}-window`}
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(shownFraction * 100)}
          aria-valuetext={`${formatPercent(shownFraction)} %`}
          onChange={(e) => setSlider(Number(e.currentTarget.value) / 100)}
          onPointerUp={commitSlider}
          onKeyUp={commitSlider}
          onBlur={commitSlider}
        />
        <span className="sgl-designer-percent">
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${row.name} window coverage in percent`}
            value={slider === null ? text : formatPercent(slider)}
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={onTextKey}
            onBlur={commitText}
          />
          %
        </span>
      </div>
      <p className="sgl-designer-source">
        {inherited ? `Uses the project default (${defaultText})` : `Changed from the project default (${defaultText})`}
      </p>

      <div className="sgl-designer-field sgl-designer-layout">
        <span className="sgl-designer-label" id={`${idBase}-layout`} title="How the windows are placed along each exterior wall">
          Layout
        </span>
        <div className="sgl-segmented sgl-segmented-sm" role="radiogroup" aria-labelledby={`${idBase}-layout`}>
          {WINDOW_LAYOUTS.map((layout) => (
            <label
              key={layout}
              className={row.effective.windowLayout === layout ? 'checked' : undefined}
              title={layout === 'repeat' ? 'One window per bay, repeated along the wall' : 'One single window over the whole façade of each room'}
            >
              <input
                type="radio"
                name={`${idBase}-layout`}
                value={layout}
                checked={row.effective.windowLayout === layout}
                onChange={() => onLayout(layout)}
              />
              {WINDOW_LAYOUT_LABELS[layout]}
            </label>
          ))}
        </div>
      </div>
      </>
      ) : mode === 'import' ? (
        facade && <ImportField idBase={idBase} facade={facade} />
      ) : (
        <p className="sgl-designer-source">
          No exterior walls or windows{row.effective.roof === 'none' ? '' : '; slim posts carry the roof'}. Walls shared with other rooms stay.
        </p>
      )}
      </Subsection>

      <Subsection idBase={idBase} name="roof" title="Roof" rememberId={`designer-function:${row.typeId}:roof`}>

      <div className="sgl-designer-field">
        <label htmlFor={`${idBase}-roof`} title="Roof on the exposed tops of rooms of this type. Pitched roofs are not available yet.">
          Style
        </label>
        <select id={`${idBase}-roof`} value={row.effective.roof} onChange={(e) => onRoof(e.currentTarget.value)}>
          {ROOF_STYLES.map((roof) => (
            <option key={roof} value={roof}>
              {ROOF_LABELS[roof]}
            </option>
          ))}
        </select>
        <span className="sgl-designer-source">{row.effective.source.roof === 'design' ? 'Changed for this design' : 'Uses the default'}</span>
      </div>
      </Subsection>

      <button type="button" className="sgl-designer-reset" disabled={!row.hasOverride} onClick={onReset}>
        Reset to project default
      </button>
      </div>
    </article>
  );
}

/**
 * A collapsible subsection of a function card (Façade, Roof). Open until the user collapses it;
 * the choice sticks per function and subsection (this browser). The body stays mounted.
 */
function Subsection({ idBase, name, title, rememberId, children }: { readonly idBase: string; readonly name: string; readonly title: string; readonly rememberId: string; readonly children: ReactNode }) {
  const [open, toggle] = useRememberedOpen(rememberId, true);
  const headId = `${idBase}-${name}-head`;
  const bodyId = `${idBase}-${name}-body`;
  return (
    <section className="sgl-designer-subsection" aria-labelledby={headId}>
      <h5 className="sgl-designer-subsection-title">
        <button type="button" id={headId} className="sgl-designer-subsection-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <svg className="sgl-designer-chevron" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {title}
        </button>
      </h5>
      <div id={bodyId} className="sgl-designer-subsection-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

const SHORT_ROOF: Readonly<Record<string, string>> ={ flat: 'Flat roof', pergola: 'Pergola', none: 'No roof' };

/**
 * Schematic exterior façade of two bays: `fraction` of the wall area glazed, as one window per bay
 * (Repeat) or one window over the whole façade (Stretch); open sides show only posts and a floor.
 * The roof is a bar (flat), a row of slats (pergola) or nothing.
 */
function FacadePreview({ fraction, layout, roof, walls }: { fraction: number; layout: string; roof: string; walls: string }) {
  const f = Math.min(1, Math.max(0, fraction));
  const bay = 18;
  const side = Math.sqrt(f) * bay;
  const sw = Math.sqrt(f) * 36;
  const sh = Math.sqrt(f) * 21;
  return (
    <svg className="sgl-designer-preview" viewBox="0 0 38 26" width={38} height={26} aria-hidden="true">
      {roof === 'flat' && <rect x={0} y={0} width={38} height={3} className="sgl-designer-preview-roof" />}
      {roof === 'pergola' && [0, 7, 14, 21, 28, 35].map((x) => <rect key={x} x={x} y={0} width={3} height={3} className="sgl-designer-preview-roof" />)}
      {walls === 'open' ? (
        <>
          {roof !== 'none' && [1, 18, 35].map((x) => <rect key={x} x={x} y={3} width={2} height={22} className="sgl-designer-preview-roof" />)}
          <rect x={0} y={24} width={38} height={2} className="sgl-designer-preview-roof" />
        </>
      ) : (
      <>
      <rect x={1} y={4} width={36} height={21} className="sgl-designer-preview-wall" />
      {f > 0 &&
        (layout === 'stretch' ? (
          <rect x={19 - sw / 2} y={14.5 - sh / 2} width={sw} height={sh} className="sgl-designer-preview-glass" />
        ) : (
          [10, 28].map((cx) => <rect key={cx} x={cx - side / 2} y={14.5 - side / 2} width={side} height={side} className="sgl-designer-preview-glass" />)
        ))}
      </>
      )}
    </svg>
  );
}
