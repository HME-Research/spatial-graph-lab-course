import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { DesignDocumentV2 } from '@app/document/v2';
import {
  algorithmReferences,
  designSamples,
  describeField,
  FIELD_KIND_LABELS,
  FIELD_KINDS,
  fieldKeys,
  fieldUsage,
  type ActiveProject,
  type AttributeCollection,
  type AttributeField,
  type DefaultValue,
  type FieldKind,
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
  editAttributes,
  exportAttributeFile,
  filesChangedSinceSaved,
  importAttributeFile,
  isAttributeSchemaModified,
  markAttributesExported,
  mergeFilesIntoSession,
  redoAttributes,
  resetToFiles,
  undoAttributes,
  type AttributeSession,
} from '@app/session/projectAttributeStore';
import { formatFieldValue, KIND_HELP, parseChoices, parseValueDraft, typeChoices } from './attributesModel';
import { DEFAULT_ENABLED_METRICS, METRIC_CATALOGUE, setMetricEnabled, type CatalogueMetric, type EnabledMetricIds } from '@app/metrics';
import { CollapsibleSection, HorizontalTabs, InfoButton } from '@app/ui';
import { HelpTip } from '@app/ui/help';
import './attributes.css';

/**
 * The project's custom attribute fields (programme phase 03): one list for every node and one for
 * every edge of every design in the project. Changes here are PROJECT changes — saved in this
 * browser immediately, with their own Undo/Redo here — not design edits (the header's Undo/Redo
 * only undoes design edits). Designer appearance settings are separate.
 */
