/** Machine-readable category of a validation or command failure. */
export type IssueCode =
  | 'invalid-json'
  | 'unsupported-schema-version'
  | 'schema'
  | 'duplicate-node-id'
  | 'duplicate-grid-cell'
  | 'coordinate-out-of-range'
  | 'too-many-nodes'
  | 'unknown-node-type'
  | 'duplicate-edge-id'
  | 'self-edge'
  | 'dangling-edge'
  | 'duplicate-relationship'
  | 'invalid-edge-geometry'
  | 'unknown-node-position'
  | 'not-found';

export type IssuePath = ReadonlyArray<string | number>;

/** A readable problem located at a path inside the design document. */
export interface GraphIssue {
  readonly path: IssuePath;
  readonly code: IssueCode;
  readonly message: string;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly GraphIssue[] };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = <T = never>(issues: readonly GraphIssue[]): Result<T> => ({
  ok: false,
  issues,
});

export const issue = (path: IssuePath, code: IssueCode, message: string): GraphIssue => ({
  path,
  code,
  message,
});

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
