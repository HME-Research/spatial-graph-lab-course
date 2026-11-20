/**
 * Guide and floating-window contracts (Programme P4, shared definition, 19 November 2026;
 * docs/DECISIONS.md). Pure types and ids; the components are built in worktree B.
 */

/** Guide tabs, in order. */
export const GUIDE_TAB_IDS = ['graphs', 'attributes', 'views', 'panels', 'toolkits', 'how-to'] as const;
export type GuideTabId = (typeof GUIDE_TAB_IDS)[number];

export const GUIDE_TAB_LABELS: Readonly<Record<GuideTabId, string>> = {
  graphs: 'Graphs',
  attributes: 'Attributes',
  views: 'Views',
  panels: 'Panels',
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
 * ⓘ explainer: plain language, answer first, one tiny example, two contrasting diagrams (or one
 * when a contrast means nothing), one checked link. Examples are small, generic and made for the
 * purpose (rooms A, B, C…), never the built-in example house (owner 2026-11-20).
 */
export interface Explainer {
  readonly id: string;
  readonly title: string;
  /** One sentence: what it tells you / does. */
  readonly summary: string;
  /** A tiny example, using rooms. */
  readonly example: string;
  /**
   * Two contrasting cases side by side (additive 2026-11-20), e.g. Shared neighbours 0 vs 1: each a
   * diagram id with a one-line caption under it. Shown before `diagram` when both are set.
   */
  readonly diagrams?: readonly [GuideDiagramCase, GuideDiagramCase];
  /** Id of a small diagram component (rendered by the explainer), e.g. a panel mock-up or steps. */
  readonly diagram?: string;
  /** One reliable external link. */
  readonly learnMore?: { readonly label: string; readonly url: string };
  /** Files the student can save (e.g. a template); each is loaded only when clicked. */
  readonly downloads?: readonly GuideDownload[];
  /**
   * Opening size of its pop-up window (`ExplainerWindow`, additive 2026-11-20); default 520 × 480,
   * centred. The window is remembered per size, so a new size takes effect over an older remembered one.
   */
  readonly windowSize?: { readonly width: number; readonly height: number };
  /**
   * Optional screenshot of the real app, shown under the diagram. Captured by a script (so it can
   * be retaken when the UI changes); the numbered markers are drawn by the Guide over the image
   * and use the same numbers as the diagram's steps.
   */
  readonly screenshot?: {
    readonly src: string;
    readonly alt: string;
    /** Marker centres as fractions (0–1) of the image width/height. */
    readonly markers: readonly { readonly n: number; readonly x: number; readonly y: number }[];
  };
}

/** One case of an explainer's contrasting pair: a diagram id and the one-line caption under it. */
export interface GuideDiagramCase {
  readonly diagram: string;
  readonly caption: string;
}

/**
 * A file offered by the Guide or an ⓘ explainer: a text file loaded on click (`load`, P4 item I:
 * the analysis template and the AI prompt) or, additive 2026-11-19, a file served as it is
 * (`href`, any type, e.g. the AI kit zip under `public/downloads/`), saved through a plain link.
 */
export type GuideDownload = GuideTextDownload | GuideLinkDownload;

interface GuideDownloadBase {
  readonly label: string;
  /** Name the browser saves it under. */
  readonly fileName: string;
  /** Optional words after the button: what to do with the file (additive 2026-11-19). */
  readonly note?: string;
}

/** A text file loaded on click. */
export interface GuideTextDownload extends GuideDownloadBase {
  /** The file text, loaded on click (a lazy `?raw` import, so the main bundle does not carry it). */
  readonly load: () => Promise<string>;
}

/** A file served as it is (binary allowed), saved through a plain `<a href download>` link. */
export interface GuideLinkDownload extends GuideDownloadBase {
  /** Its URL, under the app's base path (`import.meta.env.BASE_URL`). */
  readonly href: string;
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
