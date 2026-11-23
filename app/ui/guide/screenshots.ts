import type { Explainer } from '../guideContracts';
import captured from './screenshots.json';

/**
 * Screenshots of the real app for Guide entries, captured by `scripts/guide-shots.mjs` (rerun it
 * when the UI changes). The script writes the images to `public/guide/` and their numbered marker
 * centres (fractions 0–1 of the image width/height) to `screenshots.json`; the alt text, which says
 * what each number points at, is written here by hand.
 */
export interface CapturedShot {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly markers: readonly { readonly n: number; readonly x: number; readonly y: number }[];
}

export const CAPTURED_SHOTS: Readonly<Record<string, CapturedShot>> = captured as Record<string, CapturedShot>;

/** Alt text per entry id (what the screenshot shows and what each marker points at). */
export const SHOT_ALT: Readonly<Record<string, string>> = {
  'howto-start': 'The Welcome screen: 1 Create project, 2 Open project, 3 Open example…, 4 Recent projects.',
  'howto-open-example': 'Open example… over the Welcome screen: 1 the Open example dialog, listing House – graph only (No toolkit) and the House designs, 2 Garden house, a design in the Toolkit: House section.',
  'howto-select-inspect': 'The app with the Living node selected: 1 the node in Graph 2D, 2 its room highlighted in the Building view, 3 its attributes in Properties.',
  'howto-add-room': 'A new node 6 added: 1 the + Add node button, 2 its Function in Properties, 3 its Position and Size.',
  'howto-connect': 'A new edge Entrance–Bath: 1 the Entrance node, 2 the Add edge… button, 3 the Bath node, 4 Access or Open in Properties.',
  'howto-add-attribute': 'Adding an attribute: 1 Attributes in the left rail, 2 + Add attribute, 3 Custom attribute in the dialog, 4 the Custom section in Properties.',
  'howto-run-analysis': 'Degree of the Living node: 1 the selected node, 2 Analyse in the left rail, 3 the Degree button, 4 the result 3, 5 Clear.',
  'howto-query': 'Shortest path from the Entrance to the Bath: 1 the Queries section, 2 Shortest path, 3 the Entrance, 4 the Bath, 5 the result.',
  'howto-transform-undo': 'Grow to target area previewed: 1 Transform in the left rail, 2 Grow to target area, 3 Run, 4 the preview, 5 Apply, 6 Undo.',
  'howto-upload-analysis': 'The top of Analyse: 1 Upload your own (.ts), 2 its ⓘ with the AI kits and the templates, 3 the sections an upload can land in.',
  'howto-read-data-view': 'The Data view as a table: 1 the view menu set to Data, 2 JSON or Table, 3 the Living row, selected, 4 a locked column.',
  'howto-save': 'The Project panel: 1 Project in the left rail, 2 Save locally, 3 Export project, 4 Open project.',
  'panel-properties': 'Properties of the Living node: 1 its title, Living · Node 2, 2 Required by the app, 3 Geometry, 4 Custom.',
  'panel-attributes': 'The Attributes panel: 1 Node and Edge tabs, 2 the five sections, 3 + Add attribute.',
  'panel-designer': 'The Building Designer: 1 Style rooms by, 2 the Default card, 3 + Style another function, 4 the Corridors section.',
  'panel-analyse': 'The Analyse panel: 1 Upload your own (.ts), 2 the Show filter, 3 Node, 4 Edge, 5 Network, 6 Queries.',
  'panel-transform': 'The Transform panel: 1 Grow to target area, 2 the Houses parameter, 3 Run, 4 the preview, 5 Apply and Discard.',
  'panel-scenarios': 'The Scenarios panel: 1 Scenario 1, 2 a second scenario, 3 + New scenario.',
  'panel-camera': 'The Camera panel: 1 Target viewport, 2 Save current view, 3 Saved cameras.',
  'panel-display': 'The Display panel: 1 the view buttons, 2 Labels, Legend and Roofs, 3 Colours.',
  'panel-project': 'The Project panel: 1 Save locally, 2 Export project, 3 Open project, 4 New project, 5 Open example….',
};

/** The explainer with its captured screenshot attached (unchanged when none was captured). */
export function withScreenshot(e: Explainer): Explainer {
  const shot = CAPTURED_SHOTS[e.id];
  const alt = SHOT_ALT[e.id];
  if (!shot || alt === undefined) return e;
  return { ...e, screenshot: { src: shot.src, alt, markers: shot.markers } };
}
