import type { ViewMode } from '@app/views/contracts';
import { VIEW_DESCRIPTIONS, VIEW_OPTIONS } from './labels';

/**
 * View selector for a panel header, with beginner labels ("Building", not "Architecture") and a
 * tooltip describing the selected view. The internal mode ids are unchanged.
 */
export function ViewModeSelect({
  mode,
  onMode,
  panel,
}: {
  readonly mode: ViewMode;
  readonly onMode: (mode: ViewMode) => void;
  /** 1-based panel number, for the accessible name. */
  readonly panel: number;
}) {
  return (
    <select
      value={mode}
      onChange={(e) => onMode(e.currentTarget.value as ViewMode)}
      aria-label={`View shown in panel ${panel}`}
      title={VIEW_DESCRIPTIONS[mode]}
    >
      {VIEW_OPTIONS.map((o) => (
        <option key={o.mode} value={o.mode} title={o.description}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
