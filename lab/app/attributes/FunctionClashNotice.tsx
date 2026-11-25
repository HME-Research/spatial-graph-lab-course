import { useState } from 'react';
import type { FunctionClash } from '@app/extensions';
import type { FunctionClashChoice } from '@app/session/projectStore';
import './attributes.css';

export interface FunctionClashItem extends FunctionClash {
  /** The student's function's new name and id (suffixed, e.g. "Gallery 2"). */
  readonly rename: { readonly id: string; readonly label: string };
  /** Rooms using the id in every scenario. */
  readonly rooms: number;
}

/**
 * The warning shown while a project function shares its id with a toolkit function (2026-11-22,
 * owner decision: ask the student). Until they choose, the toolkit's function applies and nothing is
 * saved. Either choice keeps their function under a suffixed name; "Keep mine" also moves their
 * rooms to it in every scenario. Not dismissable: the clash stays until it is settled.
 */
export function FunctionClashNotice({
  clashes,
  onChoose,
}: {
  readonly clashes: readonly FunctionClashItem[];
  /** Returns an error message, or null when the choice was applied. */
  readonly onChoose: (clash: FunctionClashItem, choice: FunctionClashChoice) => string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  if (clashes.length === 0) return null;
  const choose = (clash: FunctionClashItem, choice: FunctionClashChoice) => setError(onChoose(clash, choice));
  const rooms = (n: number) => `${n} node${n === 1 ? '' : 's'}`;
  return (
    <section className="issues sgl-notice sgl-function-clash" role="status" aria-label="Function name clash">
      {clashes.map((c) => (
        <div key={c.id} className="sgl-function-clash-item" data-function={c.id}>
          <p>
            <strong>Two functions share an identifier.</strong> The toolkit now has its own function “{c.toolkitLabel}”, with the same identifier (
            <code>{c.id}</code>) as your function “{c.label}”. Your function will be kept as “{c.rename.label}”.{' '}
            {c.rooms > 0 ? `Which should your ${rooms(c.rooms)} use? Until you choose, they use the toolkit’s.` : 'No nodes use it.'}
          </p>
          <div className="sgl-function-clash-actions">
            {c.rooms > 0 ? (
              <>
                <button type="button" className="sgl-primary" onClick={() => choose(c, 'keep-mine')} title={`Your ${rooms(c.rooms)} move to “${c.rename.label}” in every scenario and look as before (Undo in each scenario).`}>
                  Keep mine (“{c.rename.label}”)
                </button>
                <button type="button" onClick={() => choose(c, 'use-toolkit')} title={`Your ${rooms(c.rooms)} take the toolkit’s “${c.toolkitLabel}”; “${c.rename.label}” stays in Functions, unused.`}>
                  Use the toolkit’s “{c.toolkitLabel}”
                </button>
              </>
            ) : (
              <button type="button" className="sgl-primary" onClick={() => choose(c, 'use-toolkit')}>
                Rename mine to “{c.rename.label}”
              </button>
            )}
          </div>
        </div>
      ))}
      {error && (
        <p className="sgl-dialog-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
