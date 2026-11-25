/**
 * Keyboard model of a tab list (WAI-ARIA tabs, automatic activation). Vertical (default):
 * ArrowDown/ArrowUp move to the next/previous tab and wrap; horizontal: ArrowRight/ArrowLeft.
 * Home/End go to the first and last. Disabled tabs are skipped. Returns null for keys the tab
 * list does not handle.
 */
export function nextTabIndex(
  key: string,
  current: number,
  disabled: readonly boolean[],
  orientation: 'vertical' | 'horizontal' = 'vertical',
): number | null {
  const count = disabled.length;
  if (count === 0) return null;
  const enabled = (i: number) => disabled[i] !== true;
  const step = (from: number, delta: 1 | -1): number => {
    for (let n = 1; n <= count; n++) {
      const i = (((from + delta * n) % count) + count) % count;
      if (enabled(i)) return i;
    }
    return current;
  };
  const [next, previous] = orientation === 'vertical' ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft'];
  switch (key) {
    case next:
      return step(current, 1);
    case previous:
      return step(current, -1);
    case 'Home':
      return step(-1, 1);
    case 'End':
      return step(count, -1);
    default:
      return null;
  }
}

/**
 * Focus trap of a modal dialog: where Tab (or Shift+Tab) moves focus among `count` focusable
 * elements, wrapping at both ends. `current` is -1 when focus is outside the list (e.g. on the
 * dialog container itself): Tab then goes to the first element, Shift+Tab to the last.
 * Returns null when there is nothing focusable.
 */
export function trappedFocusIndex(current: number, count: number, shift: boolean): number | null {
  if (count <= 0) return null;
  if (current < 0 || current >= count) return shift ? count - 1 : 0;
  return shift ? (current - 1 + count) % count : (current + 1) % count;
}

/** Selector of elements a focus trap cycles through (enabled, not hidden by `tabindex=-1`). */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
