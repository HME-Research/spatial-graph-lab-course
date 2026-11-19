/**
 * Guide and floating-window contracts (Programme P4, shared definition, 19 November 2026;
 * docs/DECISIONS.md). Pure types and ids; the components are built in worktree B.
 */

/** Guide tabs, in order. */
export const GUIDE_TAB_IDS = ['graphs', 'attributes', 'views', 'toolkits', 'how-to'] as const;
export type GuideTabId = (typeof GUIDE_TAB_IDS)[number];

export const GUIDE_TAB_LABELS: Readonly<Record<GuideTabId, string>> = {
  graphs: 'Graphs',
  attributes: 'Attributes',
  views: 'Views',
  toolkits: 'Toolkits & JSON',
  'how-to': 'How to…',
};

/** A place in the Guide that an ⓘ can open ("More in the guide →"). */
export interface GuideLink {
  readonly tab: GuideTabId;
  /** Optional section anchor inside the tab. */
  readonly section?: string;
}

/**
 * Explainer content for one algorithm, section or concept. Same shape for the Guide and for every
 * ⓘ explainer: plain language, answer first, one tiny example, one diagram, one checked link.
 */
export interface Explainer {
  readonly id: string;
  readonly title: string;
  /** One sentence: what it tells you / does. */
  readonly summary: string;
  /** A tiny example, using rooms. */
  readonly example: string;
  /** Id of a small diagram component (rendered by the explainer). */
  readonly diagram?: string;
  /** One reliable external link. */
  readonly learnMore?: { readonly label: string; readonly url: string };
}

/** Props of the shared movable / resizable / minimisable window. */
export interface FloatingWindowProps {
  /** Stable id: the window's position, size and minimised state are remembered per id. */
  readonly id: string;
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly initialSize?: { readonly width: number; readonly height: number };
  readonly minSize?: { readonly width: number; readonly height: number };
}
