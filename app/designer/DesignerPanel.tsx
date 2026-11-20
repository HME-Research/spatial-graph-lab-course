import { CollapsibleSection, useRememberedOpen } from '@app/ui';
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { sameRooms, useRoomHighlight, useSetRoomHighlight } from '@app/views/roomHighlight';
import { styleValuesFor, useStyleValues } from '@app/views/styleValues';
import { useEnabledMetrics } from '@app/views/three/enabledMetrics';
import { EMPTY_ATTRIBUTE_SCHEMA } from '@app/extensions';
import { buildingFacesV2, exampleFacadeProvider } from '@app/building';
import { designUsesFacadeModules, facadeAssetIdsOf, layoutFacadeModules, type FacadeAssetV1 } from '@app/assets';
import { CORRIDOR_WIDTH_STEP, FACADE_VARIANTS, formatCorridorWidth, MAX_CORRIDOR_WIDTH, ROOF_STYLES, WALL_STYLES, WINDOW_LAYOUTS, type FacadeModule, type FacadeVariant, type FacadeVariantKind } from '@app/document';
import type { DesignPort } from '@app/spatial';
import type { ProjectViewContext } from '@app/views/project';
import { typeColor } from '@core/viewer/appearance';
import type { Selection } from '@core/viewer/selection';
import {
  addCardEdit,
  addNoun,
  bandDividersEdit,
  corridorCard,
  type CorridorCardRow,
  resetCorridorsEdit,
  setCorridorRoofEdit,
  setCorridorWallsEdit,
  setCorridorWidthEdit,
  WALL_LABELS,
  designerCards,
  removeCardEdit,
  styleAttributeName,
  styleAttributeOf,
  styleAttributes,
  styleByEdit,
  styleModeEdit,
  type StyleAttribute,
  type DesignerCards,
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
  type DesignerCardRow,
} from './designerModel';
import { DesignerGuideButton } from './DesignerGuide';
import { BandsEditor } from './BandsEditor';
import { FacadeAssetDetails, FacadeImport, FacadeLibraryFooter, PlacementControl, type DesignerFacades } from './FacadeLibraryPanel';
import { FacadeMaterialsDialog } from './FacadeMaterialsDialog';
import './designer.css';

/**
 * Designer panel (06-designer): per-design, per-node-type window coverage and roof.
 *
 * Reads the v2 document from `design.doc` and changes it ONLY through `design.onCommand` with the
 * `set-look` command (and `set-corridors` for the Corridors card): one committed change
 * (slider release, Enter, blur, roof choice, reset) = one command = one history step. Without a v2 port (before integration) it
 * shows a notice instead of controls.
 */
export interface DesignerPanelProps {
  /** Schema-v2 port (ViewProps.design). Absent: the panel explains that it is unavailable. */
  readonly design?: DesignPort;
  /** Active project (ViewProps.project): registered types and their project façade defaults. */
  readonly project?: ProjectViewContext;
  /** Unused since the Defaults section was removed (2026-11-17); kept so callers stay valid. */
  readonly selection?: Selection;
  /** Unused since the Defaults section was removed (2026-11-17); one relationship's corridor is in Properties. */
  readonly onShowRelationship?: (edgeId: number) => void;
  /** The project's imported façades (3DM). Absent: the imported-façade controls are not shown. */
  readonly facades?: DesignerFacades;
}

const NO_ASSETS: readonly FacadeAssetV1[] = [];


/** Highlight keys the Designer owns (other features may light rooms with their own keys). */
const HIGHLIGHT_PREFIX = 'designer:';

