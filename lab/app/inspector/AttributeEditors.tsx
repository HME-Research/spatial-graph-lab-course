import { useMemo, useState, type FormEvent } from 'react';
import { formatJson, type AttributeValue, type GraphIssue } from '@app/document';
import type { AttributeSpecs, ExtensionDiagnostic } from '@app/extensions';
import type { FunctionStatus } from '@app/views/project';
import { CommitInput } from './fields';
import {
  ATTRIBUTE_KIND_LABELS,
  attributesToRows,
  defaultDraftFor,
  rowsToAttributes,
  type AttributeRow,
  type AttributeValueKind,
} from './inspectorModel';
import {
  fieldDraft,
  parseFieldDraft,
  setTypedAttributeCommand,
  setUndeclaredAttributesCommand,
  typedFields,
  undeclaredAttributes,
  type AttributedNode,
  type SetAttributesCommand,
  type TypedField,
} from './typedAttributes';

/** Send one attribute command; false when refused (the panel shows why). */
export type RunAttributes = (command: SetAttributesCommand) => boolean;
type LocalError = (issues: readonly GraphIssue[]) => void;

const localIssue = (path: GraphIssue['path'], message: string): GraphIssue => ({ path, code: 'schema', message });

/** How the active project knows the room's current type. The stored value is never changed here. */
export function TypeStatusNote({ status, functionId }: { status: FunctionStatus; functionId: string; projectId?: string | null }) {
  switch (status.kind) {
    case 'no-project':
    case 'registered':
      return null;
    case 'undefined-type':
      return (
        <p className="sgl-warning">
          ⚠ This project does not offer the function “{functionId}”. The node keeps it (with a fallback colour and façade) until
          you choose another function above, or add it with Edit functions.
        </p>
      );
    case 'broken':
      return (
        <div className="sgl-warning">
          ⚠ The definition of “{functionId}” in <code>{status.file}</code> has errors, so this type is disabled:
          <ul className="sgl-list">
            {status.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      );
  }
}

const SEVERITY_ICON = { error: '✖', warning: '⚠', info: 'ℹ' } as const;

/** Conformance of this room to its project type (never blocks editing). */
export function NodeChecks({ checks }: { checks: readonly ExtensionDiagnostic[] }) {
  // Type problems are explained by the type note; list the rest here.
  const shown = checks.filter((d) => d.code !== 'unknown-node-type' && d.code !== 'broken-node-type');
  if (shown.length === 0) return null;
  return (
    <section className="sgl-section">
      <h4>Checks</h4>
      <ul className="sgl-checks">
        {shown.map((d) => (
          <li key={d.id} className={`sgl-check-${d.severity}`}>
            {SEVERITY_ICON[d.severity]} {d.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

const NO_VALUE = '';
const INVALID_VALUE = '\u0000invalid';

/**
 * Controls generated from the type's attribute declarations. Each change is one validated
 * command that keeps every other stored attribute; defaults are shown as hints, never written.
 */
export function TypedAttributesForm({
  node,
  specs,
  label,
  run,
  onLocalError,
}: {
  node: AttributedNode;
  specs: AttributeSpecs;
  label: string;
  run: RunAttributes;
  onLocalError: LocalError;
}) {
  const fields = typedFields(specs, node.custom);
  const send = (key: string, value: AttributeValue | undefined): boolean => {
    const command = setTypedAttributeCommand(node, specs, key, value);
    if (!command.ok) {
      onLocalError([localIssue(['custom', key], command.message)]);
      return false;
    }
    return run(command.value);
  };
  return (
    <section className="sgl-section">
      <h4>{label} attributes</h4>
      {fields.length === 0 && <p className="meta">This type declares no attributes.</p>}
      {fields.map((field) => (
        <TypedFieldControl key={`${field.key}:${JSON.stringify(field.stored)}`} field={field} send={send} />
      ))}
    </section>
  );
}

function TypedFieldControl({ field, send }: { field: TypedField; send: (key: string, value: AttributeValue | undefined) => boolean }) {
  const { key, spec, status, stored, defaultValue } = field;
  const noValueLabel = `— no value${defaultValue !== undefined ? ` (default ${JSON.stringify(defaultValue)})` : ''}`;
  const choice = (options: readonly (readonly [string, string])[]) => (
    <select
      aria-label={`${key} value`}
      value={status === 'invalid' ? INVALID_VALUE : status === 'missing' ? NO_VALUE : String(stored)}
      onChange={(e) => {
        const v = e.currentTarget.value;
        if (v === INVALID_VALUE) return;
        send(key, v === NO_VALUE ? undefined : parseFieldDraft(spec, v));
      }}
    >
      <option value={NO_VALUE}>{noValueLabel}</option>
      {options.map(([value, text]) => (
        <option key={value} value={value}>
          {text}
        </option>
      ))}
      {status === 'invalid' && (
        <option value={INVALID_VALUE} disabled>
          {JSON.stringify(stored)} (invalid, kept)
        </option>
      )}
    </select>
  );

  let control;
  if (spec.kind === 'enum') control = choice(spec.values.map((v) => [v, v] as const));
  else if (spec.kind === 'boolean') control = choice([['true', 'yes (true)'], ['false', 'no (false)']]);
  else {
    control = (
      <div className="sgl-row">
        <CommitInput
          label={`${key} value`}
          type={spec.kind === 'number' ? 'number' : 'text'}
          stored={fieldDraft(field)}
          placeholder={defaultValue !== undefined ? `default ${JSON.stringify(defaultValue)}` : 'no value'}
          onCommit={(draft) => send(key, parseFieldDraft(spec, draft))}
        />
        {stored !== undefined && (
          <button type="button" title="Remove the stored value (the default applies again)" onClick={() => send(key, undefined)}>
            Clear
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="sgl-typed">
      <div className="sgl-typed-label">
        <code>{key}</code> <span className="sgl-help">{field.accepts}</span>
      </div>
      {control}
      {status === 'invalid' && (
        <p className="sgl-warning">
          ⚠ Stored value {JSON.stringify(stored)} is not valid; it is kept until you change it
          {defaultValue !== undefined ? `, and the default ${JSON.stringify(defaultValue)} is used meanwhile` : ''}.
        </p>
      )}
    </div>
  );
}

/**
 * Free-form attribute rows. With `specs` (a valid registered type) it edits only the attributes
 * the type does not declare, keeping declared values as stored; without, it edits them all.
 * Several rows are edited together, so this form keeps an explicit Save button.
 */
export function AttributesForm({
  node,
  specs,
  run,
  onLocalError,
}: {
  node: AttributedNode;
  specs: AttributeSpecs | null;
  run: RunAttributes;
  onLocalError: LocalError;
}) {
  const initial = useMemo(
    () => attributesToRows(specs ? undeclaredAttributes(specs, node.custom) : node.custom),
    [node.custom, specs],
  );
  const [rows, setRows] = useState<readonly AttributeRow[]>(initial);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const update = (i: number, patch: Partial<AttributeRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (specs) {
      const command = setUndeclaredAttributesCommand(node, specs, rows);
      if (!command.ok) onLocalError([localIssue(['custom'], command.message)]);
      else run(command.value);
      return;
    }
    const parsed = rowsToAttributes(rows);
    if (!parsed.ok) return onLocalError([localIssue(['custom'], parsed.message)]);
    run({ type: 'set-node-custom', nodeId: node.id, custom: parsed.value });
  };

  return (
    <form className="sgl-section" onSubmit={submit}>
      <h4>{specs ? 'Other attributes' : 'Attributes'}</h4>
      {specs && <p className="sgl-help">Not declared by the type. They are kept exactly as stored.</p>}
      {rows.length === 0 && <p className="meta">{specs ? 'None.' : 'No attributes.'}</p>}
      {rows.map((row, i) => (
        <div key={i} className="sgl-attr">
          <input
            className="sgl-attr-key"
            value={row.key}
            placeholder="name"
            aria-label={`Attribute ${i + 1} name`}
            onChange={(e) => update(i, { key: e.currentTarget.value })}
          />
          <select
            value={row.kind}
            aria-label={`Attribute ${i + 1} kind`}
            onChange={(e) => {
              const kind = e.currentTarget.value as AttributeValueKind;
              update(i, { kind, value: defaultDraftFor(kind) });
            }}
          >
            {(Object.keys(ATTRIBUTE_KIND_LABELS) as AttributeValueKind[]).map((k) => (
              <option key={k} value={k}>
                {ATTRIBUTE_KIND_LABELS[k]}
              </option>
            ))}
          </select>
          {row.kind === 'boolean' ? (
            <select value={row.value} aria-label={`Attribute ${i + 1} value`} onChange={(e) => update(i, { value: e.currentTarget.value })}>
              <option value="true">yes</option>
              <option value="false">no</option>
            </select>
          ) : (
            <input
              className="sgl-attr-value"
              type={row.kind === 'number' ? 'number' : 'text'}
              value={row.kind === 'none' ? '' : row.value}
              disabled={row.kind === 'none'}
              placeholder={row.kind === 'none' ? 'null' : 'value'}
              aria-label={`Attribute ${i + 1} value`}
              onChange={(e) => update(i, { value: e.currentTarget.value })}
            />
          )}
          <button
            type="button"
            className="sgl-icon"
            title="Remove attribute"
            aria-label={`Remove attribute ${row.key || i + 1}`}
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <div className="sgl-buttons">
        <button type="button" onClick={() => setRows([...rows, { key: '', kind: 'text', value: '' }])}>
          + Add attribute
        </button>
        <button type="submit" disabled={!dirty}>
          Save attributes
        </button>
        {dirty && (
          <button type="button" className="sgl-link" onClick={() => setRows(initial)}>
            Reset
          </button>
        )}
      </div>
    </form>
  );
}

/** The selected item exactly as stored in the document (read-only). */
export function StoredData({ record, diagramPosition }: { readonly record: object; readonly diagramPosition?: readonly number[] | null }) {
  return (
    <details className="sgl-section sgl-data">
      <summary>Stored data</summary>
      {diagramPosition !== undefined && (
        <p className="sgl-help">
          Diagram position (Graph 2D only; never moves the room): {diagramPosition ? `[${diagramPosition.join(', ')}]` : 'none'}
        </p>
      )}
      <pre>{formatJson(record)}</pre>
    </details>
  );
}
