import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { FloatingWindowProps } from '../guideContracts';
import {
  DEFAULT_MIN_SIZE,
  DEFAULT_WINDOW_SIZE,
  MINIMISED_HEIGHT,
  clampPosition,
  clampSize,
  defaultState,
  fitState,
  nudgeFor,
  windowKeyAction,
  readWindowState,
  writeWindowState,
  type Size,
  type WindowState,
} from './windowState';
import './floating.css';

let zCounter = 0;
const viewportSize = (): Size => (typeof window === 'undefined' ? { width: 1280, height: 800 } : { width: window.innerWidth, height: window.innerHeight });

/**
 * Non-modal window that floats above the app: drag the title bar to move, drag the corner handle
 * to resize, minimise to a small bar, close with the button or Esc (while focus is inside).
 * Position, size and minimised state are remembered per `id` (localStorage, failure-tolerant).
 * The most recently focused / clicked window is on top.
 */
export function FloatingWindow({
  id,
  title,
  open,
  onClose,
  initialSize = DEFAULT_WINDOW_SIZE,
  minSize = DEFAULT_MIN_SIZE,
  children,
}: FloatingWindowProps & { readonly children?: ReactNode }) {
  if (!open) return null;
  const element = (
    <Window id={id} title={title} onClose={onClose} initialSize={initialSize} minSize={minSize}>
      {children}
    </Window>
  );
  // Static rendering (tests, no DOM) has no portal target: render in place.
  return typeof document === 'undefined' ? element : createPortal(element, document.body);
}

function Window({
  id,
  title,
  onClose,
  initialSize,
  minSize,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly onClose: () => void;
  readonly initialSize: Size;
  readonly minSize: Size;
  readonly children?: ReactNode;
}) {
  const titleId = useId();
  const [state, setState] = useState<WindowState>(() => {
    const vp = viewportSize();
    const saved = readWindowState(id);
    return saved ? fitState(saved, minSize, vp) : defaultState(initialSize, minSize, vp);
  });
  const [z, setZ] = useState(() => ++zCounter);
  const stateRef = useRef(state);
  stateRef.current = state;
  const zRef = useRef(z);
  zRef.current = z;
  const root = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const update = useCallback(
    (next: WindowState, persist: boolean) => {
      setState(next);
      if (persist) writeWindowState(id, next);
    },
    [id],
  );

  const raise = () => {
    if (zRef.current === zCounter) return;
    setZ(++zCounter);
  };

  // Keep inside the viewport when the browser window shrinks.
  useEffect(() => {
    const onResize = () => update(fitState(stateRef.current, minSize, viewportSize()), false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [minSize, update]);

  // Take focus on open so keyboard users land in the window (title bar, before the content).
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('.sgl-float-bar')?.focus();
  }, []);

  const outer = (s: WindowState): Size => ({ width: s.width, height: s.minimised ? MINIMISED_HEIGHT : s.height });

  const track = (move: (ev: PointerEvent) => void) => {
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      writeWindowState(id, stateRef.current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    const s0 = stateRef.current;
    const start = { px: e.clientX, py: e.clientY, x: s0.x, y: s0.y };
    track((ev) => {
      const s = stateRef.current;
      const pos = clampPosition({ x: start.x + ev.clientX - start.px, y: start.y + ev.clientY - start.py }, outer(s), viewportSize());
      setState({ ...s, ...pos });
    });
    e.preventDefault();
  };

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const s0 = stateRef.current;
    const start = { px: e.clientX, py: e.clientY, w: s0.width, h: s0.height };
    track((ev) => {
      const s = stateRef.current;
      const vp = viewportSize();
      const size = clampSize({ width: start.w + ev.clientX - start.px, height: start.h + ev.clientY - start.py }, minSize, {
        width: vp.width - s.x,
        height: vp.height - s.y,
      });
      setState({ ...s, ...size });
    });
    e.preventDefault();
    e.stopPropagation();
  };

  const onBarKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const d = nudgeFor(e.key, e.shiftKey);
    if (!d) return;
    e.preventDefault();
    const s = stateRef.current;
    update({ ...s, ...clampPosition({ x: s.x + d.x, y: s.y + d.y }, outer(s), viewportSize()) }, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (windowKeyAction(e.key, e.defaultPrevented) === 'close') {
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
    }
  };

  const toggleMin = () => {
    const s = stateRef.current;
    update(fitState({ ...s, minimised: !s.minimised }, minSize, viewportSize()), true);
  };

  return (
    <div
      ref={root}
      className={`sgl-float${state.minimised ? ' minimised' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-floating={id}
      style={{ left: state.x, top: state.y, width: state.width, height: state.minimised ? MINIMISED_HEIGHT : state.height, zIndex: 900 + z }}
      onPointerDownCapture={raise}
      onFocusCapture={raise}
      onKeyDown={onKeyDown}
    >
      <div className="sgl-float-bar" tabIndex={0} onPointerDown={startDrag} onKeyDown={onBarKeyDown} onDoubleClick={toggleMin} title="Drag to move. Arrow keys nudge the window.">
        <span id={titleId} className="sgl-float-title">
          {title}
        </span>
        <button
          type="button"
          className="sgl-float-btn"
          onClick={toggleMin}
          aria-label={state.minimised ? `Restore ${title}` : `Minimise ${title}`}
          title={state.minimised ? 'Restore' : 'Minimise'}
        >
          <span aria-hidden="true">{state.minimised ? '▢' : '–'}</span>
        </button>
        <button type="button" className="sgl-float-btn" onClick={onClose} aria-label={`Close ${title}`} title="Close (Esc)">
          <span aria-hidden="true">{'×'}</span>
        </button>
      </div>
      {!state.minimised && (
        <>
          <div className="sgl-float-body">{children}</div>
          <div className="sgl-float-resize" onPointerDown={startResize} aria-hidden="true" />
        </>
      )}
    </div>
  );
}
