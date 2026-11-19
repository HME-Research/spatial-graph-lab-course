import { useId, useMemo, useState, type FormEvent } from 'react';
import {
  FIELD_KINDS,
  type AttributeCollection,
  type AttributeField,
  type DefaultValue,
  type DesignSample,
  type FieldKind,
  type ProjectAttributeSchema,
  type SchemaEdit,
} from '@app/extensions';
import type { CatalogueMetric, EnabledMetricIds } from '@app/metrics';
import { Dialog } from '@app/ui/Dialog';
import {
  attributeNameProblem,
  availableCalculated,
  generateAttributeKey,
  keyHasIncompatibleValues,
  metricValueText,
  storedValueCount,
  storedValueText,
  TYPE_HELP,
  TYPE_LABELS,
} from './attributeList';
import { parseChoices, parseValueDraft } from './attributesModel';

/**
 * Compact dialogs of the Attributes panel (UI refinement 2026-11-17). Node and Edge use the same
 * dialogs; only the content differs. Every dialog validates before it applies anything, and one
 * Save is one step of the attribute Undo history.
 */

/** Applies edits as one attribute-history step; returns a refusal message, or null when applied. */
export type ApplyEdits = (edits: readonly SchemaEdit[], label: string) => string | null;

const NOUN: Readonly<Record<AttributeCollection, string>> = { nodes: 'node', edges: 'edge' };

