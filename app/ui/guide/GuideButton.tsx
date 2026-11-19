import { useGuide } from './GuideContext';

/** Header button that opens (or closes) the Guide. */
export function GuideButton() {
  const guide = useGuide();
  return (
    <button type="button" className="sgl-guide-button" onClick={() => (guide.isOpen ? guide.close() : guide.open())} aria-haspopup="dialog" aria-expanded={guide.isOpen} title="Open the Guide">
      Guide
    </button>
  );
}
