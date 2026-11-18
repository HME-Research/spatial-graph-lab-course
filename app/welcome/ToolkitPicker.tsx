import { useId } from 'react';

/** One toolkit a new project can start from (`toolkits/<id>`). */
export interface ToolkitOption {
  readonly id: string;
  readonly label: string;
}

/**
 * The toolkit a new project starts from: its room functions, attributes, algorithms and starting
 * Building settings. Used by Welcome (Create project) and the Project panel (New project).
 * The value is a toolkit id, or '' for "No toolkit".
 */
export function ToolkitPicker({
  toolkits,
  value,
  onChange,
  disabled = false,
}: {
  readonly toolkits: readonly ToolkitOption[];
  readonly value: string | null;
  readonly onChange: (toolkitId: string | null) => void;
  readonly disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="sgl-toolkit-picker">
      <label htmlFor={id}>Toolkit</label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.currentTarget.value === '' ? null : e.currentTarget.value)} disabled={disabled}>
        {toolkits.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
        <option value="">No toolkit</option>
      </select>
      <span className="sgl-toolkit-picker-help">Its room functions and algorithms are available in the new project.</span>
    </div>
  );
}