export function DesignerPanel({ design, project, facades }: DesignerPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const doc = design?.doc;
  const activeProject = project?.project ?? null;
  const facade = project?.facade ?? exampleFacadeProvider;
  const spatial = design?.spatial;
  // "Style rooms by" (S3): the project's attributes and the measured values shown in Attributes.
  const schema = project?.attributes ?? EMPTY_ATTRIBUTE_SCHEMA;
  const shownMetrics = useEnabledMetrics();
  const styleBy = doc?.settings.styleBy ?? 'function';
  const attribute = useMemo(() => styleAttributeOf(styleBy, schema, shownMetrics), [styleBy, schema, shownMetrics]);
  const attributes = useMemo(() => styleAttributes(schema, shownMetrics, styleBy), [schema, shownMetrics, styleBy]);
  const values = useStyleValues(doc, spatial, schema);
  const cards = useMemo(() => (doc ? designerCards(doc, activeProject, facade, values, attribute) : null), [doc, activeProject, facade, values, attribute]);
  const assets = facades?.assets ?? NO_ASSETS;
  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a] as const)), [assets]);
  // Where the modules land (for fit warnings): only computed when the design uses imported façades.
  const modules = useMemo(() => {
    if (!doc || !spatial || !designUsesFacadeModules(doc)) return [];
    const sizeOf = (id: string) => {
      const a = assetById.get(id);
      return a ? { width: a.size[0], height: a.size[1], depth: a.size[2] } : null;
    };
    const built = buildingFacesV2(doc, spatial, facade, values);
    return layoutFacadeModules(built.faces, built.looks, sizeOf).instances;
  }, [doc, spatial, facade, assetById, values]);
  const usedHere = useMemo(() => new Set(doc ? facadeAssetIdsOf(doc) : []), [doc]);

  // Highlight button: the lit card follows the design (rooms move between cards as they change);
  // a card that no longer exists switches the highlight off.
  const highlight = useRoomHighlight();
  const setHighlight = useSetRoomHighlight();
  useEffect(() => {
    if (!highlight || !setHighlight || !cards || !highlight.key.startsWith(HIGHLIGHT_PREFIX)) return;
    const card = [cards.defaultCard, ...cards.cards].find((c) => highlightKey(cards, c) === highlight.key);
    if (!card) {
      setHighlight(null);
      return;
    }
    const nodeIds = new Set(card.nodeIds);
    if (!sameRooms(nodeIds, highlight.nodeIds)) setHighlight({ key: highlight.key, nodeIds });
  }, [cards, highlight, setHighlight]);

  if (!design || !doc || !cards) {
    return (
      <div className="sgl-designer" aria-label="Designer">
        <p className="sgl-designer-notice">
          Open a project to style its rooms.
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

  const renderCard = (row: DesignerCardRow) => {
    const key = highlightKey(cards, row);
    const lit = highlight?.key === key;
    return (
      <li key={row.key}>
        <CardRow
          row={row}
          onWindow={(fraction) =>
            send(setWindowFractionEdit(doc, row.target, fraction, row.function !== null ? facade(row.function).windowFraction : row.inheritedWindowFraction))
          }
          onInvalid={setError}
          onLayout={(layout) => send(setWindowLayoutEdit(doc, row.target, layout))}
          onMode={(mode) => send(setFacadeModeEdit(doc, row.target, mode))}
          onRoof={(roof) => send(setRoofEdit(doc, row.target, roof))}
          onReset={() => send(resetTypeEdit(doc, row.target))}
          {...(row.removable && { onRemove: () => send(removeCardEdit(doc, row.target)) })}
          {...(setHighlight && {
            highlighted: lit,
            onHighlight: () => setHighlight(lit ? null : { key, nodeIds: new Set(row.nodeIds) }),
          })}
          {...(facades && {
            facade: {
              module: row.effective.walls === 'enclosed' ? row.effective.facade : null,
              library: facades,
              assetById,
              fit: distortionMessage(modules, new Set(row.nodeIds)),
              onModule: (module) => send(setFacadeModeEdit(doc, row.target, 'import', module, assetById.get(module.assetId)?.name)),
            },
          })}
        />
      </li>
    );
  };

  const chooseStyleBy = (by: string) => {
    const next = attributes.find((a) => a.by === by);
    if (!next || by === cards.by) return;
    // A number that is new to the design starts with bands suggested from its values.
    send(styleByEdit(doc, next, spatial ? styleValuesFor(doc, spatial, by, schema) : undefined));
  };
  const groups: readonly { readonly key: StyleAttribute['group']; readonly label: string }[] = [
    { key: 'room', label: 'Room' },
    { key: 'attributes', label: 'Your attributes' },
    { key: 'measured', label: 'Measured' },
  ];
  const isNumber = cards.attribute.kind === 'number';
  const bands = cards.mode === 'bands';
  const noun = addNoun(cards.attribute);
  return (
    <div className="sgl-designer" aria-label="Building Designer">
      <div className="sgl-designer-intro">
        <p className="sgl-help">
          Choose what the rooms are styled by, then give each card a look. Rooms without a card of their own use Default. Colours and lighting are in
          Display.
        </p>
        <DesignerGuideButton />
      </div>

      {error && (
        <p className="sgl-designer-error" role="alert">
          {error}
        </p>
      )}

      <div className="sgl-designer-field sgl-designer-styleby">
        <label htmlFor="sgl-designer-style-by" title="The one attribute that decides each room's look">
          Style rooms by
        </label>
        <select id="sgl-designer-style-by" value={cards.by} onChange={(e) => chooseStyleBy(e.currentTarget.value)}>
          {groups.map((g) => {
            const items = attributes.filter((a) => a.group === g.key);
            return (
              items.length > 0 && (
                <optgroup key={g.key} label={g.label}>
                  {items.map((a) => (
                    <option key={a.by} value={a.by}>
                      {styleAttributeName(a)}
                    </option>
                  ))}
                </optgroup>
              )
            );
          })}
        </select>
      </div>
      {cards.attribute.status === 'removed' && (
        <p className="sgl-designer-warning" role="note">
          ⚠ This attribute is no longer in Attributes, so every room uses Default. Its cards are kept: add the attribute back, or choose another one.
        </p>
      )}
      {cards.attribute.status === 'hidden' && (
        <p className="sgl-designer-source">
          {cards.attribute.label} is not shown in Attributes, but the rooms are still styled by it.
        </p>
      )}
      {isNumber && (
        <div className="sgl-designer-field sgl-designer-layout sgl-designer-stylemode">
          <span className="sgl-designer-label" id="sgl-designer-style-mode" title="A card for each value, or a card for each range of values">
            Cards
          </span>
          <div className="sgl-segmented sgl-segmented-sm" role="radiogroup" aria-labelledby="sgl-designer-style-mode">
            {(['values', 'bands'] as const).map((m) => (
              <label key={m} className={cards.mode === m ? 'checked' : undefined} title={m === 'values' ? 'One card for each value the rooms have' : 'One card for each range of values'}>
                <input
                  type="radio"
                  name="sgl-designer-style-mode"
                  value={m}
                  checked={cards.mode === m}
                  onChange={() => send(styleModeEdit(doc, cards.attribute, m, values))}
                />
                {m === 'values' ? 'One card per value' : 'Bands'}
              </label>
            ))}
          </div>
        </div>
      )}

      <CollapsibleSection title={`Looks by ${cards.byLabel}`} sectionId="designer-functions" defaultOpen meta={String(cards.cards.length + 1)}>
        {bands && cards.dividers && (
          <BandsEditor
            idBase="sgl-designer-bands"
            attribute={cards.attribute}
            dividers={cards.dividers}
            numbers={cards.numbers}
            onCommit={(dividers) => send(bandDividersEdit(doc, cards.attribute, dividers))}
            onInvalid={setError}
          />
        )}
        <ul className="sgl-designer-list">
          {renderCard(cards.defaultCard)}
          {cards.cards.map(renderCard)}
          <li key="corridors">
            <CorridorCard
              card={corridorCard(doc, spatial)}
              onWalls={(walls) => send(setCorridorWallsEdit(doc, walls))}
              onRoof={(roof) => send(setCorridorRoofEdit(doc, roof))}
              onWidth={(text) => send(setCorridorWidthEdit(doc, text))}
              onReset={() => send(resetCorridorsEdit(doc))}
            />
          </li>
        </ul>
        {cards.missingCount > 0 && cards.attribute.status !== 'removed' && (
          <p className="sgl-designer-source">
            {cards.missingCount} {cards.missingCount === 1 ? 'room has' : 'rooms have'} no {cards.byLabel} value and {cards.missingCount === 1 ? 'uses' : 'use'} Default.
          </p>
        )}
        {!bands && cards.cards.length === 0 && cards.attribute.status !== 'removed' && (
          <p className="sgl-designer-notice">Every room uses Default. Add a {noun} below to give its rooms their own look.</p>
        )}
        {!bands && cards.attribute.status !== 'removed' && cards.attribute.kind === 'text' && (
          <TextValueAdd label={cards.byLabel} suggestions={cards.addable} onAdd={(value) => send(addCardEdit(doc, cards.by, value))} />
        )}
        {!bands && cards.attribute.status !== 'removed' && cards.attribute.kind !== 'text' && cards.addable.length > 0 && (
          <AddCardMenu noun={noun} cards={cards} onAdd={(option) => send(addCardEdit(doc, cards.by, option.value, option.label))} />
        )}
        {facades && <FacadeLibraryFooter facades={facades} usedHere={usedHere} />}
      </CollapsibleSection>
    </div>
  );
}

/** A field whose source tag ("Set here", "Built-in default", "Uses Default") sits on the label row, so it never wraps alone under the control. */
function SourcedField({ labelId, htmlFor, label, title, source, children }: {
  readonly labelId?: string;
  readonly htmlFor?: string;
  readonly label: string;
  readonly title: string;
  readonly source: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="sgl-designer-field sgl-designer-sourced">
      <div className="sgl-designer-sourced-head">
        {htmlFor ? (
          <label htmlFor={htmlFor} title={title}>
            {label}
          </label>
        ) : (
          <span className="sgl-designer-label" id={labelId} title={title}>
            {label}
          </span>
        )}
        <span className="sgl-designer-source">{source}</span>
      </div>
      {children}
    </div>
  );
}

/** Roof style select of a card (rooms and corridors): Flat / Pergola (open slats) / None (open top). */
function RoofField({ id, title, roof, source, onRoof }: { readonly id: string; readonly title: string; readonly roof: string; readonly source: string; readonly onRoof: (roof: string) => void }) {
  return (
    <SourcedField htmlFor={id} label="Style" title={title} source={source}>
      <select id={id} value={roof} onChange={(e) => onRoof(e.currentTarget.value)}>
        {ROOF_STYLES.map((r) => (
          <option key={r} value={r}>
            {ROOF_LABELS[r]}
          </option>
        ))}
      </select>
    </SourcedField>
  );
}

/**
 * A corridor width in metres (the Corridors card): a number box committed on Enter or when leaving
 * it (one command), Esc restores the value in effect; empty text clears the card's own value.
 */
function CorridorWidthInput({ id, width, label, onCommit }: { readonly id: string; readonly width: number; readonly label: string; readonly onCommit: (text: string) => void }) {
  const shown = String(Number(width.toFixed(2)));
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    if (text.trim() === shown) return;
    onCommit(text);
    setText(shown);
  };
  return (
    <span className="sgl-designer-percent sgl-designer-width">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={CORRIDOR_WIDTH_STEP}
        max={MAX_CORRIDOR_WIDTH}
        step={CORRIDOR_WIDTH_STEP}
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setText(shown);
        }}
        onBlur={commit}
      />
      m
    </span>
  );
}

