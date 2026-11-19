import { useState } from 'react';
import { VIEW_LABELS } from '@app/ui';
import { useWorkspaceServices } from '@app/workspace/services';
import { COLOUR_PRESETS, DISPLAY_VIEW_MODES, LIGHTING_PRESETS, type ColourPreset, type DisplayViewMode, type LightingPreset } from './contracts';
import { useDisplay } from './DisplayProvider';
import { overriddenFields, PANEL_FIELDS, type DisplayField } from './displayStore';
import '@app/camera/camera.css';

const FIELD_LABELS: Readonly<Record<DisplayField, string>> = {
  labels: 'Labels',
  legend: 'Legend',
  roofs: 'Roofs',
  colourPreset: 'Colours',
  lighting: 'Lighting',
};

const FIELD_HINTS: Readonly<Record<DisplayField, string>> = {
  labels: 'Room and storey labels drawn in the 3D view.',
  legend: 'The colour legend over the view.',
  roofs: 'Shows or hides roofs in the picture only. The Designer still decides which rooms have roofs.',
  colourPreset: 'By function: each room type in its own colour. Neutral: one quiet colour for every room.',
  lighting: 'Default: directional light with shadows of form. Soft: even, low-contrast light.',
};

const PRESET_LABELS: Readonly<Record<ColourPreset, string>> = { 'by-function': 'By function', neutral: 'Neutral' };
const LIGHTING_LABELS: Readonly<Record<LightingPreset, string>> = { default: 'Default', soft: 'Soft' };

const NO_SETTINGS: Readonly<Partial<Record<DisplayViewMode, string>>> = {
  graph2d: 'Graph 2D has no display settings yet.',
  plan: 'The Plan view has no display settings yet.',
  data: 'The Data view shows text and tables: it has no display settings.',
};

/**
 * Display destination (workstream E): pick a view mode, then its appearance settings. Display is
 * appearance only: it never changes the design, what is generated or the undo history. Settings
 * are stored for the active scenario, per view mode, and apply to every viewport showing that view.
 * Each view offers only the settings it applies (fewest for Graph 3D, most for Building).
 */
export function DisplayPanel() {
  const { viewports } = useWorkspaceServices();
  const display = useDisplay();
  const firstShown = viewports.find((v) => v.visible && PANEL_FIELDS[v.mode].length > 0)?.mode;
  const [mode, setMode] = useState<DisplayViewMode>(firstShown ?? 'architecture');
  const resolved = display.resolve(mode);
  const fields = PANEL_FIELDS[mode];
  const overridden = new Set(overriddenFields(display.overrides, mode));
  const shownIn = viewports.filter((v) => v.visible && v.mode === mode).map((v) => v.index + 1);

  const marker = (field: DisplayField) =>
    overridden.has(field) ? (
      <span className="sgl-display-override" title="Set for this view in this scenario">
        ●
      </span>
    ) : null;

  return (
    <div className="sgl-display" aria-label="Display">
      <section className="sgl-display-section" aria-label="View">
        <h3>View</h3>
        <div className="sgl-display-modes" role="group" aria-label="Display settings for view">
          {DISPLAY_VIEW_MODES.map((m) => (
            <button key={m} type="button" aria-pressed={m === mode} onClick={() => setMode(m)} data-display-mode={m}>
              {VIEW_LABELS[m]}
            </button>
          ))}
        </div>
        <p className="meta">
          Appearance only: never changes the design or what is generated. Saved with this scenario
          {shownIn.length > 0 ? `; shown now in viewport ${shownIn.join(' and ')}.` : '.'}
        </p>
      </section>

      <section className="sgl-display-section" aria-label={`${VIEW_LABELS[mode]} settings`} data-display-settings={mode}>
        <h3>{VIEW_LABELS[mode]}</h3>
        {fields.length === 0 ? (
          <p className="meta">{NO_SETTINGS[mode] ?? 'No display settings for this view.'}</p>
        ) : (
          fields.map((field) => {
            if (field === 'colourPreset')
              return (
                <label key={field} className="sgl-display-field" title={FIELD_HINTS[field]}>
                  <span>
                    {FIELD_LABELS[field]} {marker(field)}
                  </span>
                  <select
                    value={resolved.colourPreset}
                    data-display-field={field}
                    onChange={(e) => display.setField(mode, 'colourPreset', e.currentTarget.value as ColourPreset)}
                  >
                    {COLOUR_PRESETS.map((p) => (
                      <option key={p} value={p}>
                        {PRESET_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
              );
            if (field === 'lighting')
              return (
                <label key={field} className="sgl-display-field" title={FIELD_HINTS[field]}>
                  <span>
                    {FIELD_LABELS[field]} {marker(field)}
                  </span>
                  <select
                    value={resolved.lighting}
                    data-display-field={field}
                    onChange={(e) => display.setField(mode, 'lighting', e.currentTarget.value as LightingPreset)}
                  >
                    {LIGHTING_PRESETS.map((p) => (
                      <option key={p} value={p}>
                        {LIGHTING_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
              );
            return (
              <label key={field} className="sgl-display-field" title={FIELD_HINTS[field]}>
                <span>
                  {FIELD_LABELS[field]} {marker(field)}
                </span>
                <input
                  type="checkbox"
                  checked={resolved[field]}
                  data-display-field={field}
                  onChange={(e) => display.setField(mode, field, e.currentTarget.checked)}
                />
              </label>
            );
          })
        )}
        {mode === 'architecture' && <p className="meta">Roofs: a view cutaway. Which rooms get roofs is set in Building Designer.</p>}
        {fields.length > 0 && (
          <button type="button" disabled={overridden.size === 0} onClick={() => display.resetView(mode)}>
            Reset {VIEW_LABELS[mode]} to defaults
          </button>
        )}
      </section>
    </div>
  );
}
