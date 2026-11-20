import type { Explainer } from '@app/ui/guideContracts';
import { AI_KIT_FILE_NAME, aiKitUrl, TEMPLATE_FILE_NAME, UPLOAD_INFO } from './analyseModel';

/** Id of the ⓘ of "Upload your own (.ts)" (its window's place and size are remembered by it). */
export const UPLOAD_EXPLAINER_ID = 'upload-your-own';

/** Its window's opening size: larger than the default explainer (360 × 300) so the downloads are in view. */
export const UPLOAD_EXPLAINER_WINDOW_SIZE = { width: 440, height: 360 } as const;

/**
 * The ⓘ of "Upload your own (.ts)" (owner 2026-11-19): the same movable, resizable pop-up as the
 * other ⓘ explainers. What an analysis can read, then how to start: the AI kit (a zip served from
 * `public/downloads/`, saved through a plain link under the app's base path) or the template
 * (loaded only when clicked).
 */
export function uploadExplainer(baseUrl: string): Explainer {
  return {
    id: UPLOAD_EXPLAINER_ID,
    title: 'Upload your own analysis',
    summary: UPLOAD_INFO,
    example: 'Ask an AI assistant for “the rooms two steps from a room”, then upload the .ts file it writes.',
    // Opens tall enough that both downloads show without scrolling (2026-11-20; fits 1366 × 768).
    windowSize: UPLOAD_EXPLAINER_WINDOW_SIZE,
    downloads: [
      { label: 'AI kit (.zip)', fileName: AI_KIT_FILE_NAME, href: aiKitUrl(baseUrl), note: 'attach it to an AI assistant and describe your idea.' },
      {
        label: 'Template (.ts)',
        fileName: TEMPLATE_FILE_NAME,
        note: 'change it yourself, then upload it here.',
        load: () => import('../../docs/templates/graph-analysis-template.ts?raw').then((m) => m.default),
      },
    ],
  };
}