const CORRIDOR_WALL_HELP: Readonly<Record<string, string>> = {
  enclosed: 'A side wall on each side; the ends open into the rooms',
  open: 'Open sides; slim posts carry the roof',
};

/**
 * The Corridors card (owner 2026-11-19, "Corridors as a look card"): built like a room card, after
 * the room cards whatever "Style rooms by" is (corridors are not grouped by room values). Walls
 * (Enclosed / Open) and Roof (Flat / Pergola / None) of every generated corridor; windows and
 * imported façades do not apply to corridors. One relationship can still set its own in Properties.
 */
function CorridorCard({
  card,
  onWalls,
  onRoof,
  onWidth,
  onReset,
}: {
  readonly card: CorridorCardRow;
  readonly onWalls: (walls: string) => void;
  readonly onRoof: (roof: string) => void;
  readonly onWidth: (text: string) => void;
  readonly onReset: () => void;
}) {
  const [open, toggleOpen] = useRememberedOpen('designer-card:corridors', false);
  const idBase = 'sgl-designer-corridors';
  const { effective, setHere, overrideCount, corridorCount } = card;
  const source = (here: boolean) => (here ? 'Set here' : 'Built-in default');
  return (
    <article className="sgl-designer-type sgl-designer-corridors" data-card="corridors" aria-labelledby={`${idBase}-name`}>
      <div className="sgl-designer-type-titlebar">
        <h4 className="sgl-designer-type-title">
          <button type="button" className="sgl-designer-type-head" aria-expanded={open} aria-controls={`${idBase}-body`} onClick={toggleOpen}>
            <svg className="sgl-designer-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sgl-designer-swatch sgl-designer-swatch--corridor" aria-hidden="true" />
            <span className="sgl-designer-type-text">
              <span id={`${idBase}-name`} className="sgl-designer-type-name">
                Corridors (generated)
              </span>
              <span className="sgl-designer-summary">
                {effective.walls === 'open' ? 'Open sides' : 'Enclosed'} · {SHORT_ROOF[effective.roof]} · {formatCorridorWidth(effective.width)}
                {corridorCount !== null ? ` · ${corridorCount} ${corridorCount === 1 ? 'corridor' : 'corridors'}` : ''}
                {card.hasOverride ? ' · changed' : ''}
              </span>
            </span>
            <FacadePreview fraction={0} layout="repeat" roof={effective.roof} walls={effective.walls} />
          </button>
        </h4>
      </div>

      <div id={`${idBase}-body`} className="sgl-designer-type-body" hidden={!open}>
        <p className="sgl-help">Corridors are built automatically between related rooms that don't touch.</p>

        <Subsection idBase={idBase} name="walls" title="Walls" rememberId="designer-card:corridors:walls">
          <SourcedField labelId={`${idBase}-walls`} label="Sides" title="Whether every generated corridor has a side wall on each side" source={source(setHere.walls)}>
            <div className="sgl-segmented sgl-segmented-sm" role="radiogroup" aria-labelledby={`${idBase}-walls`}>
              {WALL_STYLES.map((w) => (
                <label key={w} className={effective.walls === w ? 'checked' : undefined} title={CORRIDOR_WALL_HELP[w]}>
                  <input type="radio" name={`${idBase}-walls`} value={w} checked={effective.walls === w} onChange={() => onWalls(w)} />
                  {WALL_LABELS[w]}
                </label>
              ))}
            </div>
          </SourcedField>
          <p className="sgl-designer-source">
            {effective.walls === 'enclosed'
              ? effective.roof === 'none'
                ? 'Side walls, open to the sky.'
                : `${CORRIDOR_WALL_HELP.enclosed}.`
              : effective.roof === 'none'
                ? 'Open sides and no roof: just the floor (no posts).'
                : `${CORRIDOR_WALL_HELP.open}.`}
          </p>
        </Subsection>

        <Subsection idBase={idBase} name="roof" title="Roof" rememberId="designer-card:corridors:roof">
          <RoofField id={`${idBase}-roof`} title="Roof of every generated corridor" roof={effective.roof} source={source(setHere.roof)} onRoof={onRoof} />
        </Subsection>

        <Subsection idBase={idBase} name="width" title="Width" rememberId="designer-card:corridors:width">
          <SourcedField htmlFor={`${idBase}-width`} label="Width" title="Built width of every generated corridor, in metres" source={source(setHere.width)}>
            <CorridorWidthInput id={`${idBase}-width`} width={effective.width} label="Corridor width in metres" onCommit={onWidth} />
          </SourcedField>
          <p className="sgl-designer-source">
            Built width, centred in the corridor's cells: more than 0 and at most one cell ({formatCorridorWidth(MAX_CORRIDOR_WIDTH)}). The corridor still takes its whole cells.
            Empty the box to use the built-in default again.
          </p>
        </Subsection>

        <p className="sgl-designer-source">
          {overrideCount > 0
            ? `${overrideCount} ${overrideCount === 1 ? 'relationship sets its' : 'relationships set their'} own walls, roof or width in Properties.`
            : 'One relationship can set its own walls, roof or width in Properties.'}
        </p>
        <div className="sgl-designer-card-actions">
          <button type="button" className="sgl-designer-reset" disabled={!card.hasOverride} onClick={onReset}>
            Reset Corridors
          </button>
        </div>
      </div>
    </article>
  );
}

