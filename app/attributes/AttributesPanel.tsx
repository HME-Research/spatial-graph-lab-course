import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { DesignDocumentV2 } from '@app/document';
import {
  algorithmReferences,
  designSamples,
  fieldKeys,
  type ActiveToolkit,
  type AttributeCollection,
  type DesignSample,
  type SchemaEdit,
} from '@app/extensions';
import {
  attributeRedoLabel,
  attributeUndoLabel,
  canRedoAttributes,
  canUndoAttributes,
  currentSchema,
  differsFromFiles,
  discardUnreadableRecord,
  editAttributesBatch,
  exportAttributeFile,
  filesChangedSinceSaved,
  importAttributeFile,
  markAttributesExported,
  mergeFilesIntoSession,
  redoAttributes,
  resetToFiles,
  undoAttributes,
  type AttributeSession,
} from '@app/session/projectAttributeStore';
import { DEFAULT_ENABLED_METRICS, setMetricEnabled, type CatalogueMetric, type EnabledMetricIds } from '@app/metrics';
import { CollapsibleSection, HorizontalTabs } from '@app/ui';
import { attributeRows, metricValueText, scenarioSamples, type AttributeRow } from './attributeList';
import { AddAttributeDialog, AttributeInfoDialog, DeleteAttributeDialog, EditAttributeDialog, studentMessage, type ApplyEdits } from './AttributeDialogs';
import { HideIcon, LockIcon, PencilIcon, TrashIcon } from './FunctionsDialog';
import './attributes.css';

/** One scenario of the open project, for counting and validating stored values. */
export interface ScenarioDesign {
  readonly id: string;
  readonly name: string;
  readonly doc: DesignDocumentV2;
}

type OpenDialog =
  | { readonly kind: 'add' }
  | { readonly kind: 'edit'; readonly fieldId: string }
  | { readonly kind: 'delete'; readonly fieldId: string }
  | { readonly kind: 'info'; readonly row: AttributeRow };

/**
 * The project's attributes (UI refinement 2026-11-17): ONE list per Node | Edge, in which required,
 * custom and calculated attributes appear alike (required first, then custom in project order,
 * then calculated in catalogue order). One "+ Add attribute" opens a dialog (Custom or Calculated);
 * a custom row opens its edit dialog; calculated and required rows open a short information view.
 *
 * Internally nothing is merged: custom attributes are the project attribute schema (with their own
 * Undo/Redo, ↶ ↷ here), calculated ones are the project's shown metric ids (`settings.calculatedFields`;
 * removing one hides it, the calculation stays registered and available to algorithms), and the
 * required ones are system properties of the graph.
 */
