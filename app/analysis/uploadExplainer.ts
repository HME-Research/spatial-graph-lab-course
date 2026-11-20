import type { Explainer } from '@app/ui/guideContracts';
import { UPLOAD_INFO } from './analyseModel';

/** Id of the ⓘ of "Upload your own (.ts)" (its window's place and size are remembered by it). */
export const UPLOAD_EXPLAINER_ID = 'upload-your-own';

/** Its window's opening size: larger than the default explainer (520 × 480) so the kit tabs are in view. */
export const UPLOAD_EXPLAINER_WINDOW_SIZE = { width: 560, height: 600 } as const;

/**
 * The ⓘ of "Upload your own (.ts)" (owner 2026-11-19; tabs 2026-11-20): the same movable,
 * resizable pop-up as the other ⓘ explainers. What an uploaded analysis is, then the AI kit tabs
 * (`AiKitTabs`: Any project · This project · Template), each with its download and prompt guide.
 */
export function uploadExplainer(): Explainer {
  return {
    id: UPLOAD_EXPLAINER_ID,
    title: 'Upload your own analysis',
    summary: UPLOAD_INFO,
    example: 'Ask an AI assistant for, say, “the largest room on each level”: download a kit below, attach it, write your prompt, then upload the .ts file it writes. Or change a template yourself.',
    diagrams: [
      { diagram: 'route-ai', caption: 'With an AI kit: describe it' },
      { diagram: 'route-template', caption: 'From a template: write it yourself' },
    ],
    // Opens big enough for its two diagrams and the kit tabs (2026-11-20; fits 1366 × 768).
    windowSize: UPLOAD_EXPLAINER_WINDOW_SIZE,
    aiKits: true,
  };
}
