import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GUIDE_TAB_IDS, GUIDE_TAB_LABELS, type GuideLink, type GuideTabId } from '../guideContracts';
import { FloatingWindow, sizedWindowId } from '../floating';
import { HorizontalTabs } from '../Tabs';
import { GUIDE_CONTENT, guideTabContent, type GuideTabContent } from './content';
import { ExplainerView, sectionDomId } from './ExplainerView';
import './guide.css';

const TABS = GUIDE_TAB_IDS.map((id) => ({ id, label: GUIDE_TAB_LABELS[id] }));

/** The Guide's opening size (owner 2026-11-20: bigger, centred; clamped to the browser window). */
export const GUIDE_WINDOW_SIZE = { width: 720, height: 640 } as const;
/** Its window id carries the size, so a place remembered by an older version (460 × 520) is not read. */
export const GUIDE_WINDOW_ID = sizedWindowId('guide', GUIDE_WINDOW_SIZE);

/** The Guide: tabs from GUIDE_TAB_IDS, each showing its content blocks. `link` selects the tab (and scrolls to the section). */
export function GuideWindow({
  open,
  onClose,
  link,
  content = GUIDE_CONTENT,
  renderDiagram,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly link: GuideLink | null;
  readonly content?: readonly GuideTabContent[];
  readonly renderDiagram?: ((diagramId: string) => ReactNode) | undefined;
}) {
  const [tab, setTab] = useState<GuideTabId>(link?.tab ?? GUIDE_TAB_IDS[0]);
  const body = useRef<HTMLDivElement>(null);

  // A new link (even to the same tab) selects its tab and scrolls to its section.
  useEffect(() => {
    if (link) setTab(link.tab);
  }, [link]);
  useEffect(() => {
    if (!open || !link?.section) return;
    const el = body.current?.ownerDocument.getElementById(sectionDomId(link.section));
    el?.scrollIntoView?.({ block: 'start' });
  }, [open, link, tab]);

  const blocks = guideTabContent(tab, content)?.blocks ?? [];
  return (
    <FloatingWindow id={GUIDE_WINDOW_ID} title="Guide" open={open} onClose={onClose} initialSize={GUIDE_WINDOW_SIZE} minSize={{ width: 300, height: 220 }}>
      <div className="sgl-guide">
        <HorizontalTabs tabs={TABS} active={tab} onActive={setTab} label="Guide sections">
          <div className="sgl-guide-pad" ref={body}>
            {blocks.length === 0 ? (
              <p className="sgl-guide-empty">Nothing here yet.</p>
            ) : (
              blocks.map((b) => <ExplainerView key={b.id} explainer={b} renderDiagram={renderDiagram} />)
            )}
          </div>
        </HorizontalTabs>
      </div>
    </FloatingWindow>
  );
}