export function AttributesPanel({
  session,
  project,
  doc,
  source,
  scenarios,
  onChange,
  saveError = null,
  collection: controlledCollection,
  onCollection,
  calculatedFields = DEFAULT_ENABLED_METRICS,
  onCalculatedFields,
  onManageFunctions,
  functions,
}: {
  readonly session: AttributeSession | null;
  readonly project: ActiveToolkit | null;
  /** The open design (used when `scenarios` is not given). */
  readonly doc: DesignDocumentV2 | null;
  readonly source: string | null;
  /** Every scenario of the open project: stored values are checked and counted in all of them. */
  readonly scenarios?: readonly ScenarioDesign[];
  readonly onChange: (next: AttributeSession) => void;
  readonly saveError?: string | null;
  /** Optional controlled sub-section (Node / Edge). */
  readonly collection?: AttributeCollection;
  readonly onCollection?: (collection: AttributeCollection) => void;
  /** The project's shown calculated attributes (`settings.calculatedFields`, canonical ids). */
  readonly calculatedFields?: EnabledMetricIds;
  /** Show or hide calculated attributes (a project setting: autosaved, not undoable). Read-only without it. */
  readonly onCalculatedFields?: (ids: EnabledMetricIds) => void;
  /** Opens the Functions pop-up (the Function row). */
  readonly onManageFunctions?: () => void;
  /** Functions offered for per-function defaults (default: the project's valid types). */
  readonly functions?: readonly { readonly id: string; readonly label: string }[];
}) {
  const [ownCollection, setOwnCollection] = useState<AttributeCollection>('nodes');
  const collection = controlledCollection ?? ownCollection;
  const setCollection = onCollection ?? setOwnCollection;
  const [notice, setNotice] = useState<{ readonly tone: 'ok' | 'error'; readonly text: string } | null>(null);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const samples = useMemo<DesignSample[]>(
    () => (scenarios ? scenarioSamples(scenarios, designSamples(project, null)) : designSamples(project, doc && source ? { doc, source } : null)),
    [scenarios, project, doc, source],
  );

  if (!session || !project) {
    return (
      <div className="sgl-attributes sgl-inspector">
        <p className="meta">{project === null && session === null ? 'Open a project to see its attributes.' : 'Loading attributes…'}</p>
      </div>
    );
  }
  const schema = currentSchema(session);
  const rows = attributeRows(collection, schema, calculatedFields);
  const functionChoices = functions ?? project.nodeTypes.filter((t) => t.status.ok).map((t) => ({ id: t.id, label: t.definition.label }));

  const apply: ApplyEdits = (edits: readonly SchemaEdit[], label: string) => {
    const result = editAttributesBatch(session, edits, label, { usage: samples });
    if (!result.ok) return result.reason;
    onChange(result.session);
    setNotice({ tone: 'ok', text: `${label}.` });
    return null;
  };

  const showCalculated = (metric: CatalogueMetric, on: boolean) => {
    if (!onCalculatedFields) return;
    onCalculatedFields(setMetricEnabled(calculatedFields, metric.id, on));
    setNotice({
      tone: 'ok',
      text: on ? `Added “${metric.label}”.` : `“${metric.label}” removed from the list. It is still calculated and available to algorithms.`,
    });
  };

  const exportFile = () => {
    try {
      const url = URL.createObjectURL(new Blob([exportAttributeFile(session, new Date().toISOString())], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'attributes.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setNotice({ tone: 'error', text: `Export failed: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    onChange(markAttributesExported(session));
    setNotice({ tone: 'ok', text: 'Downloaded attributes.json.' });
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    let result = importAttributeFile(session, text);
    if (!result.ok && result.issues[0]?.code === 'attribute-schema-project-mismatch') {
      if (!window.confirm('This attribute file was made for another toolkit.\n\nUse its attributes here anyway? (Undo reverses it.)')) return;
      result = importAttributeFile(session, text, { allowOtherProject: true });
    }
    if (!result.ok) {
      setNotice({ tone: 'error', text: `Not imported: ${studentMessage(result.issues.map((i) => i.message).join('; '))} The current attributes were kept.` });
      return;
    }
    onChange(result.session);
    setNotice({ tone: 'ok', text: `Imported ${file.name}. Undo reverses it.` });
  };

  const undoTitle = canUndoAttributes(session) ? `Undo attribute change: ${attributeUndoLabel(session)}` : 'No attribute change to undo';
  const redoTitle = canRedoAttributes(session) ? `Redo attribute change: ${attributeRedoLabel(session)}` : 'No attribute change to redo';
  const fieldOf = (id: string) => schema[collection].find((f) => f.id === id);
  const referencesOf = (id: string) => {
    const field = fieldOf(id);
    return field ? algorithmReferences(project, fieldKeys(field)).map((r) => r.file.split('/').pop() ?? r.file) : [];
  };
  const blocked = session.saveBlocked ?? (saveError ? saveError : null);

  return (
    <div className="sgl-attributes sgl-inspector">
      {blocked && (
        <div className="sgl-warning" role="alert">
          Attribute changes are not saved: {blocked}
          {session.saveBlocked && (
            <>
              {' '}
              <button type="button" className="sgl-link" onClick={() => onChange(discardUnreadableRecord(session))}>
                Discard the unreadable copy and save
              </button>
            </>
          )}
        </div>
      )}

      <div className="sgl-attr-head">
        <HorizontalTabs
          label="Attributes of"
          active={collection}
          onActive={(c) => {
            setCollection(c);
            setNotice(null);
          }}
          tabs={(['nodes', 'edges'] as const).map((c) => ({
            id: c,
            label: c === 'nodes' ? 'Node' : 'Edge',
            description: c === 'nodes' ? 'Attributes of every node (room)' : 'Attributes of every edge (relationship), Access and Open alike',
          }))}
        >
          <ul className="sgl-attr-list" aria-label={`${collection === 'nodes' ? 'Node' : 'Edge'} attributes`}>
            {rows.map((row) => (
              <AttributeListRow
                key={`${row.kind}:${row.id}`}
                row={row}
                onOpen={() => {
                  if (row.kind === 'custom') setDialog({ kind: 'edit', fieldId: row.id });
                  else if (row.kind === 'required' && row.id === 'function' && onManageFunctions) onManageFunctions();
                  else setDialog({ kind: 'info', row });
                }}
                onRemove={
                  row.kind === 'custom'
                    ? () => setDialog({ kind: 'delete', fieldId: row.id })
                    : row.kind === 'calculated' && onCalculatedFields
                      ? () => showCalculated(row.metric, false)
                      : undefined
                }
                {...(row.kind === 'required' && row.id === 'function' && onManageFunctions && { onEdit: onManageFunctions })}
              />
            ))}
          </ul>
          <button type="button" className="sgl-attr-add" onClick={() => setDialog({ kind: 'add' })}>
            <span aria-hidden="true">+</span> Add attribute
          </button>
        </HorizontalTabs>
        <div className="sgl-attr-history" role="group" aria-label="Attribute changes">
          <button type="button" className="sgl-icon-action" disabled={!canUndoAttributes(session)} onClick={() => onChange(undoAttributes(session))} title={undoTitle} aria-label={undoTitle}>
            <span aria-hidden="true">↶</span>
          </button>
          <button type="button" className="sgl-icon-action" disabled={!canRedoAttributes(session)} onClick={() => onChange(redoAttributes(session))} title={redoTitle} aria-label={redoTitle}>
            <span aria-hidden="true">↷</span>
          </button>
        </div>
      </div>

      {notice && (
        <p className={notice.tone === 'ok' ? 'sgl-attr-notice' : 'sgl-error'} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          {notice.text}
        </p>
      )}

      <CollapsibleSection title="Advanced" sectionId="attributes-advanced" defaultOpen={false} variant="advanced">
        <p className="sgl-help">↶ ↷ above undo attribute changes only. Changes to the scenario (nodes, edges, values) have their own Undo in the header.</p>
        {filesChangedSinceSaved(session) && <p className="sgl-help">The toolkit declares attributes differently from when these were saved.</p>}
        <div className="sgl-buttons">
          <button
            type="button"
            onClick={() => {
              const merged = mergeFilesIntoSession(session, project);
              onChange(merged.session);
              setNotice({ tone: 'ok', text: merged.added.length ? `Added ${merged.added.length} attribute${merged.added.length === 1 ? '' : 's'} from the toolkit.` : 'Nothing new to add from the toolkit.' });
            }}
            title="Add the attributes that the toolkit's functions declare and this project does not have yet"
          >
            Add toolkit attributes
          </button>
          <button
            type="button"
            className="sgl-danger"
            disabled={!differsFromFiles(session) && !session.saveBlocked}
            onClick={() => {
              if (window.confirm('Replace all custom attributes with exactly what the toolkit declares? Values entered are kept. Undo reverses it.')) onChange(resetToFiles(session, project));
            }}
          >
            Reset to toolkit attributes
          </button>
        </div>
        <div className="sgl-buttons">
          <button type="button" onClick={exportFile} title="Download only the custom attributes as a file">
            Export attributes…
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} title="Replace the custom attributes with an exported attribute file">
            Import attributes…
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => void importFile(e)} aria-label="Attribute file to import" />
        </div>
      </CollapsibleSection>

      {dialog?.kind === 'add' && (
        <AddAttributeDialog
          collection={collection}
          schema={schema}
          samples={samples}
          enabledMetrics={calculatedFields}
          apply={apply}
          onAddCalculated={
            onCalculatedFields
              ? (id) => {
                  const metric = attributeRows(collection, schema, [...calculatedFields, id]).find((r) => r.kind === 'calculated' && r.id === id);
                  if (metric?.kind === 'calculated') showCalculated(metric.metric, true);
                }
              : null
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'edit' && fieldOf(dialog.fieldId) && (
        <EditAttributeDialog
          key={dialog.fieldId}
          collection={collection}
          schema={schema}
          field={fieldOf(dialog.fieldId)!}
          samples={samples}
          functions={functionChoices}
          references={referencesOf(dialog.fieldId)}
          apply={apply}
          onDelete={() => setDialog({ kind: 'delete', fieldId: dialog.fieldId })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'delete' && fieldOf(dialog.fieldId) && (
        <DeleteAttributeDialog
          collection={collection}
          field={fieldOf(dialog.fieldId)!}
          samples={samples}
          hasTypeDefaults={collection === 'nodes' && Object.values(schema.nodeTypeDefaults).some((d) => Object.prototype.hasOwnProperty.call(d, dialog.fieldId))}
          references={referencesOf(dialog.fieldId)}
          apply={apply}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'info' && dialog.row.kind !== 'custom' && (
        <AttributeInfoDialog
          name={dialog.row.name}
          typeText={dialog.row.kind === 'calculated' ? metricValueText(dialog.row.metric) : dialog.row.typeText}
          text={dialog.row.kind === 'calculated' ? dialog.row.metric.definition : dialog.row.info}
          {...(dialog.row.kind === 'calculated' && { calculated: dialog.row.metric })}
          {...(dialog.row.kind === 'calculated' &&
            onCalculatedFields && {
              onRemove: () => {
                if (dialog.row.kind === 'calculated') showCalculated(dialog.row.metric, false);
                setDialog(null);
              },
            })}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/** One compact row: name, a subtle type indicator, and the lock or the remove action. */
function AttributeListRow({ row, onOpen, onRemove, onEdit }: { readonly row: AttributeRow; readonly onOpen: () => void; readonly onRemove?: (() => void) | undefined; readonly onEdit?: () => void }) {
  const title =
    row.kind === 'custom'
      ? `${row.name} · ${row.typeText}${row.field.description ? ` — ${row.field.description}` : ''}. Click to edit.`
      : row.kind === 'calculated'
        ? `${row.name} · calculated (${metricValueText(row.metric)}). ${row.metric.definition}`
        : `${row.name} · ${row.typeText} · required. ${row.info}`;
  return (
    <li className={`sgl-attr-row is-${row.kind}`} data-attribute={row.id} data-attribute-kind={row.kind}>
      <button type="button" className="sgl-attr-main" onClick={onOpen} title={title}>
        <span className="sgl-attr-name">{row.name}</span>
        {row.kind === 'required' && (
          <span className="sgl-attr-lock" role="img" aria-label="Required: cannot be removed" title="Required: cannot be removed">
            <LockIcon />
          </span>
        )}
        <span className={`sgl-attr-type${row.kind === 'calculated' ? ' is-calculated' : ''}`}>{row.typeText}</span>
      </button>
      {onEdit ? (
        <button type="button" className="sgl-icon-action sgl-attr-remove" onClick={onEdit} aria-label="Add or remove functions" title="Add or remove functions">
          <PencilIcon />
        </button>
      ) : onRemove ? (
        <button
          type="button"
          className="sgl-icon-action sgl-attr-remove"
          onClick={onRemove}
          aria-label={row.kind === 'custom' ? `Delete attribute ${row.name}…` : `Remove ${row.name} from the list`}
          title={row.kind === 'custom' ? 'Delete this attribute…' : 'Remove from the list (the calculation stays available)'}
        >
          {row.kind === 'custom' ? <TrashIcon /> : <HideIcon />}
        </button>
      ) : (
        <span className="sgl-attr-remove-placeholder" aria-hidden="true" />
      )}
    </li>
  );
}

/** What kind of value a calculated attribute has, in plain words (kept for existing callers). */
export function metricKindText(metric: Pick<CatalogueMetric, 'valueKind' | 'unit'>): string {
  if (metric.valueKind === 'boolean') return 'yes / no';
  if (metric.valueKind === 'text') return 'text';
  return metric.unit ? `number, in ${metric.unit}` : 'number';
}
