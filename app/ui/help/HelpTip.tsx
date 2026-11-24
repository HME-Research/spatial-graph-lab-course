import { useEffect, useId, useLayoutEffect, useReducer, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
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
 * - The hint and panel are placed in the WINDOW (`position: fixed`, `placeBubble`), never clipped by
 *   the scrolling pane they sit in nor hidden behind a neighbouring viewport: below the trigger,
 *   or above it when there is no room below, and always inside the window.
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
  const trigger = useRef<HTMLButtonElement>(null);
  const hint = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  const showHint = hintVisible(state);

  // Place the visible bubble in the window; follow scrolling and resizing while it is shown.
  useLayoutEffect(() => {
    const bubble = state.open ? panel.current : showHint ? hint.current : null;
    const button = trigger.current;
    if (!bubble || !button) return;
    const place = () => {
      const at = placeBubble(button.getBoundingClientRect(), bubble.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
      bubble.style.left = `${at.left}px`;
      bubble.style.top = `${at.top}px`;
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [state.open, showHint]);

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
        ref={trigger}
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
      <span ref={hint} role="tooltip" id={tipId} className="sgl-helptip-hint" hidden={!showHint} style={OFFSCREEN}>
        {topic.summary}
      </span>
      <span ref={panel} id={panelId} className="sgl-helptip-panel" role="region" aria-label={topic.title} hidden={!state.open} style={OFFSCREEN}>
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

/** Until it is measured and placed, a bubble waits at the window's top left (never seen: placed before paint). */
const OFFSCREEN: CSSProperties = { left: 0, top: 0 };

type Box = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;

/**
 * Window position of a help bubble of size `bubble` for a trigger at `trigger`: centred under it
 * (6 px gap), above it when it would leave the window at the bottom and fits above, and shifted
 * sideways to stay at least 8 px inside the window. Pure.
 */
export function placeBubble(trigger: Box, bubble: Pick<Box, 'width' | 'height'>, view: { readonly width: number; readonly height: number }): { left: number; top: number } {
  const margin = 8;
  const gap = 6;
  const centred = trigger.left + trigger.width / 2 - bubble.width / 2;
  const left = Math.max(margin, Math.min(centred, view.width - margin - bubble.width));
  const below = trigger.bottom + gap;
  const above = trigger.top - gap - bubble.height;
  const top = below + bubble.height > view.height - margin && above >= margin ? above : below;
  return { left: Math.round(left), top: Math.round(top) };
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
