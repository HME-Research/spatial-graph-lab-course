/** Location of a problem inside a value, e.g. ['edges', 2, 'source']. */
export type IssuePath = ReadonlyArray<string | number>;

/** A readable, machine-categorised problem. `Code` narrows the allowed codes per module. */
export interface Issue<Code extends string = string> {
  readonly path: IssuePath;
  readonly code: Code;
  readonly message: string;
}

/** Outcome of a pure operation: a value, or every issue found. Never thrown. */
export type Result<T, I = Issue> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly I[] };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const fail = <I>(issues: readonly I[]): Result<never, I> => ({ ok: false, issues });

/** Formats a path as e.g. `edges[1].kind`; the empty path is `(document)`. */
export function formatIssuePath(path: IssuePath): string {
  if (path.length === 0) return '(document)';
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else if (/^[A-Za-z_$][\w$]*$/.test(segment)) out += out === '' ? segment : `.${segment}`;
    else out += `[${JSON.stringify(segment)}]`;
  }
  return out;
}