interface CardRowProps {
  readonly row: DesignerCardRow;
  readonly onWindow: (fraction: number) => void;
  readonly onInvalid: (message: string) => void;
  readonly onLayout: (layout: string) => void;
  readonly onMode: (mode: FacadeMode) => void;
  readonly onRoof: (roof: string) => void;
  /** Clear what the card sets. */
  readonly onReset: () => void;
  /** Value cards only: remove the card (its rooms use Default again). */
  readonly onRemove?: () => void;
  /** The highlight button (absent without a view that can show it). */
  readonly highlighted?: boolean;
  readonly onHighlight?: () => void;
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
function CardRow({ row, onWindow, onInvalid, onLayout, onMode, onRoof, onReset, onRemove, highlighted, onHighlight, facade }: CardRowProps) {
  // Collapsed by default; the user's open/closed choice per card sticks (this browser).
  const rememberBase = row.function !== null ? `designer-function:${row.function}` : `designer-card:${row.target.by}:${row.key}`;
  const [open, toggleOpen] = useRememberedOpen(rememberBase, false);
  const isDefault = row.target.group.kind === 'default';
  /** The card itself sets this field (for Default: Default sets it). */
  const setHere = (source: string) => source === (isDefault ? 'default' : 'card');
  const nodeCount = row.nodeIds.length;
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
  const idBase = row.function !== null ? `sgl-designer-${row.function}` : `sgl-designer--${row.key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const inherited = !setHere(row.effective.source.windowFraction);

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
      <div className="sgl-designer-type-titlebar">
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
          <span
            className={`sgl-designer-swatch${row.function === null ? ' sgl-designer-swatch--default' : ''}`}
            style={row.function !== null ? { background: typeColor(row.function) } : undefined}
            aria-hidden="true"
          />
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
              {nodeCount} {nodeCount === 1 ? 'room' : 'rooms'}
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
      {onHighlight && (
        <button
          type="button"
          className="sgl-designer-highlight"
          aria-pressed={highlighted === true}
          aria-label={`Highlight the rooms of ${row.name}`}
          title={nodeCount === 0 ? 'No room uses this card' : highlighted ? 'Stop highlighting these rooms' : 'Highlight these rooms in the Building and the Plan'}
          disabled={nodeCount === 0 && !highlighted}
          onClick={onHighlight}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M1 8s2.6-5 7-5 7 5 7 5-2.6 5-7 5-7-5-7-5Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="2.2" fill="currentColor" />
          </svg>
        </button>
      )}
      </div>

      <div id={`${idBase}-body`} className="sgl-designer-type-body" hidden={!open}>

      {row.warning && (
        <p className="sgl-designer-warning" role="note">
          ⚠ {row.warning}
        </p>
      )}

      <Subsection idBase={idBase} name="facade" title="Façade" rememberId={`${rememberBase}:facade`}>
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
        {inherited ? `Uses ${row.inheritedWindowText}` : `Set here (otherwise ${row.inheritedWindowText})`}
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

      <Subsection idBase={idBase} name="roof" title="Roof" rememberId={`${rememberBase}:roof`}>

      <RoofField
        id={`${idBase}-roof`}
        title="Roof on the exposed tops of rooms of this type. Pitched roofs are not available yet."
        roof={row.effective.roof}
        source={setHere(row.effective.source.roof) ? 'Set here' : isDefault ? 'Built-in default' : 'Uses Default'}
        onRoof={onRoof}
      />
      </Subsection>

      <div className="sgl-designer-card-actions">
        <button type="button" className="sgl-designer-reset" disabled={!row.hasOverride} onClick={onReset}>
          {isDefault ? 'Reset Default' : 'Clear this card'}
        </button>
        {onRemove && (
          <button type="button" className="sgl-designer-remove" onClick={onRemove} title="Remove the card: its rooms use Default again">
            Remove card
          </button>
        )}
      </div>
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

/** Highlight key of a card: the Designer's prefix, the attribute and the card. */
const highlightKey = (cards: Pick<DesignerCards, 'by'>, row: Pick<DesignerCardRow, 'key'>): string => `${HIGHLIGHT_PREFIX}${cards.by}|${row.key}`;

type AddOption = DesignerCards['addable'][number];

/** "+ Style another function / level / option / value…": the values without a card, with room counts. */
function AddCardMenu({ noun, cards, onAdd }: { readonly noun: string; readonly cards: DesignerCards; readonly onAdd: (option: AddOption) => void }) {
  return (
    <div className="sgl-designer-add">
      <select
        aria-label={`Style another ${noun}`}
        value=""
        onChange={(e) => {
          const v = e.currentTarget.value;
          const option = cards.addable.find((a) => String(a.value) === v);
          if (v !== '' && option) onAdd(option);
        }}
      >
        <option value="">+ Style another {noun}…</option>
        {cards.addable.map((a) => (
          <option key={`${typeof a.value}:${String(a.value)}`} value={String(a.value)}>
            {a.label} · {a.nodeCount} {a.nodeCount === 1 ? 'room' : 'rooms'}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Text attributes: type a value (suggestions: the values rooms have now, with counts) and add its card. */
function TextValueAdd({ label, suggestions, onAdd }: { readonly label: string; readonly suggestions: readonly AddOption[]; readonly onAdd: (value: string) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    onAdd(text);
    if (text.trim() !== '') setText('');
  };
  return (
    <div className="sgl-designer-add sgl-designer-add-text">
      <input
        type="text"
        aria-label={`${label} value to style`}
        placeholder="Type a value…"
        list="sgl-designer-text-values"
        maxLength={200}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
        }}
      />
      <datalist id="sgl-designer-text-values">
        {suggestions.map((s) => (
          <option key={String(s.value)} value={String(s.value)}>
            {s.nodeCount} {s.nodeCount === 1 ? 'room' : 'rooms'}
          </option>
        ))}
      </datalist>
      <button type="button" onClick={add} disabled={text.trim() === ''}>
        + Add card
      </button>
    </div>
  );
}

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
