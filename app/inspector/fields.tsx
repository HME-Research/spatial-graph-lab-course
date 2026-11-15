import { useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  decideTripleCommit,
  parseTypeId,
  tripleKey,
  tripleToDraft,
  type Triple,
  type TripleBounds,
  type TripleDraft,
  type TypeMenu,
} from './propertiesModel';

/**
 * Result of committing a field:
 * - `applied`: the document changed (the field is re-keyed from the new stored value);
 * - `refused`: nothing changed (the host shows why); the draft stays for correction;
 * - `pending`: waiting for the student's confirmation (e.g. a corridor is in the way).
 */
export type CommitOutcome = 'applied' | 'refused' | 'pending';

/** True when focus moves to an element outside `event.currentTarget` (or leaves the page). */
const focusLeaves = (event: FocusEvent<HTMLElement>): boolean =>
  !(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget));

/** Small "i" marker whose tooltip explains a field; also linked as its accessible description. */
export function InfoTip({ id, text }: { readonly id: string; readonly text: string }) {
  return (
    <>
      <span className="sgl-info" title={text} aria-hidden="true">
        i
      </span>
      <span className="sgl-visually-hidden" id={id}>
        {text}
      </span>
    </>
  );
}

/**
 * Three whole-number inputs (position x/y/z or size) edited as ONE value.
 * - Commits on Enter, or when focus leaves the group (tabbing between x, y and z does not commit),
 *   so editing several axes is one command and one undo step. There is no Apply button.
 * - The whole value is validated first: partial input ("", "-", "1.5") is never sent.
 * - Escape restores the stored value. A refused value is not re-sent on blur.
 * Re-key it on the stored value (and on a cancel) to reset the draft.
 */
export function TripleField({
  legend,
  info,
  axes,
  bounds,
  stored,
  onCommit,
  onEscape,
  footer,
}: {
  readonly legend: string;
  readonly info: string;
  /** Short visible axis labels, e.g. ['x', 'y', 'z']. */
  readonly axes: readonly [string, string, string];
  readonly bounds: TripleBounds;
  readonly stored: Triple;
  readonly onCommit: (value: Triple) => CommitOutcome;
  readonly onEscape?: () => void;
  readonly footer?: ReactNode;
}) {
  const [draft, setDraft] = useState<TripleDraft>(() => tripleToDraft(stored));
  const [error, setError] = useState<string | null>(null);
  const lastRefused = useRef<string | null>(null);
  const infoId = useId();
  const errorId = useId();
  const edited = draft.some((d, i) => d !== String(stored[i]));

  const commit = () => {
    const decision = decideTripleCommit(draft, stored, bounds, lastRefused.current);
    switch (decision.kind) {
      case 'unchanged':
        setError(null);
        return;
      case 'invalid':
        setError(decision.message);
        return;
      case 'repeat':
        return;
      case 'send': {
        setError(null);
        const outcome = onCommit(decision.value);
        lastRefused.current = outcome === 'applied' ? null : tripleKey(decision.value);
      }
    }
  };

  const restore = () => {
    setDraft(tripleToDraft(stored));
    setError(null);
    lastRefused.current = null;
    onEscape?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      restore();
    }
  };

  return (
    <fieldset
      className="sgl-section sgl-triple"
      onBlur={(e) => {
        if (focusLeaves(e)) commit();
      }}
    >
      <legend>
        {legend} <InfoTip id={infoId} text={info} />
      </legend>
      <div className="sgl-row">
        {axes.map((axis, i) => (
          <label key={axis} className="sgl-axis">
            {axis}
            <input
              type="number"
              step={1}
              inputMode="numeric"
              value={draft[i]}
              aria-label={`${legend} ${bounds.names[i]}`}
              aria-describedby={error ? `${infoId} ${errorId}` : infoId}
              aria-invalid={error !== null}
              className={draft[i] !== String(stored[i]) ? 'sgl-edited' : undefined}
              onKeyDown={onKeyDown}
              onChange={(e) => {
                const next = [...draft] as [string, string, string];
                next[i] = e.currentTarget.value;
                setDraft(next);
                setError(null);
                lastRefused.current = null;
              }}
            />
          </label>
        ))}
      </div>
      {error ? (
        <p className="sgl-error" id={errorId} role="alert">
          {error}. Press Esc to restore.
        </p>
      ) : (
        edited && <p className="sgl-hint">Press Enter or click elsewhere to apply · Esc to restore</p>
      )}
      {footer}
    </fieldset>
  );
}

const CUSTOM = '\u0000custom';

/**
 * Node-type dropdown. Picking a type applies it at once (one command). The current value is
 * always shown, even when the project does not define it; it changes only when another type is
 * picked. Without a project, "Other type…" allows typing any valid id (Enter / blur applies).
 */
export function TypeSelect({
  current,
  menu,
  onChange,
}: {
  readonly current: string;
  readonly menu: TypeMenu;
  readonly onChange: (typeId: string) => boolean;
}) {
  const [custom, setCustom] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commitCustom = () => {
    if (custom === null) return;
    const parsed = parseTypeId(custom);
    if (!parsed.ok) return setError(parsed.message);
    if (parsed.value === current || onChange(parsed.value)) {
      setCustom(null);
      setError(null);
    }
  };

  return (
    <div className="sgl-type-select">
      <select
        value={custom !== null ? CUSTOM : current}
        aria-label="Room type"
        onChange={(e) => {
          const value = e.currentTarget.value;
          setError(null);
          if (value === CUSTOM) return setCustom('');
          setCustom(null);
          if (value !== current) onChange(value);
        }}
      >
        {menu.options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled && o.value !== current}>
            {o.label}
          </option>
        ))}
        {menu.allowCustom && <option value={CUSTOM}>Other type…</option>}
      </select>
      {custom !== null && (
        <div
          className="sgl-row"
          onBlur={(e) => {
            if (focusLeaves(e)) commitCustom();
          }}
        >
          <input
            autoFocus
            value={custom}
            placeholder="new-type-id"
            aria-label="New room type id"
            spellCheck={false}
            onChange={(e) => {
              setCustom(e.currentTarget.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitCustom();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setCustom(null);
                setError(null);
              }
            }}
          />
        </div>
      )}
      {error && (
        <p className="sgl-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * One text or number value that commits on Enter or blur (no Set button); Escape restores.
 * `onCommit` receives the draft text; it returns false when the value was refused.
 */
export function CommitInput({
  label,
  type,
  stored,
  placeholder,
  onCommit,
}: {
  readonly label: string;
  readonly type: 'text' | 'number';
  /** Draft text of the stored value. */
  readonly stored: string;
  readonly placeholder: string;
  readonly onCommit: (draft: string) => boolean;
}) {
  const [draft, setDraft] = useState(stored);
  const refused = useRef<string | null>(null);
  const commit = () => {
    if (draft === stored || draft === refused.current) return;
    refused.current = onCommit(draft) ? null : draft;
  };
  return (
    <input
      aria-label={label}
      type={type}
      step="any"
      value={draft}
      placeholder={placeholder}
      className={draft !== stored ? 'sgl-edited' : undefined}
      onChange={(e) => {
        setDraft(e.currentTarget.value);
        refused.current = null;
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(stored);
          refused.current = null;
        }
      }}
    />
  );
}
