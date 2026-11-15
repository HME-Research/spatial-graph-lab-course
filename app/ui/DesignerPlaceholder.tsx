import './ui.css';

/**
 * Placeholder for the Designer section until the 06-designer panel is wired in by integration.
 * It says plainly that nothing can be changed here yet; it never advertises missing features
 * as available.
 */
export function DesignerPlaceholder() {
  return (
    <div className="sgl-placeholder">
      <p>
        <strong>Not available yet.</strong>
      </p>
      <p className="sgl-help">
        The Designer will set how each room type looks in this design, such as how much of the façade is window and
        whether rooms get a flat roof. Nothing on this tab changes your design yet.
      </p>
    </div>
  );
}
