import type { Explainer } from '@app/ui/guideContracts';
import { tutorialPage } from '@app/ui/guide/links';

/**
 * The two ⓘ of the Transform tab (owner 2026-11-25):
 *
 * - the tab's own ⓘ (`TRANSFORM_EXPLAINER`, replacing the generic Analyse vs Transform explainer
 *   and its external link): what a transform is, the operations it can propose, how to use the
 *   tab, where transforms come from and how to make one;
 * - the ⓘ of "Upload your own (.ts)" (`transformUploadExplainer`): what an uploaded transform is,
 *   then the transform AI kit tabs (Any project · This project · Template), as in Analyse.
 */

/** The upload button's label (the same words as in Analyse). */
export const TRANSFORM_UPLOAD_BUTTON_LABEL = 'Upload your own (.ts)';
/** The plain note under the button. */
export const TRANSFORM_UPLOAD_NOTE = 'It is listed under Yours, with its parameters. Run shows a preview; only Apply changes the design.';
/** What an uploaded transform is (the upload ⓘ's summary). */
export const TRANSFORM_UPLOAD_INFO =
  'A transform proposes changes to your design: you see them as a preview, and nothing changes until you Apply. Write one with an AI assistant or from the template, then upload the .ts file.';

/** Id of the ⓘ of Transform › Upload your own (.ts) (its window's place and size are remembered by it). */
export const TRANSFORM_UPLOAD_EXPLAINER_ID = 'upload-your-own-transform';

/** The ⓘ of Transform › Upload your own (.ts): what an uploaded transform is, then the transform kit tabs. */
export function transformUploadExplainer(): Explainer {
  return {
    id: TRANSFORM_UPLOAD_EXPLAINER_ID,
    title: 'Upload your own transform',
    summary: TRANSFORM_UPLOAD_INFO,
    example:
      'Ask an AI assistant for, say, “connect every two nodes that touch but have no edge yet”: download a kit below, attach it, write your prompt, then upload the .ts file it writes. Or change the template yourself.',
    diagrams: [
      { diagram: 'route-ai-transform', caption: 'With an AI kit: describe it' },
      { diagram: 'route-template-transform', caption: 'From the template: write it yourself' },
    ],
    windowSize: { width: 560, height: 600 },
    aiKits: 'transform',
  };
}

/** The ⓘ of the Transform tab: what a transform is and how to use, find and make one. */
export const TRANSFORM_EXPLAINER: Explainer = {
  id: 'transform-tab',
  title: 'Transform',
  summary:
    'A transform proposes changes to your design. Run shows them as a preview; nothing changes until you Apply, and one Undo reverses the whole change.',
  example:
    'A transform that connects nodes that touch: Run lists the edges it would add, e.g. “edge 7: access between 2 and 5”, and the design stays as it was. Apply adds all of them in one step; one Undo removes all of them again.',
  points: [
    {
      title: 'What a transform can propose',
      items: [
        'Add a node: a room of a Function, at a position, with a size.',
        'Add an edge between two nodes: Access (people can pass) or Open (no wall).',
        'Move or resize a node’s room (its position and size).',
        'Set a custom value of a node or an edge, e.g. a priority.',
        'Ask for a boundary shift on an edge.',
      ],
    },
    {
      title: 'How to use this tab',
      items: [
        'Choose a transform, under Yours or Toolkit.',
        'Set its parameters; an empty field uses the default.',
        'Run: the preview lists every change and the ids new nodes and edges will get.',
        'Apply changes the design as one Undo step; Discard drops the preview.',
        'Changed the design after Run? The preview is out of date and cannot be applied: Run it again.',
      ],
    },
    {
      title: 'Where transforms come from',
      items: [
        'Toolkit: the transforms of the project’s toolkit (its algorithms/ folder).',
        'Yours: a .ts file you upload with Upload your own (.ts) at the top of this tab. It is saved with the project.',
        'To make your own, open the ⓘ beside Upload your own (.ts): AI kits for any project or this project, and a template.',
      ],
    },
  ],
  diagram: 'transform-steps',
  tutorial: { label: 'Your transform (tutorial)', href: tutorialPage('04-your-own-transform') },
  windowSize: { width: 560, height: 600 },
};
