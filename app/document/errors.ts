import { fail as coreFail, ok as coreOk, type Issue, type IssuePath, type Result as CoreResult } from '@core/graph';

export { formatIssuePath } from '@core/graph';
export type { IssuePath } from '@core/graph';

/** Machine-readable category of a validation or command failure. */
export type IssueCode =
  | 'invalid-json'
  | 'unsupported-schema-version'
  | 'schema'
  | 'duplicate-node-id'
  | 'coordinate-out-of-range'
  | 'too-many-nodes'
  | 'unknown-node-type'
  | 'duplicate-edge-id'
  | 'self-edge'
  | 'dangling-edge'
  | 'duplicate-relationship'
  | 'invalid-edge-geometry'
  | 'unknown-node-position'
  | 'not-found'
  // Room footprints and connectors:
  | 'room-overlap'
  | 'duplicate-display-id'
  | 'too-many-cells'
  | 'route-displacement';

/** A readable problem located at a path inside the design document. */
export type GraphIssue = Issue<IssueCode>;

export type Result<T> = CoreResult<T, GraphIssue>;

export const ok = <T>(value: T): Result<T> => coreOk(value);

export const fail = <T = never>(issues: readonly GraphIssue[]): Result<T> => coreFail(issues);

export const issue = (path: IssuePath, code: IssueCode, message: string): GraphIssue => ({
  path,
  code,
  message,
});
