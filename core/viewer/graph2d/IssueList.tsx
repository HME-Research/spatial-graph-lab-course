import { formatIssuePath, type GraphIssue } from '../../graph';

/** Readable list of rejected-command issues. The document was not changed when these are shown. */
export function IssueList({
  issues,
  onDismiss,
}: {
  readonly issues: readonly GraphIssue[];
  readonly onDismiss?: () => void;
}) {
  if (issues.length === 0) return null;
  return (
    <div className="sgl-issues" role="alert">
      <strong>Not applied — the design is unchanged.</strong>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>
            <code>{formatIssuePath(issue.path)}</code> {issue.message}
          </li>
        ))}
      </ul>
      {onDismiss && (
        <button type="button" className="sgl-link" onClick={onDismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}
