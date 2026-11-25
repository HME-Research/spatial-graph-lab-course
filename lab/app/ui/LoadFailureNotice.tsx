import type { GraphIssue } from '@app/document';
import { Feedback } from './Feedback';
import { friendlyMessages } from './messages';

/**
 * Persistent notice for a design that could not be opened (file import, project design,
 * example). Message first; paths and codes under "Technical details". Optional drop-in for the
 * shell's existing load-failure section (integration owner decides).
 */
export function LoadFailureNotice({
  source,
  issues,
  kept,
  onDismiss,
}: {
  readonly source: string;
  readonly issues: readonly GraphIssue[];
  /** true: a design is still open and unchanged; false: no design is loaded. */
  readonly kept: boolean;
  readonly onDismiss: () => void;
}) {
  const count = issues.length;
  return (
    <section className="sgl-load-failure" aria-label="Design not opened">
      <Feedback
        tone="error"
        title={`Could not open ${source}. ${kept ? 'Your current design is unchanged.' : 'No design is loaded.'}`}
        messages={friendlyMessages(issues)}
        onDismiss={onDismiss}
      >
        {count > 1 && <p className="sgl-help">{count} problems were found in the file.</p>}
      </Feedback>
    </section>
  );
}
