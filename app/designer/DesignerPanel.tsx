import { HelpTip } from '@app/ui/help';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { exampleFacadeProvider } from '@app/building';
import { ROOF_STYLES } from '@app/document/v2';
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
  type DesignerEdit,
  type DesignerTypeRow,
} from './designerModel';
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

const HELP =
  'Rules apply to every room of a type in THIS design only. They do not change the project type ' +
  'definitions or other saved designs. Window coverage affects exterior walls only; roofs are ' +
  'drawn on exposed tops only.';

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
    <div className="sgl-designer" aria-label="Designer">
      <header className="sgl-designer-header">
        <h3>
          Type appearance <span className="sgl-designer-scope">this design</span>
        </h3>
        <HelpTip topicId="designer-windows" />
        <details className="sgl-designer-help">
          <summary title={HELP} aria-label="About the Designer">
            ?
          </summary>
          <p>{HELP}</p>
          <p>
            Connector style (Enclosed, Covered, Deck) is chosen per relationship in Properties. Custom geometry
            imports are not part of this version.
          </p>
        </details>
      </header>

      {error && (
        <p className="sgl-designer-error" role="alert">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="sgl-designer-notice">No node types yet: add a room or define a type in your project.</p>
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
                onRoof={(roof) => send(setRoofEdit(doc, row.typeId, roof))}
                onReset={() => send(resetTypeEdit(doc, row.typeId))}
              />
            </li>
          ))}
        </ul>
      )}

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
    </div>
  );
}

interface TypeRowProps {
  readonly row: DesignerTypeRow;
  readonly onWindow: (fraction: number) => void;
  readonly onInvalid: (message: string) => void;
  readonly onRoof: (roof: string) => void;
  readonly onReset: () => void;
}

function TypeRow({ row, onWindow, onInvalid, onRoof, onReset }: TypeRowProps) {
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
        <FacadePreview fraction={shownFraction} roof={row.effective.roof} />
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
        {inherited ? 'Project default' : 'Design override'} · project default {defaultText}
      </p>

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
        <span className="sgl-designer-source">{row.effective.source.roof === 'design' ? 'Design override' : 'Default'}</span>
      </div>

      <button type="button" className="sgl-designer-reset" disabled={!row.hasOverride} onClick={onReset}>
        Reset to project default
      </button>
    </article>
  );
}

/** Schematic exterior wall: a window covering `fraction` of the wall area; a line for a flat roof. */
function FacadePreview({ fraction, roof }: { fraction: number; roof: string }) {
  const side = Math.sqrt(Math.min(1, Math.max(0, fraction))) * 20;
  return (
    <svg className="sgl-designer-preview" viewBox="0 0 24 26" width={24} height={26} aria-hidden="true">
      {roof === 'flat' && <rect x={0} y={0} width={24} height={3} className="sgl-designer-preview-roof" />}
      <rect x={1} y={4} width={22} height={21} className="sgl-designer-preview-wall" />
      {side > 0 && <rect x={12 - side / 2} y={14.5 - side / 2} width={side} height={side} className="sgl-designer-preview-glass" />}
    </svg>
  );
}
