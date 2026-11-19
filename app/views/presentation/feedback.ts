import { formatIssuePath, type GraphIssue, type IssueCode } from '@app/document';
import { ERROR_TONE, UNRESOLVED_COLOR, WARNING_TONE } from './vocabulary';

/**
 * Concise validation feedback (pure). Turns validator issues into a short headline, at most a few
 * plain-language lines, and a count of the rest, so a beginner sees what to fix first instead of a
 * wall of messages. The technical code and path stay available for "More details".
 *
 * Tones are deliberately distinct:
 *  - `error`  : the document/import/command was rejected (invalid JSON, schema, type errors).
 *  - `warning`: something is out of date (stale analysis).
 *  - `spatial`: valid design, but a relationship cannot be built (unresolved). Not an error.
 *  - `info`   : neutral notes.
 */
export type FeedbackTone = 'error' | 'warning' | 'spatial' | 'info';

export const TONE_STYLE: Readonly<Record<FeedbackTone, { readonly border: string; readonly icon: string; readonly label: string }>> = {
  error: { border: ERROR_TONE.border, icon: ERROR_TONE.icon, label: 'Error' },
  warning: { border: WARNING_TONE.border, icon: WARNING_TONE.icon, label: 'Warning' },
  spatial: { border: UNRESOLVED_COLOR, icon: '⋯', label: 'Cannot be built yet' },
  info: { border: '#2c5d8f', icon: 'ℹ', label: 'Note' },
};

/** One-line beginner hint per issue code: what it means and what to do. */
export const ISSUE_HINTS: Readonly<Record<IssueCode, string>> = {
  'invalid-json': 'The file is not valid JSON. Check for a missing comma, quote or bracket.',
  'unsupported-schema-version': 'This file was made for a different version of the app.',
  schema: 'A field is missing or has the wrong kind of value.',
  'duplicate-node-id': 'Two rooms use the same id. Every room id must be unique.',
  'coordinate-out-of-range': 'A room is placed too far from the origin.',
  'too-many-nodes': 'The design has more rooms than the app allows.',
  'unknown-node-type': 'A room uses a type the active project does not define.',
  'duplicate-edge-id': 'Two relationships use the same id.',
  'self-edge': 'A relationship connects a room to itself.',
  'dangling-edge': 'A relationship points to a room that does not exist.',
  'duplicate-relationship': 'These two rooms already have a relationship.',
  'invalid-edge-geometry': 'In this (v1) design, the two rooms must share a face for this kind of relationship.',
  'unknown-node-position': 'A diagram position refers to a room that does not exist.',
  'not-found': 'The item no longer exists (it may have been deleted).',
  'room-overlap': 'Two rooms would occupy the same cells. Move or resize one of them.',
  'id-counter': 'An id is not below the next-id counter of the design, so a new room or relationship could repeat it.',
  'too-many-cells': 'The rooms together use more cells than the app allows.',
  'route-displacement': 'This move would take the space of a generated connector. Confirm to recalculate it.',
};

export interface FeedbackLine {
  readonly hint: string;
  /** The validator's exact message. */
  readonly message: string;
  /** Where in the document ("nodes[2].position"), or '' for the whole document. */
  readonly where: string;
  readonly code: IssueCode;
}

export interface ConciseFeedback {
  readonly tone: FeedbackTone;
  readonly headline: string;
  readonly lines: readonly FeedbackLine[];
  /** Issues not shown in `lines`. */
  readonly more: number;
  /** Plain-text version for aria-live regions and logs. */
  readonly text: string;
}

export interface FeedbackOptions {
  /** What was attempted, e.g. "load design.json" or "add the relationship". */
  readonly action: string;
  /** Lines to show before "and N more" (default 3). */
  readonly max?: number;
  /** Whether the current design was kept (default true). */
  readonly kept?: boolean;
}

/**
 * Short feedback for a rejected action. Repeated identical hints are merged so one mistake copied
 * ten times reads as one line plus a count.
 */
export function conciseIssues(issues: readonly GraphIssue[], options: FeedbackOptions): ConciseFeedback {
  const max = Math.max(1, options.max ?? 3);
  const kept = options.kept ?? true;
  const lines: FeedbackLine[] = issues.map((i) => ({
    hint: Object.hasOwn(ISSUE_HINTS, i.code) ? ISSUE_HINTS[i.code] : 'The design did not pass validation.',
    message: i.message,
    where: formatIssuePath(i.path),
    code: i.code,
  }));
  const firstPerHint: FeedbackLine[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (seen.has(l.hint)) continue;
    seen.add(l.hint);
    firstPerHint.push(l);
  }
  const shown = firstPerHint.slice(0, max);
  const more = issues.length - shown.length;
  const n = issues.length;
  const headline =
    n === 0
      ? `Could not ${options.action}.`
      : `Could not ${options.action}: ${n} ${n === 1 ? 'problem' : 'problems'}.${kept ? ' Your current design was kept unchanged.' : ''}`;
  const text = [headline, ...shown.map((l) => `• ${l.hint}`), ...(more > 0 ? [`…and ${more} more.`] : [])].join('\n');
  return { tone: 'error', headline, lines: shown, more, text };
}
