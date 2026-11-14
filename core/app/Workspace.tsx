import { useState } from 'react';
import { VIEW_MODE_LABELS, VIEW_MODES, type ViewMode, type ViewProps } from '@app/views/contracts';
import { VIEW_COMPONENTS } from '@app/views/registry';
import { Inspector } from './inspector/Inspector';

/**
 * Viewport host: one or two panels, each with its own mode selector, sharing the same
 * document, selection and command handler. Each panel instance keeps its own camera/UI state.
 */
export function Workspace(props: ViewProps) {
  const [split, setSplit] = useState(true);
  return (
    <section className="workspace">
      <div className="workspace-bar">
        <label>
          <input type="checkbox" checked={split} onChange={(e) => setSplit(e.currentTarget.checked)} /> Split view
        </label>
      </div>
      <div className={split ? 'workspace-grid split' : 'workspace-grid'}>
        <ViewPanel {...props} initialMode="graph2d" />
        {split && <ViewPanel {...props} initialMode="architecture" />}
        <Inspector {...props} />
      </div>
    </section>
  );
}

function ViewPanel({ initialMode, ...props }: ViewProps & { readonly initialMode: ViewMode }) {
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const View = VIEW_COMPONENTS[mode];
  return (
    <div className="view-panel">
      <select value={mode} onChange={(e) => setMode(e.currentTarget.value as ViewMode)} aria-label="View mode">
        {VIEW_MODES.map((m) => (
          <option key={m} value={m}>
            {VIEW_MODE_LABELS[m]}
          </option>
        ))}
      </select>
      <div className="view-body">
        <View {...props} />
      </div>
    </div>
  );
}
