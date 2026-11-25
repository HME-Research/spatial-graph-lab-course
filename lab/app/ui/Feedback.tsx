import type { ReactNode } from 'react';
import type { GraphIssue } from '@app/document';
import { friendlyMessages, type FriendlyMessage, type MessageContext } from './messages';
import './ui.css';

export type FeedbackTone = 'error' | 'warning' | 'info';

const TONE_ICON: Readonly<Record<FeedbackTone, string>> = { error: '✖', warning: '⚠', info: 'ℹ' };

/**
 * Transient action feedback (e.g. a rejected edit): plain-language messages first, the
 * validator's paths and codes behind a "Technical details" disclosure. Errors are announced
 * (`role="alert"`); warnings and notes politely (`role="status"`). Persistent problems, such as a
 * failed project activation, belong to the project bar, not here.
 */
export function Feedback({
  tone,
  title,
  messages,
  onDismiss,
  children,
}: {
  readonly tone: FeedbackTone;
  /** Lead sentence, e.g. "Not applied. The design is unchanged." */
  readonly title?: string;
  readonly messages: readonly FriendlyMessage[];
  readonly onDismiss?: () => void;
  /** Extra actions (e.g. confirmation buttons). */
  readonly children?: ReactNode;
}) {
  if (messages.length === 0 && title === undefined && children === undefined) return null;
  const technical = messages.map((m) => m.technical).filter((t) => t !== '');
  return (
    <div className={`sgl-feedback sgl-feedback-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="sgl-feedback-body">
        <span className="sgl-feedback-icon" aria-hidden="true">
          {TONE_ICON[tone]}
        </span>
        <div className="sgl-feedback-text">
          {messages.length === 1 && title === undefined ? (
            <p>{messages[0]!.text}</p>
          ) : (
            <>
              {title !== undefined && <p className="sgl-feedback-title">{title}</p>}
              {messages.length === 1 ? (
                <p>{messages[0]!.text}</p>
              ) : (
                messages.length > 1 && (
                  <ul>
                    {messages.map((m, i) => (
                      <li key={i}>{m.text}</li>
                    ))}
                  </ul>
                )
              )}
            </>
          )}
          {children}
          {technical.length > 0 && (
            <details className="sgl-feedback-details">
              <summary>Technical details</summary>
              <pre>{technical.join('\n')}</pre>
            </details>
          )}
        </div>
        {onDismiss && (
          <button type="button" className="sgl-feedback-dismiss" aria-label="Dismiss message" title="Dismiss" onClick={onDismiss}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}

/** A rejected command: what went wrong in plain language; the design was not changed. */
export function IssueFeedback({
  issues,
  context,
  onDismiss,
}: {
  readonly issues: readonly GraphIssue[];
  readonly context?: MessageContext;
  readonly onDismiss?: () => void;
}) {
  if (issues.length === 0) return null;
  const messages = friendlyMessages(issues, context);
  return (
    <Feedback
      tone="error"
      messages={messages}
      {...(messages.length > 1 && { title: 'Not applied. The design is unchanged.' })}
      {...(onDismiss && { onDismiss })}
    />
  );
}