export function AttributesPanel({
  session,
  project,
  doc,
  source,
  onChange,
  saveError = null,
  collection: controlledCollection,
  onCollection,
  calculatedFields = DEFAULT_ENABLED_METRICS,
  onCalculatedFields,
}: {
  readonly session: AttributeSession | null;
  readonly project: ActiveProject | null;
  /** The open design (its stored values are respected by kind changes and counted for deletes). */
  readonly doc: DesignDocumentV2 | null;
  readonly source: string | null;
  readonly onChange: (next: AttributeSession) => void;
  readonly saveError?: string | null;
  /** Optional controlled sub-section (Nodes / Edges). */
  readonly collection?: AttributeCollection;
  readonly onCollection?: (collection: AttributeCollection) => void;
  /** The project's enabled calculated values (`settings.calculatedFields`, canonical ids). */
  readonly calculatedFields?: EnabledMetricIds;
  /** Enable/disable calculated values (a project setting: autosaved, not undoable). Read-only list without it. */
  readonly onCalculatedFields?: (ids: EnabledMetricIds) => void;
}) {
  const [ownCollection, setOwnCollection] = useState<AttributeCollection>('nodes');
  const collection = controlledCollection ?? ownCollection;
  const setCollection = onCollection ?? setOwnCollection;
  const [notice, setNotice] = useState<{ readonly tone: 'ok' | 'error'; readonly text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Bumped on every refused edit: field inputs re-key, so a refused draft never looks applied. */
  const [refusals, setRefusals] = useState(0);
  const usage = useMemo(() => designSamples(project, doc && source ? { doc, source } : null), [project, doc, source]);

  if (!session || !project) {
    return (
      <div className="sgl-attributes sgl-inspector">
        <p className="meta">No active project: custom fields belong to a project.</p>
      </div>
    );
  }
  const schema = currentSchema(session);
  const fields = schema[collection];
  const what = collection === 'nodes' ? 'node' : 'edge';

  const apply = (edit: SchemaEdit): boolean => {
    const result = editAttributes(session, edit, { usage });
    if (!result.ok) {
      setNotice({ tone: 'error', text: result.reason });
      setRefusals((n) => n + 1); // refused drafts are replaced by the stored values again
      return false;
    }
    onChange(result.session);
    setNotice({ tone: 'ok', text: `${result.label}. Saved for project “${project.id}”.` });
    return true;
  };

  const exportFile = () => {
    try {
      const url = URL.createObjectURL(new Blob([exportAttributeFile(session, new Date().toISOString())], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.id}.attributes.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setNotice({ tone: 'error', text: `Export failed: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    onChange(markAttributesExported(session));
    setNotice({ tone: 'ok', text: `Downloaded ${project.id}.attributes.json.` });
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    let result = importAttributeFile(session, text);
    if (!result.ok && result.issues[0]?.code === 'attribute-schema-project-mismatch') {
      if (!window.confirm(`${result.issues[0].message}.\n\nImport its fields into project “${project.id}” anyway? (Undo here reverts it.)`)) return;
      result = importAttributeFile(session, text, { allowOtherProject: true });
    }
    if (!result.ok) {
      setNotice({ tone: 'error', text: `Not imported: ${result.issues.map((i) => i.message).join('; ')}. The current fields were kept.` });
      return;
    }
    onChange(result.session);
    setNotice({ tone: 'ok', text: `Imported ${file.name}. Undo here reverts it.` });
  };

  const modified = isAttributeSchemaModified(session);
  const status = session.saveBlocked
    ? { tone: 'error', text: `Not saved: ${session.saveBlocked}.` }
    : saveError
      ? { tone: 'error', text: `Not saved: ${saveError}` }
      : differsFromFiles(session)
        ? { tone: 'ok', text: `Saved in this browser${modified ? ' · not exported' : ''}.` }
        : { tone: 'ok', text: 'Same as the project files.' };

  return (
    <div className="sgl-attributes sgl-inspector">
      <div className="sgl-help-row">
        <p className="sgl-help sgl-attr-intro">
          Attributes of project <strong>{project.definition.name}</strong>, shared by every design. Values are set per item in Properties.
        </p>
        <HelpTip topicId="project-attributes" />
      </div>
      <div className={`sgl-attr-status sgl-attr-status-${status.tone}`} role="status">
        {status.text}
      </div>
      <div className="sgl-buttons" role="group" aria-label="Project attribute history and files">
        <button type="button" disabled={!canUndoAttributes(session)} onClick={() => onChange(undoAttributes(session))} title={canUndoAttributes(session) ? `Undo: ${attributeUndoLabel(session)}` : 'Nothing to undo in the project fields'}>
          ↶ Undo field change
        </button>
        <button type="button" disabled={!canRedoAttributes(session)} onClick={() => onChange(redoAttributes(session))} title={canRedoAttributes(session) ? `Redo: ${attributeRedoLabel(session)}` : 'Nothing to redo in the project fields'}>
          ↷ Redo
        </button>
      </div>
      {session.saveBlocked && (
        <div className="sgl-warning" role="alert">
          The saved fields of this project could not be read, so nothing is saved until you decide.{' '}
          <button type="button" onClick={() => onChange(discardUnreadableRecord(session))}>
            Discard the unreadable copy and save
          </button>
        </div>
      )}
      {filesChangedSinceSaved(session) && (
        <div className="sgl-warning">
          The project files declare fields differently from when these were saved.{' '}
          <button
            type="button"
            onClick={() => {
              const merged = mergeFilesIntoSession(session, project);
              onChange(merged.session);
              setNotice({ tone: 'ok', text: merged.added.length ? `Added ${merged.added.join(', ')}.` : 'Nothing new to add; the files are now marked as merged.' });
            }}
          >
            Add fields from project files
          </button>
        </div>
      )}
      {notice && (
        <p className={notice.tone === 'ok' ? 'algorithm-notice' : 'sgl-error'} role={notice.tone === 'ok' ? 'status' : 'alert'}>
          {notice.text}
        </p>
      )}

      <HorizontalTabs
        label="Attributes of"
        active={collection}
        onActive={setCollection}
        tabs={(['nodes', 'edges'] as const).map((c) => ({
          id: c,
          label: (
            <>
              {c === 'nodes' ? 'Node' : 'Edge'} <span className="sgl-htab-count">({schema[c].length})</span>
            </>
          ),
          description: c === 'nodes' ? 'Attributes of every room (node)' : 'Attributes of every relationship (edge), Access and Open alike',
        }))}
      >
        <CollapsibleSection title="System fields" sectionId="system-fields" meta={<span className="sgl-chip sgl-chip-readonly">required</span>}>
          <SystemFields collection={collection} />
        </CollapsibleSection>

        <CollapsibleSection title="Custom attributes" sectionId="custom-attributes" meta={String(fields.length)}>
          {fields.length === 0 && <p className="meta">No {what} attributes yet.</p>}
          <ul className="sgl-field-list">
            {fields.map((field, index) => (
              <FieldEditor
                key={`${field.id}:${field.key}:${field.kind}`}
                token={`${session.revision}:${refusals}`}
                field={field}
                index={index}
                count={fields.length}
                collection={collection}
                nodeTypeDefaults={collection === 'nodes' ? Object.entries(schema.nodeTypeDefaults).flatMap(([t, d]) => (Object.prototype.hasOwnProperty.call(d, field.id) ? [[t, d[field.id]!] as const] : [])) : []}
                types={typeChoices(project, doc?.nodes.map((n) => n.typeId) ?? [])}
                usage={fieldUsage(field, collection, usage)}
                references={algorithmReferences(project, fieldKeys(field))}
                apply={apply}
                onError={(text) => setNotice({ tone: 'error', text })}
              />
            ))}
          </ul>
          <AddField collection={collection} apply={apply} onError={(text) => setNotice({ tone: 'error', text })} />
        </CollapsibleSection>

        <CalculatedCatalogue collection={collection} enabled={calculatedFields} {...(onCalculatedFields && { onChange: onCalculatedFields })} />
      </HorizontalTabs>

      <CollapsibleSection title="Advanced" sectionId="attributes-advanced" defaultOpen={false} variant="advanced">
        <div className="sgl-buttons">
          <button type="button" onClick={exportFile} title="Download the project's fields as a file (keep or share it)">
            Export fields…
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} title="Replace the fields with an exported attribute file">
            Import fields…
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(e) => void importFile(e)} aria-label="Attribute file to import" />
        </div>
        <p className="sgl-help">
          Built-in properties (id, label, type, position, size, connection kind and corridor style) are always shown in Properties and are not custom fields. Building Designer settings are separate.
        </p>
        <button
          type="button"
          className="sgl-danger"
          disabled={!differsFromFiles(session) && !session.saveBlocked}
          onClick={() => {
            if (window.confirm('Replace all fields with exactly what the project files declare? Stored design values are not changed. Undo here reverts it.')) onChange(resetToFiles(session, project));
          }}
        >
          Reset fields to the project files
        </button>
      </CollapsibleSection>
    </div>
  );
}

/**
 * System-backed fields every item has (read-only here): they are edited through their own
 * controls in Properties, never as free custom attributes.
 */
const SYSTEM_FIELDS: Readonly<Record<AttributeCollection, readonly { readonly label: string; readonly detail: string }[]>> = {
  nodes: [
    { label: 'Function', detail: 'The room type. Required; chosen from the project’s functions.' },
    { label: 'Level', detail: 'The storey: the room’s z position. Change it with the position in Properties.' },
  ],
  edges: [{ label: 'Kind', detail: 'Access or Open. Required; chosen in Properties.' }],
};

function SystemFields({ collection }: { readonly collection: AttributeCollection }) {
  return (
    <dl className="sgl-readonly-list sgl-system-fields">
      {SYSTEM_FIELDS[collection].map((f) => (
        <div key={f.label} style={{ display: 'contents' }}>
          <dt>{f.label}</dt>
          <dd>{f.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

/** What kind of value a calculated value has, in plain words (never "number" for yes/no or text). */
export function metricKindText(metric: Pick<CatalogueMetric, 'valueKind' | 'unit'>): string {
  if (metric.valueKind === 'boolean') return 'yes / no';
  if (metric.valueKind === 'text') return 'text';
  return metric.unit ? `number, in ${metric.unit}` : 'number';
}

/**
 * The catalogue of built-in calculated values for this kind of item (`app/metrics`), each with its
 * kind and definition. The checkbox chooses whether Properties shows it and colour-by offers it
 * (project setting `settings.calculatedFields`). The values themselves are read-only.
 */
function CalculatedCatalogue({
  collection,
  enabled,
  onChange,
}: {
  readonly collection: AttributeCollection;
  readonly enabled: EnabledMetricIds;
  readonly onChange?: (ids: EnabledMetricIds) => void;
}) {
  const metrics = METRIC_CATALOGUE.filter((m) => m.collection === collection);
  const on = metrics.filter((m) => enabled.includes(m.id)).length;
  return (
    <CollapsibleSection
      title="Calculated"
      sectionId="calculated-catalogue"
      variant="calculated"
      meta={<span className="sgl-chip sgl-chip-readonly">{`${on} of ${metrics.length} shown`}</span>}
      actions={<InfoButton concept="calculated-values" />}
    >
      {metrics.length === 0 ? (
        <p className="meta">No calculated values for {collection === 'nodes' ? 'rooms' : 'relationships'} yet.</p>
      ) : (
        <ul className="sgl-calculated-catalogue">
          {metrics.map((m) => (
            <li key={m.id} data-metric={m.id}>
              <label className="sgl-check-row" title={m.definition}>
                <input
                  type="checkbox"
                  checked={enabled.includes(m.id)}
                  disabled={!onChange}
                  onChange={(e) => onChange?.(setMetricEnabled(enabled, m.id, e.currentTarget.checked))}
                />
                <span className="sgl-calculated-name">{m.label}</span>
                <span className="sgl-calculated-kind meta">{metricKindText(m)}</span>
              </label>
              <p className="sgl-help">{m.definition}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="sgl-help">Ticked values appear read-only in Properties and in the 3D views’ “Colour by”. They are worked out from the design, never typed in or exported as data.</p>
    </CollapsibleSection>
  );
}

type UsageInfo = ReturnType<typeof fieldUsage>;

function FieldEditor({
  field,
  token,
  index,
  count,
  collection,
  nodeTypeDefaults,
  types,
  usage,
  references,
  apply,
  onError,
}: {
  readonly field: AttributeField;
  /** Changes on every schema revision and refusal; re-keys the uncontrolled inputs. */
  readonly token: string;
  readonly index: number;
  readonly count: number;
  readonly collection: AttributeCollection;
  readonly nodeTypeDefaults: readonly (readonly [string, DefaultValue])[];
  readonly types: readonly { readonly id: string; readonly label: string }[];
  readonly usage: UsageInfo;
  readonly references: ReturnType<typeof algorithmReferences>;
  readonly apply: (edit: SchemaEdit) => boolean;
  readonly onError: (message: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rename, setRename] = useState(field.key);
  const [kind, setKind] = useState<FieldKind>(field.kind);
  const [kindChoices, setKindChoices] = useState('');
  const base = { collection, fieldId: field.id } as const;
  const usageText = usage.total === 0 ? 'no stored values in known designs' : usage.designs.map((d) => `${d.count} in ${d.label}`).join(', ');
  const refText = references.length > 0 ? `Algorithm code may read “${field.key}”: ${references.map((r) => r.file).join(', ')}. It is not changed automatically.` : null;

  const commitDefault = (draft: string) => {
    const parsed = parseValueDraft(field, draft);
    if (!parsed.ok) return onError(parsed.message);
    if (parsed.value === field.default) return;
    apply({ type: 'update-field', ...base, patch: { default: parsed.value ?? null } });
  };

  return (
    <li className="sgl-field-card">
      <details>
        <summary>
          <strong>{field.label}</strong> <code>{field.key}</code> <span className="sgl-chip">{FIELD_KIND_LABELS[field.kind]}</span>
          {field.default !== undefined && <span className="sgl-help"> default {formatFieldValue(field.default)}</span>}
        </summary>
        <div className="sgl-field-body">
          <p className="sgl-help">
            Accepts {describeField(field)}. {usageText.charAt(0).toUpperCase() + usageText.slice(1)}.
            {(field.formerKeys ?? []).length > 0 && <> Former names (still read): {field.formerKeys!.join(', ')}.</>}
          </p>
          <label className="sgl-form-row">
            Label
            <input defaultValue={field.label} key={`${field.label}:${token}`} onBlur={(e) => e.currentTarget.value.trim() !== field.label && apply({ type: 'update-field', ...base, patch: { label: e.currentTarget.value } })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </label>
          <label className="sgl-form-row">
            Default
            {field.kind === 'enum' || field.kind === 'boolean' ? (
              <select value={field.default === undefined ? '' : String(field.default)} onChange={(e) => commitDefault(e.currentTarget.value)}>
                <option value="">— no default</option>
                {(field.kind === 'enum' ? (field.values ?? []) : ['true', 'false']).map((v) => (
                  <option key={v} value={v}>
                    {field.kind === 'boolean' ? (v === 'true' ? 'yes' : 'no') : v}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.kind === 'number' ? 'number' : 'text'}
                step="any"
                defaultValue={field.default === undefined ? '' : String(field.default)}
                key={`${String(field.default)}:${token}`}
                placeholder="no default"
                onBlur={(e) => commitDefault(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            )}
          </label>
          {field.kind === 'enum' && (
            <label className="sgl-form-row">
              Choices
              <input
                defaultValue={(field.values ?? []).join(', ')}
                key={`${(field.values ?? []).join('|')}:${token}`}
                onBlur={(e) => {
                  const values = parseChoices(e.currentTarget.value);
                  if (values.join('|') !== (field.values ?? []).join('|')) apply({ type: 'update-field', ...base, patch: { values } });
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                aria-describedby={`${field.id}-choices-help`}
              />
            </label>
          )}
          {field.kind === 'enum' && <p className="sgl-help" id={`${field.id}-choices-help`}>Comma-separated. Removing a choice that is stored somewhere is refused.</p>}
          {field.kind === 'number' && (
            <div className="sgl-form-row">
              Range
              {(['min', 'max'] as const).map((bound) => (
                <input
                  key={`${bound}:${String(field[bound])}:${token}`}
                  type="number"
                  step="any"
                  aria-label={`${field.label} ${bound === 'min' ? 'smallest' : 'largest'} value`}
                  placeholder={bound}
                  defaultValue={field[bound] === undefined ? '' : String(field[bound])}
                  onBlur={(e) => {
                    const text = e.currentTarget.value.trim();
                    const value = text === '' ? null : Number(text);
                    if ((value ?? undefined) !== field[bound]) apply({ type: 'update-field', ...base, patch: { [bound]: value } });
                  }}
                />
              ))}
            </div>
          )}

          {collection === 'nodes' && (
            <TypeDefaults field={field} types={types} defaults={nodeTypeDefaults} apply={apply} onError={onError} token={token} />
          )}

          <form
            className="sgl-form-row"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (rename.trim() !== field.key) apply({ type: 'rename-field', ...base, key: rename.trim() });
            }}
          >
            <label>
              Key
              <input value={rename} onChange={(e) => setRename(e.currentTarget.value)} aria-describedby={`${field.id}-key-help`} />
            </label>
            <button type="submit" disabled={rename.trim() === field.key}>
              Rename
            </button>
          </form>
          <p className="sgl-help" id={`${field.id}-key-help`}>
            The name stored in designs. Renaming keeps every stored value (the old name is still read).{refText && <strong> {refText}</strong>}
          </p>

          <form
            className="sgl-form-row"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (kind === field.kind) return;
              apply({ type: 'change-field-kind', ...base, kind, ...(kind === 'enum' && { values: parseChoices(kindChoices) }) });
            }}
          >
            <label>
              Kind
              <select value={kind} onChange={(e) => setKind(e.currentTarget.value as FieldKind)}>
                {FIELD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {FIELD_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            {kind === 'enum' && kind !== field.kind && <input placeholder="choices, comma-separated" value={kindChoices} onChange={(e) => setKindChoices(e.currentTarget.value)} aria-label="Choices for the new kind" />}
            <button type="submit" disabled={kind === field.kind}>
              Change kind
            </button>
          </form>
          <p className="sgl-help">Values are never converted: a kind change that would make a stored value or default invalid is refused with the reason.</p>

          <div className="sgl-buttons">
            <button type="button" disabled={index === 0} onClick={() => apply({ type: 'move-field', ...base, toIndex: index - 1 })} aria-label={`Move ${field.label} up`}>
              ↑
            </button>
            <button type="button" disabled={index === count - 1} onClick={() => apply({ type: 'move-field', ...base, toIndex: index + 1 })} aria-label={`Move ${field.label} down`}>
              ↓
            </button>
            {!confirmDelete && (
              <button type="button" className="sgl-danger" onClick={() => setConfirmDelete(true)}>
                Delete field…
              </button>
            )}
          </div>
          {confirmDelete && (
            <div
              className="sgl-confirm"
              role="alertdialog"
              aria-label={`Delete field ${field.key}?`}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setConfirmDelete(false);
                }
              }}
            >
              <p>
                <strong>Delete “{field.key}” from every {collection === 'nodes' ? 'room' : 'relationship'} of this project?</strong>
              </p>
              <ul className="sgl-list">
                <li>Stored values: {usageText}. They are kept in the designs (listed as “not in the project fields”), not deleted.</li>
                {collection === 'nodes' && nodeTypeDefaults.length > 0 && <li>Its type defaults ({nodeTypeDefaults.map(([t]) => t).join(', ')}) are removed.</li>}
                {refText && <li>{refText}</li>}
                <li>Undo field change reverts it.</li>
              </ul>
              <div className="sgl-buttons">
                <button type="button" onClick={() => setConfirmDelete(false)} autoFocus>
                  Cancel
                </button>
                <button type="button" className="sgl-danger" onClick={() => apply({ type: 'delete-field', ...base }) && setConfirmDelete(false)}>
                  Delete field
                </button>
              </div>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

function TypeDefaults({
  field,
  types,
  defaults,
  apply,
  onError,
  token,
}: {
  readonly field: AttributeField;
  readonly types: readonly { readonly id: string; readonly label: string }[];
  readonly defaults: readonly (readonly [string, DefaultValue])[];
  readonly apply: (edit: SchemaEdit) => boolean;
  readonly onError: (message: string) => void;
  readonly token: string;
}) {
  const own = new Map(defaults);
  if (types.length === 0) return null;
  return (
    <fieldset className="sgl-type-defaults">
      <legend>Default per room type</legend>
      <p className="sgl-help">A type default replaces the field default for rooms of that type. It never adds or removes fields.</p>
      {types.map((t) => {
        const value = own.get(t.id);
        const set = (draft: string) => {
          const parsed = parseValueDraft(field, draft);
          if (!parsed.ok) return onError(parsed.message);
          if (parsed.value === value) return;
          if (parsed.value === undefined) {
            if (value !== undefined) apply({ type: 'set-type-default', typeId: t.id, fieldId: field.id, value: null });
          } else apply({ type: 'set-type-default', typeId: t.id, fieldId: field.id, value: parsed.value });
        };
        const label = `${field.label} default for ${t.label}`;
        return (
          <label key={t.id} className="sgl-form-row">
            {t.label}
            {field.kind === 'enum' || field.kind === 'boolean' ? (
              <select aria-label={label} value={value === undefined ? '' : String(value)} onChange={(e) => set(e.currentTarget.value)}>
                <option value="">— field default ({formatFieldValue(field.default)})</option>
                {(field.kind === 'enum' ? (field.values ?? []) : ['true', 'false']).map((v) => (
                  <option key={v} value={v}>
                    {field.kind === 'boolean' ? (v === 'true' ? 'yes' : 'no') : v}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={label}
                key={`${String(value)}:${token}`}
                type={field.kind === 'number' ? 'number' : 'text'}
                step="any"
                placeholder={`field default ${formatFieldValue(field.default)}`}
                defaultValue={value === undefined ? '' : String(value)}
                onBlur={(e) => set(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            )}
          </label>
        );
      })}
    </fieldset>
  );
}

function AddField({ collection, apply, onError }: { readonly collection: AttributeCollection; readonly apply: (edit: SchemaEdit) => boolean; readonly onError: (message: string) => void }) {
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<FieldKind>('text');
  const [choices, setChoices] = useState('');
  const [def, setDef] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const values = parseChoices(choices);
    let defaultValue: DefaultValue | undefined;
    if (def.trim() !== '') {
      const parsed = parseValueDraft({ kind, values, label: label || key }, def);
      if (!parsed.ok) return onError(parsed.message);
      defaultValue = parsed.value;
    }
    const ok = apply({
      type: 'add-field',
      collection,
      field: { key: key.trim(), ...(label.trim() && { label: label.trim() }), kind, ...(kind === 'enum' && { values }), ...(defaultValue !== undefined && { default: defaultValue }) },
    });
    if (ok) {
      setKey('');
      setLabel('');
      setChoices('');
      setDef('');
    }
  };
  return (
    <form className="sgl-section sgl-add-field" onSubmit={submit} aria-label={`Add a ${collection === 'nodes' ? 'node' : 'edge'} field`}>
      <h4>Add a {collection === 'nodes' ? 'node' : 'edge'} field</h4>
      <label className="sgl-form-row">
        Key
        <input value={key} onChange={(e) => setKey(e.currentTarget.value)} placeholder="e.g. capacity" required />
      </label>
      <label className="sgl-form-row">
        Label
        <input value={label} onChange={(e) => setLabel(e.currentTarget.value)} placeholder="optional, e.g. Capacity (people)" />
      </label>
      <label className="sgl-form-row">
        Kind
        <select value={kind} onChange={(e) => setKind(e.currentTarget.value as FieldKind)} title={KIND_HELP[kind]}>
          {FIELD_KINDS.map((k) => (
            <option key={k} value={k}>
              {FIELD_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      {kind === 'enum' && (
        <label className="sgl-form-row">
          Choices
          <input value={choices} onChange={(e) => setChoices(e.currentTarget.value)} placeholder="high, medium, low" required />
        </label>
      )}
      <label className="sgl-form-row">
        Default
        {kind === 'boolean' ? (
          <select value={def} onChange={(e) => setDef(e.currentTarget.value)}>
            <option value="">— none</option>
            <option value="true">yes</option>
            <option value="false">no</option>
          </select>
        ) : (
          <input value={def} type={kind === 'number' ? 'number' : 'text'} step="any" onChange={(e) => setDef(e.currentTarget.value)} placeholder="optional" />
        )}
      </label>
      <p className="sgl-help">{KIND_HELP[kind]} The key is the name stored in designs: letters, digits and “_”, starting with a letter.</p>
      <button type="submit" disabled={key.trim() === ''}>
        Add field
      </button>
    </form>
  );
}
