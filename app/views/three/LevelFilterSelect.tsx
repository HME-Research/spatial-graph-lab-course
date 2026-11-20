import { useEffect, useState } from 'react';
import { useRemembered } from '../panelMemory';
import { ALL_LEVELS, effectiveLevelFilter, levelFilterFromValue, levelFilterOptions, levelFilterToValue, type LevelFilter } from './levelFilter';

/**
 * The level filter of the Graph 3D, Voxel or Building view: `[filter, setFilter]`. Remembered by the hosting
 * panel (like the camera and the Plan's level), never written to the design. When the chosen storey
 * no longer exists (a room moved or deleted) the view shows All levels and the choice is reset.
 */
export function useLevelFilter(view: 'graph3d' | 'voxels' | 'architecture', levels: readonly number[]): readonly [LevelFilter, (filter: LevelFilter) => void] {
  const memory = useRemembered<LevelFilter>(`levels:${view}`);
  const [wanted, setWanted] = useState<LevelFilter>(() => memory?.load() ?? ALL_LEVELS);
  const filter = effectiveLevelFilter(wanted, levels);
  useEffect(() => {
    if (filter.kind === 'all' && wanted.kind !== 'all') setWanted(ALL_LEVELS);
  }, [filter, wanted]);
  useEffect(() => {
    memory?.save(wanted);
  }, [memory, wanted]);
  return [filter, setWanted];
}

/** Toolbar control: All levels / Level n only / Up to level n. Not shown for a one-storey design. */
export function LevelFilterSelect({
  levels,
  filter,
  onChange,
}: {
  readonly levels: readonly number[];
  readonly filter: LevelFilter;
  readonly onChange: (filter: LevelFilter) => void;
}) {
  const options = levelFilterOptions(levels);
  if (options.length === 0) return null;
  return (
    <label title="Show levels: all, one level only, or a level with the levels above it taken off. A room on several levels is shown whole." style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <LevelsIcon />
      <select aria-label="Show levels" value={levelFilterToValue(filter)} onChange={(e) => onChange(levelFilterFromValue(e.currentTarget.value))}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Three stacked storeys. */
function LevelsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
      <path d="M7 1 13 4 7 7 1 4Z" fill="currentColor" opacity="0.9" />
      <path d="M1 7 7 10 13 7" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1 10 7 13 13 10" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
