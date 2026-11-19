import { useEffect, useId, useReducer, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { HELP_CLOSED, helpReducer, hintVisible } from './helpState';
import { helpTopic, type HelpTopic } from './topics';
import './help.css';

/**
 * Small "?" help button for beginners.
 * - Hover or keyboard focus shows the one-sentence summary (role="tooltip", wired with
 *   aria-describedby so screen readers announce it on focus).
 * - Click / Enter / Space pins a panel with the summary and a "More details" disclosure.
 * - Escape closes; clicking elsewhere closes a pinned panel.
 * Pass a topic id from `topics.ts`, or a custom `topic` object. Unknown ids render nothing.
 */
export function HelpTip({
  topicId,
  topic: custom,
  children,
  mark = '?',
}: {
  readonly topicId?: string;
  readonly topic?: HelpTopic;
  /** Optional extra content inside the pinned panel (e.g. a link to docs). */
  readonly children?: ReactNode;
  /** The trigger's visible mark: '?' (help, default) or 'i' (section information, P4). */
  readonly mark?: '?' | 'i';
}) {
  const topic = custom ?? (topicId ? helpTopic(topicId) : undefined);
  const [state, dispatch] = useReducer(helpReducer, HELP_CLOSED);
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();
  const tipId = `${id}-tip`;
  const panelId = `${id}-panel`;

  useEffect(() => {
    if (!state.open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) dispatch('outside');
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [state.open]);

  if (!topic) return null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (state.open || hintVisible(state))) {
      e.stopPropagation();
      dispatch('escape');
    }
  };

  return (
    <span
      ref={root}
      className="sgl-helptip"
      data-help-topic={topic.id}
      onKeyDown={onKeyDown}
      onPointerEnter={() => dispatch('pointer-enter')}
      onPointerLeave={() => dispatch('pointer-leave')}
    >
      <button
        type="button"
        className="sgl-helptip-trigger"
        aria-label={`Help: ${topic.title}`}
        aria-describedby={tipId}
        aria-expanded={state.open}
        aria-controls={panelId}
        onFocus={() => dispatch('focus')}
        onBlur={() => dispatch('blur')}
        onClick={() => dispatch('toggle')}
      >
        {mark}
      </button>
      <span role="tooltip" id={tipId} className="sgl-helptip-hint" hidden={!hintVisible(state)}>
        {topic.summary}
      </span>
      <span id={panelId} className="sgl-helptip-panel" role="region" aria-label={topic.title} hidden={!state.open}>
        <strong>{topic.title}</strong>
        <span className="sgl-helptip-summary">{topic.summary}</span>
        {topic.details !== '' && (
          <details>
            <summary>More details</summary>
            <span className="sgl-helptip-details">{topic.details}</span>
          </details>
        )}
        {children}
      </span>
    </span>
  );
}

/** A label with a help button after it, for form fields and section headings. */
export function HelpLabel({ children, topicId }: { readonly children: ReactNode; readonly topicId: string }) {
  return (
    <span className="sgl-helplabel">
      {children}
      <HelpTip topicId={topicId} />
    </span>
  );
}
