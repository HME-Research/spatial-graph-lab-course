import { useState, type FormEvent } from 'react';
import type { ProjectFunction } from '@app/project';
import { Dialog } from '@app/ui/Dialog';
import { functionNameProblem, functionRows, generateFunctionId, type FunctionRow } from './attributeList';

/**
 * The Functions pop-up (UI refinement 2026-11-17): add, rename and remove the functions (node
 * types) a project offers.
 * - Toolkit functions come from the toolkit. They cannot be renamed here; removing
 *   one only hides it in this project (it can be restored).
 * - Project functions are stored in the project file (`settings.functions`): their name can be
 *   changed at any time; their identifier never changes, so nodes keep their function.
 * - A function used by a node in any scenario cannot be removed (nothing is ever reassigned).
 * Changes are saved with the project immediately; they are not part of Undo.
 */
export function FunctionsDialog({
  toolkitTypes,
  projectFunctions,
  hidden,
  usedTypeIds,
  onChange,
  onClose,
}: {
  /** The toolkit's valid types, in its order (hidden ones included). */
  readonly toolkitTypes: readonly { readonly id: string; readonly label: string }[];
  readonly projectFunctions: readonly ProjectFunction[];
  /** Toolkit function ids removed from this project. */
  readonly hidden: readonly string[];
  /** The function of every node of every scenario (with repeats). */
  readonly usedTypeIds: readonly string[];
  readonly onChange: (functions: readonly ProjectFunction[], hidden: readonly string[]) => void;
  readonly onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ readonly id: string; readonly label: string } | null>(null);
  const hiddenSet = new Set(hidden);
  const all = functionRows(toolkitTypes, projectFunctions, usedTypeIds);
  const shown = all.filter((r) => !(r.fromToolkit && hiddenSet.has(r.id)));
  const removedToolkit = all.filter((r) => r.fromToolkit && hiddenSet.has(r.id));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const problem = functionNameProblem(name, shown);
    if (problem) return setError(problem);
    const label = name.trim().replace(/\s+/g, ' ');
    // Never reuse the id of any toolkit function (hidden ones included) or project function.
    const id = generateFunctionId(label, all.map((r) => r.id));
    onChange([...projectFunctions, { id, label }], hidden);
    setName('');
    setError(null);
  };

  const remove = (row: FunctionRow) => {
    if (row.used > 0) return;
    if (row.fromToolkit) onChange(projectFunctions, [...hidden, row.id]);
    else onChange(projectFunctions.filter((f) => f.id !== row.id), hidden);
  };

  const commitRename = () => {
    if (!renaming) return;
    const problem = functionNameProblem(renaming.label, shown, renaming.id);
    if (problem) return setError(problem);
    const label = renaming.label.trim().replace(/\s+/g, ' ');
    onChange(projectFunctions.map((f) => (f.id === renaming.id ? { ...f, label } : f)), hidden);
    setRenaming(null);
    setError(null);
  };

  const plural = (n: number) => `${n} node${n === 1 ? '' : 's'}`;

  return (
    <Dialog
      title="Functions"
      lead="Every node has one function. Add the functions your project needs; remove the ones it does not."
      onClose={onClose}
      dialogId="functions"
      closeOnBackdrop
      footer={
        <button type="button" className="sgl-primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <form className="sgl-function-add" onSubmit={add}>
        <input
          type="text"
          data-autofocus
          aria-label="New function name"
          placeholder="New function, e.g. Reading room"
          value={name}
          maxLength={80}
          onChange={(e) => {
            setName(e.currentTarget.value);
            setError(null);
          }}
        />
        <button type="submit" className="sgl-primary" disabled={name.trim() === ''}>
          Add
        </button>
      </form>
      {error && (
        <p className="sgl-dialog-error" role="alert">
          {error}
        </p>
      )}
      <ul className="sgl-function-list" aria-label="Functions of this project">
        {shown.length === 0 && <li className="sgl-dialog-hint">No functions yet. Add one above.</li>}
        {shown.map((row) => (
          <li key={row.id} className="sgl-function-row" data-function={row.id}>
            {renaming?.id === row.id ? (
              <input
                type="text"
                autoFocus
                aria-label={`New name for ${row.label}`}
                value={renaming.label}
                maxLength={80}
                onChange={(e) => setRenaming({ id: row.id, label: e.currentTarget.value })}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename();
                  }
                  if (e.key === 'Escape') {
                    // Cancel the rename only; the dialog stays open.
                    e.preventDefault();
                    setRenaming(null);
                    setError(null);
                  }
                }}
              />
            ) : (
              <span className="sgl-function-name">{row.label}</span>
            )}
            <span className="sgl-function-meta">
              {row.fromToolkit && <span className="sgl-attr-type" title="Defined by the toolkit">Toolkit</span>}
              <span className="sgl-function-used">{row.used > 0 ? plural(row.used) : 'unused'}</span>
            </span>
            <span className="sgl-function-actions">
              {!row.fromToolkit && renaming?.id !== row.id && (
                <button type="button" className="sgl-icon-action" onClick={() => setRenaming({ id: row.id, label: row.label })} aria-label={`Rename ${row.label}`} title="Rename">
                  <PencilIcon />
                </button>
              )}
              <button
                type="button"
                className="sgl-icon-action"
                disabled={row.used > 0}
                onClick={() => remove(row)}
                aria-label={`Remove ${row.label}`}
                title={row.used > 0 ? `Used by ${plural(row.used)} in this project. Give them another function first.` : row.fromToolkit ? 'Remove from this project (can be restored)' : 'Remove'}
              >
                <TrashIcon />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {removedToolkit.length > 0 && (
        <div className="sgl-function-removed">
          <span className="sgl-dialog-hint">Removed toolkit functions:</span>
          {removedToolkit.map((r) => (
            <button key={r.id} type="button" className="sgl-link" onClick={() => onChange(projectFunctions, hidden.filter((h) => h !== r.id))} title={`Offer ${r.label} again`}>
              Restore {r.label}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3 13l.6-2.6L10.5 3.5l2 2-6.9 6.9L3 13z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function HideIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M4 8h8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
