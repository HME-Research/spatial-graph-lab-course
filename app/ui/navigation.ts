/**
 * Keyboard model of a vertical tab list (WAI-ARIA tabs, vertical orientation, automatic
 * activation): ArrowDown/ArrowUp move to the next/previous tab and wrap; Home/End go to the first
 * and last. Disabled tabs are skipped. Returns null for keys the tab list does not handle.
 */
export function nextTabIndex(key: string, current: number, disabled: readonly boolean[]): number | null {
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
  switch (key) {
    case 'ArrowDown':
      return step(current, 1);
    case 'ArrowUp':
      return step(current, -1);
    case 'Home':
      return step(-1, 1);
    case 'End':
      return step(count, -1);
    default:
      return null;
  }
}
