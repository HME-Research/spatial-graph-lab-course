import type { Explainer } from '@app/ui/guideContracts';
import { AI_PROMPT_GUIDE } from '@app/ui/guide/aiPrompt';
import { AI_KIT_FILE_NAME, aiKitUrl, TEMPLATE_FILE_NAME, UPLOAD_INFO } from './analyseModel';

/** Id of the ⓘ of "Upload your own (.ts)" (its window's place and size are remembered by it). */
export const UPLOAD_EXPLAINER_ID = 'upload-your-own';

/** Its window's opening size: larger than the default explainer (520 × 480) so the downloads are in view. */
export const UPLOAD_EXPLAINER_WINDOW_SIZE = { width: 560, height: 560 } as const;

/**
 * The ⓘ of "Upload your own (.ts)" (owner 2026-11-19): the same movable, resizable pop-up as the
 * other ⓘ explainers. What an analysis can read, then how to start: the AI kit (a zip served from
 * `public/downloads/`, saved through a plain link under the app's base path) or the template
 * (loaded only when clicked), then how to write the prompt sent with the kit (`AI_PROMPT_GUIDE`).
 */
export function uploadExplainer(baseUrl: string): Explainer {
  return {
    id: UPLOAD_EXPLAINER_ID,
    title: 'Upload your own analysis',
    summary: UPLOAD_INFO,
    example: 'Two ways to start. With the AI kit: attach the zip to an AI assistant, write your prompt as shown below (for example “the rooms two steps from a room I pick”), then upload the .ts file it writes. With the template: change it yourself, then upload it.',
    diagrams: [
      { diagram: 'route-ai', caption: 'With the AI kit: describe it' },
      { diagram: 'route-template', caption: 'From the template: write it yourself' },
    ],
    promptGuide: AI_PROMPT_GUIDE,
    // Opens big enough for its two diagrams and both downloads (2026-11-20; fits 1366 × 768).
    windowSize: UPLOAD_EXPLAINER_WINDOW_SIZE,
    downloads: [
      { label: 'AI kit (.zip)', fileName: AI_KIT_FILE_NAME, href: aiKitUrl(baseUrl), note: 'attach it to an AI assistant, then write your prompt (below).' },
      {
        label: 'Template (.ts)',
        fileName: TEMPLATE_FILE_NAME,
        note: 'change it yourself, then upload it here.',
        load: () => import('../../docs/templates/graph-analysis-template.ts?raw').then((m) => m.default),
      },
    ],
  };
}
