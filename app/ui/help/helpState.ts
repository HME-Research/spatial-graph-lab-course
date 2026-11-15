/**
 * Tooltip / popover state for `HelpTip` (pure reducer, tested without a DOM).
 * - hint: the one-sentence tooltip, shown on hover OR keyboard focus (equivalent access);
 * - open: the pinned panel with "More details", toggled by click / Enter / Space;
 * - Escape closes both; leaving with the mouse or blurring hides the hint but keeps a pinned panel.
 */
export interface HelpState {
  readonly hover: boolean;
  readonly focus: boolean;
  readonly open: boolean;
}

export type HelpEvent = 'pointer-enter' | 'pointer-leave' | 'focus' | 'blur' | 'toggle' | 'escape' | 'outside';

export const HELP_CLOSED: HelpState = Object.freeze({ hover: false, focus: false, open: false });

export function helpReducer(state: HelpState, event: HelpEvent): HelpState {
  switch (event) {
    case 'pointer-enter':
      return { ...state, hover: true };
    case 'pointer-leave':
      return { ...state, hover: false };
    case 'focus':
      return { ...state, focus: true };
    case 'blur':
      return { ...state, focus: false };
    case 'toggle':
      return { ...state, open: !state.open };
    case 'escape':
      return HELP_CLOSED;
    case 'outside':
      return { ...state, open: false };
  }
}

/** The hint tooltip is visible while hovered or focused, unless the full panel is open. */
export const hintVisible = (s: HelpState): boolean => (s.hover || s.focus) && !s.open;