/** Engine refusal text in student vocabulary (attribute / type), as one sentence. */
export function studentMessage(reason: string): string {
  const text = reason
    .replace(/\bfields\b/g, 'attributes')
    .replace(/\bfield\b/g, 'attribute')
    .replace(/\bkinds\b/g, 'types')
    .replace(/\bkind\b/g, 'type')
    .replace(/\bchoice attribute needs at least one value\b/, 'choice attribute needs at least one option');
  const sentence = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

// ── Draft of a custom attribute (shared by Add and Edit) ───────────────────────────────────────

interface Draft {
  readonly name: string;
  readonly kind: FieldKind;
  readonly options: string;
  readonly defaultDraft: string;
  readonly description: string;
  readonly min: string;
  readonly max: string;
}

const emptyDraft: Draft = { name: '', kind: 'text', options: '', defaultDraft: '', description: '', min: '', max: '' };

const draftOf = (field: AttributeField): Draft => ({
  name: field.label,
  kind: field.kind,
  options: (field.values ?? []).join(', '),
  defaultDraft: field.default === undefined ? '' : String(field.default),
  description: field.description ?? '',
  min: field.min === undefined ? '' : String(field.min),
  max: field.max === undefined ? '' : String(field.max),
});

interface ParsedDraft {
  readonly name: string;
  readonly kind: FieldKind;
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly default?: DefaultValue;
  readonly description: string;
}

/** Parse and validate a draft (null `selfId` for a new attribute). */
function parseDraft(draft: Draft, collection: AttributeCollection, schema: ProjectAttributeSchema, selfId?: string): { ok: true; value: ParsedDraft } | { ok: false; message: string } {
  const nameProblem = attributeNameProblem(draft.name, collection, schema, selfId);
  if (nameProblem) return { ok: false, message: nameProblem };
  const name = draft.name.trim().replace(/\s+/g, ' ');
  let values: string[] | undefined;
  if (draft.kind === 'enum') {
    values = parseChoices(draft.options);
    if (values.length === 0) return { ok: false, message: 'A Choice attribute needs at least one option.' };
    if (new Set(values).size !== values.length) return { ok: false, message: 'Each option must appear only once.' };
  }
  let min: number | undefined;
  let max: number | undefined;
  if (draft.kind === 'number') {
    for (const [text, set] of [
      [draft.min, (n: number) => (min = n)],
      [draft.max, (n: number) => (max = n)],
    ] as const) {
      if (text.trim() === '') continue;
      const n = Number(text);
      if (!Number.isFinite(n)) return { ok: false, message: 'The range must be numbers.' };
      set(n);
    }
    if (min !== undefined && max !== undefined && min > max) return { ok: false, message: 'The smallest value is larger than the largest value.' };
  }
  const parsed = parseValueDraft({ kind: draft.kind, ...(values && { values }), ...(min !== undefined && { min }), ...(max !== undefined && { max }), label: name }, draft.defaultDraft);
  if (!parsed.ok) return { ok: false, message: `Default: ${parsed.message.replace(/^“[^”]*” /, 'the value ')}.` };
  return {
    ok: true,
    value: {
      name,
      kind: draft.kind,
      ...(values && { values }),
      ...(min !== undefined && { min }),
      ...(max !== undefined && { max }),
      ...(parsed.value !== undefined && { default: parsed.value }),
      description: draft.description.trim(),
    },
  };
}

/** A typed input for a default value: a select for Yes/No and Choice, else a text/number field. */
function DefaultInput({ id, kind, options, value, onChange, placeholder }: { id: string; kind: FieldKind; options: readonly string[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  if (kind === 'boolean' || kind === 'enum') {
    const choices = kind === 'boolean' ? ([['true', 'Yes'], ['false', 'No']] as const) : options.map((o) => [o, o] as const);
    return (
      <select id={id} value={value} onChange={(e) => onChange(e.currentTarget.value)}>
        <option value="">{placeholder ?? 'No default'}</option>
        {choices.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input id={id} type={kind === 'number' ? 'number' : 'text'} step="any" value={value} placeholder={placeholder ?? 'No default'} onChange={(e) => onChange(e.currentTarget.value)} />
  );
}

/** The form body of a custom attribute: Name, Type, Options, Default, Range, Description. */
function CustomFields({ draft, setDraft, typeLocked = false }: { draft: Draft; setDraft: (d: Draft) => void; typeLocked?: boolean }) {
  const id = useId();
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const options = parseChoices(draft.options);
  return (
    <div className="sgl-dialog-form">
      <label className="sgl-dialog-field" htmlFor={`${id}-name`}>
        <span>Name</span>
        <input id={`${id}-name`} data-autofocus type="text" value={draft.name} maxLength={80} onChange={(e) => set({ name: e.currentTarget.value })} placeholder="e.g. Floor finish" autoComplete="off" />
      </label>
      <label className="sgl-dialog-field" htmlFor={`${id}-type`}>
        <span>Type</span>
        <select
          id={`${id}-type`}
          value={draft.kind}
          disabled={typeLocked}
          title={TYPE_HELP[draft.kind]}
          onChange={(e) => set({ kind: e.currentTarget.value as FieldKind, defaultDraft: '' })}
        >
          {FIELD_KINDS.map((k) => (
            <option key={k} value={k}>
              {TYPE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      {draft.kind === 'enum' && (
        <label className="sgl-dialog-field" htmlFor={`${id}-options`}>
          <span>Options</span>
          <input id={`${id}-options`} type="text" value={draft.options} onChange={(e) => set({ options: e.currentTarget.value })} placeholder="high, medium, low" aria-describedby={`${id}-options-help`} />
          <small id={`${id}-options-help`} className="sgl-dialog-hint">
            Separate options with commas.
          </small>
        </label>
      )}
      <label className="sgl-dialog-field" htmlFor={`${id}-default`}>
        <span>
          Default <span className="sgl-dialog-optional">optional</span>
        </span>
        <DefaultInput id={`${id}-default`} kind={draft.kind} options={options} value={draft.defaultDraft} onChange={(v) => set({ defaultDraft: v })} />
      </label>
      {draft.kind === 'number' && (
        <div className="sgl-dialog-field">
          <span id={`${id}-range`}>
            Range <span className="sgl-dialog-optional">optional</span>
          </span>
          <div className="sgl-dialog-range" role="group" aria-labelledby={`${id}-range`}>
            <input type="number" step="any" aria-label="Smallest value" placeholder="min" value={draft.min} onChange={(e) => set({ min: e.currentTarget.value })} />
            <span aria-hidden="true">–</span>
            <input type="number" step="any" aria-label="Largest value" placeholder="max" value={draft.max} onChange={(e) => set({ max: e.currentTarget.value })} />
          </div>
        </div>
      )}
      <label className="sgl-dialog-field" htmlFor={`${id}-description`}>
        <span>
          Description <span className="sgl-dialog-optional">optional</span>
        </span>
        <textarea id={`${id}-description`} rows={2} value={draft.description} onChange={(e) => set({ description: e.currentTarget.value })} placeholder="Shown as a hint in Properties" />
      </label>
    </div>
  );
}

function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p className="sgl-dialog-error" role="alert">
      {message}
    </p>
  ) : null;
}

// ── Add attribute ───────────────────────────────────────────────────────────────────────────

export function AddAttributeDialog({
  collection,
  schema,
  samples,
  enabledMetrics,
  apply,
  onAddCalculated,
  onClose,
}: {
  readonly collection: AttributeCollection;
  readonly schema: ProjectAttributeSchema;
  readonly samples: readonly DesignSample[];
  readonly enabledMetrics: EnabledMetricIds;
  readonly apply: ApplyEdits;
  /** null when calculated attributes cannot be changed here (read-only list). */
  readonly onAddCalculated: ((metricId: string) => void) | null;
  readonly onClose: () => void;
}) {
  const [step, setStep] = useState<'choose' | 'custom' | 'calculated'>('choose');
  const noun = NOUN[collection];
  if (step === 'custom') return <AddCustom collection={collection} schema={schema} samples={samples} apply={apply} onBack={() => setStep('choose')} onClose={onClose} />;
  if (step === 'calculated' && onAddCalculated) {
    return <AddCalculated collection={collection} enabledMetrics={enabledMetrics} onAdd={onAddCalculated} onBack={() => setStep('choose')} onClose={onClose} />;
  }
  return (
    <Dialog title="Add attribute" lead={`Every ${noun} of every scenario gets the new attribute.`} onClose={onClose} dialogId="add-attribute" closeOnBackdrop>
      <div className="sgl-choice-list" role="group" aria-label="Kind of attribute">
        <button type="button" className="sgl-choice" data-autofocus onClick={() => setStep('custom')} data-choice="custom">
          <span className="sgl-choice-title">Custom attribute</span>
          <span className="sgl-choice-text">Define an attribute whose values students can edit.</span>
        </button>
        <button
          type="button"
          className="sgl-choice"
          onClick={() => setStep('calculated')}
          data-choice="calculated"
          disabled={!onAddCalculated}
          title={onAddCalculated ? undefined : 'Calculated attributes cannot be changed here'}
        >
          <span className="sgl-choice-title">Calculated attribute</span>
          <span className="sgl-choice-text">Add one of the available read-only calculations.</span>
        </button>
      </div>
    </Dialog>
  );
}

function AddCustom({
  collection,
  schema,
  samples,
  apply,
  onBack,
  onClose,
}: {
  collection: AttributeCollection;
  schema: ProjectAttributeSchema;
  samples: readonly DesignSample[];
  apply: ApplyEdits;
  onBack: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseDraft(draft, collection, schema);
  const key = parsed.ok
    ? generateAttributeKey(parsed.value.name, schema, collection, (k) =>
        keyHasIncompatibleValues(samples, collection, k, { kind: parsed.value.kind, ...(parsed.value.values && { values: parsed.value.values }), ...(parsed.value.min !== undefined && { min: parsed.value.min }), ...(parsed.value.max !== undefined && { max: parsed.value.max }) }),
      )
    : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.ok || key === null) return setError(parsed.ok ? 'Enter a name.' : parsed.message);
    const v = parsed.value;
    const refused = apply(
      [
        {
          type: 'add-field',
          collection,
          field: {
            key,
            label: v.name,
            kind: v.kind,
            ...(v.values && { values: v.values }),
            ...(v.min !== undefined && { min: v.min }),
            ...(v.max !== undefined && { max: v.max }),
            ...(v.default !== undefined && { default: v.default }),
            ...(v.description !== '' && { description: v.description }),
          },
        },
      ],
      `Add attribute “${v.name}”`,
    );
    if (refused) setError(studentMessage(refused));
    else onClose();
  };
  return (
    <Dialog
      title="New custom attribute"
      onClose={onClose}
      dialogId="add-custom-attribute"
      footer={
        <>
          <button type="button" onClick={onBack}>
            Back
          </button>
          <button type="submit" form="sgl-add-custom" className="sgl-primary">
            Add attribute
          </button>
        </>
      }
    >
      <form id="sgl-add-custom" onSubmit={submit} noValidate>
        <CustomFields draft={draft} setDraft={(d) => (setDraft(d), setError(null))} />
        <details className="sgl-dialog-advanced">
          <summary>Advanced</summary>
          <p className="sgl-dialog-hint">
            Identifier: <code>{key ?? '—'}</code>. Made from the name; algorithms use it. It does not change when the name changes later.
          </p>
        </details>
        <ErrorLine message={error} />
      </form>
    </Dialog>
  );
}

function AddCalculated({
  collection,
  enabledMetrics,
  onAdd,
  onBack,
  onClose,
}: {
  collection: AttributeCollection;
  enabledMetrics: EnabledMetricIds;
  onAdd: (metricId: string) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const all = useMemo(() => availableCalculated(collection, enabledMetrics), [collection, enabledMetrics]);
  const shown = availableCalculated(collection, enabledMetrics, query);
  const [chosen, setChosen] = useState<string | null>(all[0]?.id ?? null);
  const selected = shown.find((m) => m.id === chosen) ?? null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    onAdd(selected.id);
    onClose();
  };
  return (
    <Dialog
      title="Add calculated attribute"
      lead="Calculated attributes are worked out from each scenario. They are read-only."
      onClose={onClose}
      dialogId="add-calculated-attribute"
      footer={
        <>
          <button type="button" onClick={onBack}>
            Back
          </button>
          <button type="submit" form="sgl-add-calculated" className="sgl-primary" disabled={!selected}>
            Add attribute
          </button>
        </>
      }
    >
      <form id="sgl-add-calculated" onSubmit={submit}>
        {all.length === 0 ? (
          <p className="sgl-dialog-hint">Every calculated attribute for this list is already shown.</p>
        ) : (
          <>
            {all.length > 4 && (
              <input
                type="search"
                className="sgl-dialog-search"
                data-autofocus
                aria-label="Search calculated attributes"
                placeholder="Search"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
            )}
            <div className="sgl-metric-options" role="radiogroup" aria-label="Calculated attributes">
              {shown.length === 0 && <p className="sgl-dialog-hint">Nothing matches “{query}”.</p>}
              {shown.map((m, i) => (
                <label key={m.id} className={`sgl-metric-option${chosen === m.id ? ' is-selected' : ''}`} data-metric={m.id}>
                  <input
                    type="radio"
                    name={`${id}-metric`}
                    value={m.id}
                    checked={chosen === m.id}
                    onChange={() => setChosen(m.id)}
                    {...(all.length <= 4 && i === 0 && { 'data-autofocus': true })}
                  />
                  <span className="sgl-metric-option-text">
                    <span className="sgl-metric-option-name">
                      {m.label} <span className="sgl-attr-type">{metricValueText(m)}</span>
                    </span>
                    <span className="sgl-metric-option-help">{m.definition}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </form>
    </Dialog>
  );
}

// ── Edit a custom attribute ─────────────────────────────────────────────────────────────────

export function EditAttributeDialog({
  collection,
  schema,
  field,
  samples,
  functions,
  references,
  apply,
  onDelete,
  deleteBlocked,
  onClose,
}: {
  readonly collection: AttributeCollection;
  readonly schema: ProjectAttributeSchema;
  readonly field: AttributeField;
  readonly samples: readonly DesignSample[];
  /** Functions offered for per-function defaults (nodes only). */
  readonly functions: readonly { readonly id: string; readonly label: string }[];
  /** Algorithm files that may read this attribute (heuristic). */
  readonly references: readonly string[];
  readonly apply: ApplyEdits;
  readonly onDelete: () => void;
  /** Why this attribute cannot be deleted (a toolkit attribute, P4); Delete is then disabled. */
  readonly deleteBlocked?: string | null;
  readonly onClose: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<Draft>(() => draftOf(field));
  const ownTypeDefaults = useMemo(
    () => new Map(Object.entries(schema.nodeTypeDefaults).flatMap(([t, d]) => (Object.prototype.hasOwnProperty.call(d, field.id) ? [[t, String(d[field.id])] as const] : []))),
    [schema, field.id],
  );
  const [typeDefaults, setTypeDefaults] = useState<ReadonlyMap<string, string>>(ownTypeDefaults);
  const [key, setKey] = useState(field.key);
  const [error, setError] = useState<string | null>(null);
  const [confirmType, setConfirmType] = useState(false);
  const usage = storedValueCount(field, collection, samples);
  const kindChanged = draft.kind !== field.kind;
  const index = schema[collection].findIndex((f) => f.id === field.id);
  const count = schema[collection].length;

  const buildEdits = (): { edits: SchemaEdit[]; name: string } | { error: string } => {
    const parsed = parseDraft(draft, collection, schema, field.id);
    if (!parsed.ok) return { error: parsed.message };
    const v = parsed.value;
    const base = { collection, fieldId: field.id } as const;
    const edits: SchemaEdit[] = [];
    if (v.name !== field.label) edits.push({ type: 'update-field', ...base, patch: { label: v.name } });
    if (v.description !== (field.description ?? '')) edits.push({ type: 'update-field', ...base, patch: { description: v.description === '' ? null : v.description } });
    // Per-function defaults: parsed against the NEW shape; cleared first, set after the shape change.
    const typeEdits: { clear: SchemaEdit[]; set: SchemaEdit[] } = { clear: [], set: [] };
    if (collection === 'nodes') {
      for (const [functionId] of ownTypeDefaults) {
        if (kindChanged || !typeDefaults.has(functionId) || typeDefaults.get(functionId) === '') typeEdits.clear.push({ type: 'set-type-default', function: functionId, fieldId: field.id, value: null });
      }
      for (const [functionId, text] of typeDefaults) {
        if (text === '' || (!kindChanged && ownTypeDefaults.get(functionId) === text)) continue;
        const p = parseValueDraft({ kind: v.kind, ...(v.values && { values: v.values }), ...(v.min !== undefined && { min: v.min }), ...(v.max !== undefined && { max: v.max }), label: v.name }, text);
        if (!p.ok) return { error: `Default for ${functions.find((f) => f.id === functionId)?.label ?? functionId}: ${p.message.replace(/^“[^”]*” /, 'the value ')}.` };
        if (p.value !== undefined) typeEdits.set.push({ type: 'set-type-default', function: functionId, fieldId: field.id, value: p.value });
      }
    }
    edits.push(...typeEdits.clear);
    if (kindChanged) {
      if (field.default !== undefined) edits.push({ type: 'update-field', ...base, patch: { default: null } });
      edits.push({ type: 'change-field-kind', ...base, kind: v.kind, ...(v.values && { values: v.values }), ...(v.min !== undefined && { min: v.min }), ...(v.max !== undefined && { max: v.max }) });
      if (v.default !== undefined) edits.push({ type: 'update-field', ...base, patch: { default: v.default } });
    } else {
      const patch: Record<string, unknown> = {};
      if (v.kind === 'enum' && (v.values ?? []).join('\u0000') !== (field.values ?? []).join('\u0000')) patch['values'] = v.values;
      if (v.kind === 'number') {
        if (v.min !== field.min) patch['min'] = v.min ?? null;
        if (v.max !== field.max) patch['max'] = v.max ?? null;
      }
      if (v.default !== field.default) patch['default'] = v.default ?? null;
      if (Object.keys(patch).length > 0) edits.push({ type: 'update-field', ...base, patch });
    }
    edits.push(...typeEdits.set);
    if (key.trim() !== field.key) edits.push({ type: 'rename-field', ...base, key: key.trim() });
    return { edits, name: v.name };
  };

  const save = (confirmed: boolean) => {
    const built = buildEdits();
    if ('error' in built) return setError(built.error);
    if (built.edits.length === 0) return onClose();
    if (kindChanged && usage.total > 0 && !confirmed) return setConfirmType(true);
    const refused = apply(built.edits, `Edit attribute “${built.name}”`);
    if (refused) {
      setConfirmType(false);
      setError(studentMessage(refused));
    } else onClose();
  };

  const move = (to: number) => {
    const refused = apply([{ type: 'move-field', collection, fieldId: field.id, toIndex: to }], `Move attribute “${field.label}”`);
    if (refused) setError(studentMessage(refused));
  };

  if (confirmType) {
    return (
      <Dialog
        title={`Change the type of “${field.label}”?`}
        onClose={onClose}
        dialogId="confirm-attribute-type"
        footer={
          <>
            <button type="button" data-autofocus onClick={() => setConfirmType(false)}>
              Back
            </button>
            <button type="button" className="sgl-danger" onClick={() => save(true)}>
              Change type
            </button>
          </>
        }
      >
        <ul className="sgl-dialog-list">
          <li>
            From {TYPE_LABELS[field.kind]} to {TYPE_LABELS[draft.kind]}, for every {NOUN[collection]} in every scenario.
          </li>
          <li>Stored: {storedValueText(usage)}. Values are never converted. If any of them would not fit the new type, the change is refused and nothing is lost.</li>
          {collection === 'nodes' && ownTypeDefaults.size > 0 && <li>Its defaults per function are removed.</li>}
          <li>Undo (↶ in the Attributes panel) reverses it.</li>
        </ul>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Edit attribute"
      onClose={onClose}
      dialogId="edit-attribute"
      footer={
        <>
          {deleteBlocked ? (
            <span className="sgl-dialog-footer-start" title={deleteBlocked}>
              <button type="button" className="sgl-danger" disabled aria-describedby={`${id}-delete-blocked`}>
                Delete…
              </button>
              <span className="sgl-visually-hidden" id={`${id}-delete-blocked`}>
                {deleteBlocked}
              </span>
            </span>
          ) : (
            <button type="button" className="sgl-danger sgl-dialog-footer-start" onClick={onDelete}>
              Delete…
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="sgl-edit-attribute" className="sgl-primary">
            Save
          </button>
        </>
      }
    >
      <form
        id="sgl-edit-attribute"
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        noValidate
      >
        <CustomFields
          draft={draft}
          setDraft={(d) => {
            // Per-function defaults belong to one type: a type change starts them empty.
            if (d.kind !== draft.kind) setTypeDefaults(d.kind === field.kind ? ownTypeDefaults : new Map());
            setDraft(d);
            setError(null);
          }}
        />
        <p className="sgl-dialog-hint">Stored: {storedValueText(usage)}.</p>
        {kindChanged && <p className="sgl-dialog-note">Changing the type is checked against every stored value before it is applied.</p>}
        {collection === 'nodes' && functions.length > 0 && (
          <details className="sgl-dialog-advanced" open={ownTypeDefaults.size > 0 && !kindChanged}>
            <summary>Default per function</summary>
            <div className="sgl-dialog-form">
              {functions.map((f) => (
                <label key={f.id} className="sgl-dialog-field sgl-dialog-field-inline" htmlFor={`${id}-td-${f.id}`}>
                  <span>{f.label}</span>
                  <DefaultInput
                    id={`${id}-td-${f.id}`}
                    kind={draft.kind}
                    options={parseChoices(draft.options)}
                    value={typeDefaults.get(f.id) ?? ''}
                    placeholder={`Default (${draft.defaultDraft === '' ? 'none' : draft.defaultDraft})`}
                    onChange={(v) => setTypeDefaults(new Map(typeDefaults).set(f.id, v))}
                  />
                </label>
              ))}
            </div>
          </details>
        )}
        <details className="sgl-dialog-advanced">
          <summary>Advanced</summary>
          <label className="sgl-dialog-field" htmlFor={`${id}-key`}>
            <span>Identifier</span>
            <input id={`${id}-key`} type="text" value={key} onChange={(e) => setKey(e.currentTarget.value)} spellCheck={false} autoComplete="off" />
            <small className="sgl-dialog-hint">
              Used by algorithms and in exported files. Changing it keeps every stored value.
              {references.length > 0 && <strong> Algorithm code may use “{field.key}” ({references.join(', ')}); it is not changed automatically.</strong>}
              {(field.formerKeys ?? []).length > 0 && <> Earlier identifiers, still read: {field.formerKeys!.join(', ')}.</>}
            </small>
          </label>
          <div className="sgl-dialog-row">
            <span className="sgl-dialog-hint">Position in the list</span>
            <button type="button" disabled={index <= 0} onClick={() => move(index - 1)} aria-label={`Move ${field.label} up`}>
              ↑
            </button>
            <button type="button" disabled={index < 0 || index >= count - 1} onClick={() => move(index + 1)} aria-label={`Move ${field.label} down`}>
              ↓
            </button>
          </div>
        </details>
        <ErrorLine message={error} />
      </form>
    </Dialog>
  );
}

// ── Delete a custom attribute ───────────────────────────────────────────────────────────────

export function DeleteAttributeDialog({
  collection,
  field,
  samples,
  hasTypeDefaults,
  references,
  apply,
  onClose,
}: {
  readonly collection: AttributeCollection;
  readonly field: AttributeField;
  readonly samples: readonly DesignSample[];
  readonly hasTypeDefaults: boolean;
  readonly references: readonly string[];
  readonly apply: ApplyEdits;
  readonly onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const usage = storedValueCount(field, collection, samples);
  return (
    <Dialog
      title={`Delete attribute “${field.label}”?`}
      onClose={onClose}
      dialogId="delete-attribute"
      footer={
        <>
          <button type="button" data-autofocus onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="sgl-danger"
            onClick={() => {
              const refused = apply([{ type: 'delete-field', collection, fieldId: field.id }], `Delete attribute “${field.label}”`);
              if (refused) setError(studentMessage(refused));
              else onClose();
            }}
          >
            Delete attribute
          </button>
        </>
      }
    >
      <ul className="sgl-dialog-list">
        <li>It is removed from every {NOUN[collection]} in every scenario of this project.</li>
        <li>
          Values entered: {storedValueText(usage)}.
          {usage.total > 0 && ' They are no longer shown or used, but stay in the scenarios: adding an attribute with the same name and type shows them again.'}
        </li>
        {hasTypeDefaults && <li>Its defaults per function are removed.</li>}
        {references.length > 0 && <li>Algorithm code may use it ({references.join(', ')}). The code is not changed.</li>}
        <li>Undo (↶ in the Attributes panel) brings it back.</li>
      </ul>
      <ErrorLine message={error} />
    </Dialog>
  );
}

// ── Information on a required or calculated attribute ───────────────────────────────────────

export function AttributeInfoDialog({
  name,
  typeText,
  text,
  calculated,
  section = 'Required',
  noun,
  onRemove,
  onClose,
}: {
  readonly name: string;
  readonly typeText: string;
  readonly text: string;
  /** A calculated attribute: explains read-only values and offers removal from the list. */
  readonly calculated?: CatalogueMetric;
  /** The section title of a built-in attribute (P4): Identity, Required by the app, Geometry. */
  readonly section?: string;
  /** Who has the attribute: 'node' or 'edge' (default: from the name). */
  readonly noun?: 'node' | 'edge';
  readonly onRemove?: () => void;
  readonly onClose: () => void;
}) {
  return (
    <Dialog
      title={name}
      lead={calculated ? `Calculated · ${typeText}` : `${typeText} · ${section}`}
      onClose={onClose}
      dialogId="attribute-info"
      closeOnBackdrop
      footer={
        <>
          {calculated && onRemove && (
            <button type="button" className="sgl-dialog-footer-start" onClick={onRemove}>
              Remove from list
            </button>
          )}
          <button type="button" className="sgl-primary" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <p className="sgl-dialog-text">{text}</p>
      {calculated ? (
        <p className="sgl-dialog-hint">
          Worked out from each scenario; it cannot be typed in. Removing it from the list only hides it here, in Properties and in Colour by. The calculation stays available to algorithms and can be added again.
        </p>
      ) : (
        <p className="sgl-dialog-hint">Every {noun ?? (name === 'Relationship' ? 'edge' : 'node')} has this attribute. It cannot be removed.</p>
      )}
    </Dialog>
  );
}

