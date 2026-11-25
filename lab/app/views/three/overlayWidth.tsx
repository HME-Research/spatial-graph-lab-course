import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isCompactPanel } from '@app/views/presentation/legend';

/**
 * Width of the 3D overlay a component sits in (programme phase 05). Place `probe` anywhere in a
 * SceneCanvas `overlay`: it is an invisible, click-through box covering the overlay, measured with
 * a ResizeObserver. `compact` follows `isCompactPanel` (narrow split panels, laptop widths), so
 * legends and option groups can start closed there and stay open on wide screens.
 */
export function useOverlayWidth(): { readonly probe: ReactNode; readonly width: number | null; readonly compact: boolean } {
  const ref = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const probe = <span ref={ref} className="viewer3d-probe" aria-hidden="true" />;
  return { probe, width, compact: width !== null && isCompactPanel(width) };
}

/**
 * Open state of a disclosure that starts closed in a compact panel and open otherwise, decided
 * once when the width is first known; afterwards only the user opens or closes it.
 */
export function useDefaultOpen(compact: boolean, known: boolean): readonly [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState<boolean | null>(null);
  const decided = open ?? (known ? !compact : false);
  useEffect(() => {
    if (open === null && known) setOpen(!compact);
  }, [open, known, compact]);
  return [decided, setOpen];
}
