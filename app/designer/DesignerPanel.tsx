import { CollapsibleSection } from '@app/ui';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { exampleFacadeProvider } from '@app/building';
import { ROOF_STYLES, WINDOW_LAYOUTS } from '@app/document/v2';
import type { DesignPort } from '@app/spatial';
import type { ProjectViewContext } from '@app/views/project';
import { typeColor } from '@core/viewer/appearance';
import type { Selection } from '@core/viewer/selection';
import {
  CONNECTOR_STYLE_LABELS,
  designerTypeRows,
  formatPercent,
  parseWindowPercent,
  resetTypeEdit,
  ROOF_LABELS,
  selectedRelationship,
  setRoofEdit,
  setWindowFractionEdit,
  setWindowLayoutEdit,
  WINDOW_LAYOUT_LABELS,
  type DesignerEdit,
  type DesignerTypeRow,
} from './designerModel';
import { DesignerGuideButton } from './DesignerGuide';
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
  /** Shared selection: a selected relationship gets a pointer to its connector style in Properties. */
  readonly selection?: Selection;
  /** Optional: show the selected relationship's Properties (connector style lives there). */
  readonly onShowRelationship?: (edgeId: string) => void;
}


export function DesignerPanel({ design, project, selection, onShowRelationship }: DesignerPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const doc = design?.doc;
  const activeProject = project?.project ?? null;
  const facade = project?.facade ?? exampleFacadeProvider;
  const rows = useMemo(() => (doc ? designerTypeRows(doc, activeProject, facade) : []), [doc, activeProject, facade]);
  const relationship = useMemo(
    () => (doc && design ? selectedRelationship(doc, selection, design.spatial) : null),
    [doc, design, selection],
  );

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

      <CollapsibleSection title="Defaults" sectionId="designer-defaults">
        <p className="sgl-help">Every function starts from its project default. Changes under Function-Specific apply to this design only.</p>
        {rows.length > 0 && (
          <dl className="sgl-readonly-list sgl-designer-defaults" aria-label="Project defaults (read-only)">
            {rows.map((row) => (
              <div key={row.typeId} style={{ display: 'contents' }}>
                <dt>{row.name}</dt>
                <dd>{row.projectDefault.source === 'broken' ? 'invalid definition' : `windows ${formatPercent(row.projectDefault.windowFraction)} %`}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="sgl-help">Corridors default to Enclosed; choose another style per relationship in Properties.</p>
        {relationship && (
          <section className="sgl-designer-relationship" aria-label="Selected relationship">
            <p>
              Relationship <strong>{relationship.label}</strong>: connector{' '}
              <strong>{CONNECTOR_STYLE_LABELS[relationship.style]}</strong>
              {relationship.styleIsDefault ? ' (default)' : ''}.
              {relationship.status !== 'routed' && ' The style is only built when the relationship gets a connector.'}
            </p>
            {onShowRelationship && (
              <button type="button" onClick={() => onShowRelationship(relationship.edgeId)}>
                Edit in Properties
              </button>
            )}
          </section>
        )}
      </CollapsibleSection>

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
                  onRoof={(roof) => send(setRoofEdit(doc, row.typeId, roof))}
                  onReset={() => send(resetTypeEdit(doc, row.typeId))}
                />
              </li>
            ))}
          </ul>
        )}
        <CollapsibleSection title="Imported façade (3DM)" level={4} defaultOpen={false} sectionId="designer-imported-facade">
          <p className="sgl-help">Not available yet. A later version lets a function use an imported façade module, fitted to each wall by Repeat or Stretch.</p>
        </CollapsibleSection>
      </CollapsibleSection>
    </div>
  );
}

interface TypeRowProps {
  readonly row: DesignerTypeRow;
  readonly onWindow: (fraction: number) => void;
  readonly onInvalid: (message: string) => void;
  readonly onLayout: (layout: string) => void;
  readonly onRoof: (roof: string) => void;
  readonly onReset: () => void;
}

function TypeRow({ row, onWindow, onInvalid, onLayout, onRoof, onReset }: TypeRowProps) {
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
      <div className="sgl-designer-type-head">
        <span className="sgl-designer-swatch" style={{ background: typeColor(row.typeId) }} aria-hidden="true" />
        <span id={`${idBase}-name`} className="sgl-designer-type-name">
          {row.name}
        </span>
        <span className="sgl-designer-count" title="Rooms of this type in this design">
          {row.nodeCount} {row.nodeCount === 1 ? 'room' : 'rooms'}
        </span>
        <FacadePreview fraction={shownFraction} layout={row.effective.windowLayout} roof={row.effective.roof} />
      </div>

      {row.warning && (
        <p className="sgl-designer-warning" role="note">
          ⚠ {row.warning}
        </p>
      )}

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
              title={layout === 'repeat' ? 'One window per bay, repeated along the wall' : 'One continuous window band along the wall'}
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

      <div className="sgl-designer-field">
        <label htmlFor={`${idBase}-roof`} title="Roof on the exposed tops of rooms of this type. Pitched roofs are not available yet.">
          Roof
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

      <button type="button" className="sgl-designer-reset" disabled={!row.hasOverride} onClick={onReset}>
        Reset to project default
      </button>
    </article>
  );
}

/**
 * Schematic exterior wall of two bays: `fraction` of the wall area glazed, as one window per bay
 * (Repeat) or one band across both (Stretch); a line for a flat roof.
 */
function FacadePreview({ fraction, layout, roof }: { fraction: number; layout: string; roof: string }) {
  const f = Math.min(1, Math.max(0, fraction));
  const bay = 18;
  const side = Math.sqrt(f) * bay;
  const band = f * 20;
  return (
    <svg className="sgl-designer-preview" viewBox="0 0 38 26" width={38} height={26} aria-hidden="true">
      {roof === 'flat' && <rect x={0} y={0} width={38} height={3} className="sgl-designer-preview-roof" />}
      <rect x={1} y={4} width={36} height={21} className="sgl-designer-preview-wall" />
      {f > 0 &&
        (layout === 'stretch' ? (
          <rect x={1} y={14.5 - band / 2} width={36} height={band} className="sgl-designer-preview-glass" />
        ) : (
          [10, 28].map((cx) => <rect key={cx} x={cx - side / 2} y={14.5 - side / 2} width={side} height={side} className="sgl-designer-preview-glass" />)
        ))}
    </svg>
  );
}
