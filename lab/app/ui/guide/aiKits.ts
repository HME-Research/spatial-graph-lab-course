import { REFERENCE_TOOLKIT_FILES, REFERENCE_TOOLKIT_ID } from '@app/extensions';
import { storedZip } from './zip';

/**
 * The AI kits (owner 2026-11-20), built by the app when they are downloaded (`storedZip`):
 *
 * - **graph** (`docs/ai-kit/graph/`): a graph analysis, ids and relationships only; any project.
 * - **design** (`docs/ai-kit/design/`): a design analysis that uses only the room basics every
 *   project has; any project.
 * - **project**: the design kit plus a generated `PROJECT.md` describing the open project's
 *   Functions, custom fields (tagged Toolkit or Yours) and calculated values. Never the design itself.
 * - **transform** (2026-11-25, `docs/ai-kit/transform/`): an uploaded transform
 *   (`defineSpatialAlgorithm`) that uses only what every project has; any project.
 * - **transform-project**: the transform kit plus the generated `PROJECT.md` (worded for a
 *   transform: `ctx.nodeCustom` and the operations instead of `uses`).
 * - **toolkit** (2026-11-24): what a chat assistant needs to write a whole toolkit folder:
 *   `docs/ai-kit/toolkit/`, `docs/TOOLKITS.md`, `docs/STUDENT-API.md`, the starter
 *   `docs/templates/toolkit/my-toolkit/` (as `starter/my-toolkit/`) and the reference toolkit
 *   `toolkits/house/` without its façade files (as `examples/house/`). Never a project or design.
 *
 * Kit files are loaded only when a kit is built (lazy `?raw` imports). Pure apart from those imports.
 */

export type KitKind = 'graph' | 'design' | 'project' | 'toolkit' | 'transform' | 'transform-project';

interface KitFile {
  /** Path inside the kit folder. */
  readonly path: string;
  readonly load: () => Promise<string>;
}

const raw = (m: { default: string }) => m.default;

/** The graph kit's files, in zip order. */
export const GRAPH_KIT_FILES: readonly KitFile[] = [
  { path: 'PROMPT.md', load: () => import('../../../docs/ai-kit/graph/PROMPT.md?raw').then(raw) },
  { path: 'README.md', load: () => import('../../../docs/ai-kit/graph/README.md?raw').then(raw) },
  { path: 'examples/exactly-k-steps.ts', load: () => import('../../../docs/ai-kit/graph/examples/exactly-k-steps.ts?raw').then(raw) },
  { path: 'examples/shortest-route.ts', load: () => import('../../../docs/ai-kit/graph/examples/shortest-route.ts?raw').then(raw) },
  { path: 'student-api.d.ts', load: () => import('../../../docs/ai-kit/graph/student-api.d.ts?raw').then(raw) },
];

/** The design kit's files, in zip order (the project kit adds `PROJECT.md` after `PROMPT.md`). */
export const DESIGN_KIT_FILES: readonly KitFile[] = [
  { path: 'PROMPT.md', load: () => import('../../../docs/ai-kit/design/PROMPT.md?raw').then(raw) },
  { path: 'README.md', load: () => import('../../../docs/ai-kit/design/README.md?raw').then(raw) },
  { path: 'examples/below-target-area.ts', load: () => import('../../../docs/ai-kit/design/examples/below-target-area.ts?raw').then(raw) },
  { path: 'examples/largest-room-per-level.ts', load: () => import('../../../docs/ai-kit/design/examples/largest-room-per-level.ts?raw').then(raw) },
  { path: 'examples/same-function-neighbours.ts', load: () => import('../../../docs/ai-kit/design/examples/same-function-neighbours.ts?raw').then(raw) },
  { path: 'student-api.d.ts', load: () => import('../../../docs/ai-kit/design/student-api.d.ts?raw').then(raw) },
];

/** The transform kit's files, in zip order (the kit for a project adds `PROJECT.md` after `PROMPT.md`). */
export const TRANSFORM_KIT_FILES: readonly KitFile[] = [
  { path: 'PROMPT.md', load: () => import('../../../docs/ai-kit/transform/PROMPT.md?raw').then(raw) },
  { path: 'README.md', load: () => import('../../../docs/ai-kit/transform/README.md?raw').then(raw) },
  { path: 'examples/connect-touching-rooms.ts', load: () => import('../../../docs/ai-kit/transform/examples/connect-touching-rooms.ts?raw').then(raw) },
  { path: 'examples/grow-in-one-direction.ts', load: () => import('../../../docs/ai-kit/transform/examples/grow-in-one-direction.ts?raw').then(raw) },
  { path: 'examples/priority-from-missing-area.ts', load: () => import('../../../docs/ai-kit/transform/examples/priority-from-missing-area.ts?raw').then(raw) },
  { path: 'student-api.d.ts', load: () => import('../../../docs/ai-kit/transform/student-api.d.ts?raw').then(raw) },
];

/** The toolkit kit's own files, in zip order; the starter and the reference toolkit follow them. */
export const TOOLKIT_KIT_FILES: readonly KitFile[] = [
  { path: 'PROMPT.md', load: () => import('../../../docs/ai-kit/toolkit/PROMPT.md?raw').then(raw) },
  { path: 'README.md', load: () => import('../../../docs/ai-kit/toolkit/README.md?raw').then(raw) },
  { path: 'TOOLKITS.md', load: () => import('../../../docs/TOOLKITS.md?raw').then(raw) },
  { path: 'STUDENT-API.md', load: () => import('../../../docs/STUDENT-API.md?raw').then(raw) },
];

/** The starter toolkit (`docs/templates/toolkit/my-toolkit/`), paths inside its folder. */
export const STARTER_TOOLKIT_FILES: readonly KitFile[] = [
  { path: 'README.md', load: () => import('../../../docs/templates/toolkit/my-toolkit/README.md?raw').then(raw) },
  { path: 'toolkit.ts', load: () => import('../../../docs/templates/toolkit/my-toolkit/toolkit.ts?raw').then(raw) },
  { path: 'functions/README.md', load: () => import('../../../docs/templates/toolkit/my-toolkit/functions/README.md?raw').then(raw) },
  { path: 'functions/circulation.ts', load: () => import('../../../docs/templates/toolkit/my-toolkit/functions/circulation.ts?raw').then(raw) },
  { path: 'functions/room.ts', load: () => import('../../../docs/templates/toolkit/my-toolkit/functions/room.ts?raw').then(raw) },
  { path: 'algorithms/README.md', load: () => import('../../../docs/templates/toolkit/my-toolkit/algorithms/README.md?raw').then(raw) },
  { path: 'algorithms/occupancy-around.ts', load: () => import('../../../docs/templates/toolkit/my-toolkit/algorithms/occupancy-around.ts?raw').then(raw) },
  { path: 'algorithms/occupancy-from-area.ts', load: () => import('../../../docs/templates/toolkit/my-toolkit/algorithms/occupancy-from-area.ts?raw').then(raw) },
  { path: 'designs/README.md', load: () => import('../../../docs/templates/toolkit/my-toolkit/designs/README.md?raw').then(raw) },
  { path: 'designs/first-design.json', load: () => import('../../../docs/templates/toolkit/my-toolkit/designs/first-design.json?raw').then(raw) },
  { path: 'assets/README.md', load: () => import('../../../docs/templates/toolkit/my-toolkit/assets/README.md?raw').then(raw) },
];

/** The reference toolkit's text files, as kit files under `examples/<id>/`, sorted by path. */
export function referenceToolkitFiles(): readonly KitFile[] {
  const prefix = `/toolkits/${REFERENCE_TOOLKIT_ID}/`;
  return Object.entries(REFERENCE_TOOLKIT_FILES)
    .filter(([key]) => key.startsWith(prefix))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, load]) => ({ path: `examples/${REFERENCE_TOOLKIT_ID}/${key.slice(prefix.length)}`, load }));
}

/** Every file of the toolkit kit, in zip order. */
export function toolkitKitFiles(): readonly KitFile[] {
  return [...TOOLKIT_KIT_FILES, ...STARTER_TOOLKIT_FILES.map((f) => ({ ...f, path: `starter/my-toolkit/${f.path}` })), ...referenceToolkitFiles()];
}

/** The templates (Template tab): two for analyses, one for transforms (2026-11-25). */
export const TEMPLATES = {
  graph: { fileName: 'graph-analysis-template.ts', load: () => import('../../../docs/templates/graph-analysis-template.ts?raw').then(raw) },
  design: { fileName: 'design-analysis-template.ts', load: () => import('../../../docs/templates/design-analysis-template.ts?raw').then(raw) },
  transform: { fileName: 'transform-template.ts', load: () => import('../../../docs/templates/transform-template.ts?raw').then(raw) },
} as const;

// ── PROJECT.md ──────────────────────────────────────────────────────────────────────────────

export type Origin = 'toolkit' | 'yours';

/** One custom field as PROJECT.md describes it. */
export interface SheetField {
  readonly key: string;
  readonly label: string;
  readonly kind: 'text' | 'number' | 'boolean' | 'enum';
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly default?: string | number | boolean;
  readonly description?: string;
  readonly origin: Origin;
  /** Function id → its own default for this field. */
  readonly functionDefaults: readonly (readonly [string, string | number | boolean])[];
}

/** Plain data describing the open project (built by `projectSheetInput`); never the design itself. */
export interface ProjectSheetInput {
  /** The toolkit's id and name, or null for a project without a toolkit. */
  readonly toolkit: { readonly id: string; readonly name: string } | null;
  readonly functions: readonly { readonly id: string; readonly label: string; readonly origin: Origin }[];
  readonly nodeFields: readonly SheetField[];
  readonly edgeFields: readonly SheetField[];
  readonly metrics: readonly {
    readonly id: string;
    readonly label: string;
    readonly collection: 'nodes' | 'edges';
    readonly valueKind: 'number' | 'boolean' | 'text';
    readonly unit?: string;
    readonly definition: string;
  }[];
  /** Size of one cell in metres: across (x, y) and one level high (z). */
  readonly cell: { readonly horizontal: number; readonly vertical: number };
}

const code = (s: string) => `\`${s}\``;
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const value = (v: string | number | boolean) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const originLabel = (o: Origin, input: ProjectSheetInput) => (o === 'toolkit' ? `Toolkit: ${input.toolkit?.name ?? 'toolkit'}` : 'Yours');

function kindText(f: SheetField): string {
  if (f.kind === 'enum') return `one of ${(f.values ?? []).map((v) => JSON.stringify(v)).join(', ')}`;
  if (f.kind === 'number') {
    const range = f.min !== undefined && f.max !== undefined ? ` ${f.min}–${f.max}` : f.min !== undefined ? ` ≥ ${f.min}` : f.max !== undefined ? ` ≤ ${f.max}` : '';
    return `number${range}`;
  }
  return f.kind === 'boolean' ? 'true / false' : 'text';
}

function fieldTable(fields: readonly SheetField[], input: ProjectSheetInput): string[] {
  const lines = ['| key | label | value | default | default per Function | from |', '|---|---|---|---|---|---|'];
  for (const f of fields) {
    const perFunction = f.functionDefaults.map(([fn, v]) => `${fn} ${value(v)}`).join(', ');
    lines.push(`| ${code(f.key)} | ${cell(f.label)} | ${cell(kindText(f))} | ${f.default !== undefined ? cell(value(f.default)) : '—'} | ${perFunction ? cell(perFunction) : '—'} | ${originLabel(f.origin, input)} |`);
  }
  const described = fields.filter((f) => f.description);
  if (described.length > 0) lines.push('', ...described.map((f) => `- ${code(f.key)}: ${f.description!.replace(/\r?\n/g, ' ')}`));
  return lines;
}

/** A made-up value of a field for the example rooms: its default, else a plain example of its kind. */
function exampleValue(f: SheetField): string | number | boolean {
  if (f.default !== undefined) return f.default;
  if (f.kind === 'enum') return f.values?.[0] ?? '';
  if (f.kind === 'number') return f.min ?? 1;
  return f.kind === 'boolean' ? false : 'text';
}

/** What PROJECT.md is written for: an analysis (with `uses`) or a transform (2026-11-25). */
export type SheetPurpose = 'analysis' | 'transform';

const SHEET_WORDS: Readonly<Record<SheetPurpose, { readonly intro: string; readonly nodeFields: string; readonly edgeFields: string; readonly example: string }>> = {
  analysis: {
    intro:
      'An analysis may use it, but must then list every Function id it names and every field it reads in `uses` ' +
      '(`uses: { functions: [...], nodeFields: [...], edgeFields: [...] }`), and it will work only in projects that have them. ',
    nodeFields: '## Custom node fields (`room.custom.<key>`, list them in `uses.nodeFields`)',
    edgeFields: '## Custom edge fields (`edge.custom.<key>`, list them in `uses.edgeFields`)',
    example: 'What `ctx.design` looks like for two nodes side by side when the analysis lists every field above in `uses`:',
  },
  transform: {
    intro:
      'A transform may use it: name its Functions (e.g. in `add-node`), read its custom fields with `ctx.nodeCustom(nodeId)` / `ctx.edgeCustom(edgeId)` ' +
      'and set them with `set-node-custom-attribute` / `set-edge-custom-attribute`. It then works only in projects that have them. ',
    nodeFields: '## Custom node fields (read `ctx.nodeCustom(nodeId)[key]`, set with `set-node-custom-attribute`)',
    edgeFields: '## Custom edge fields (read `ctx.edgeCustom(edgeId)[key]`, set with `set-edge-custom-attribute`)',
    example:
      'Two nodes side by side with every field above (in `ctx.design`, `custom` holds only the values set on the node itself; `ctx.nodeCustom(nodeId)` also gives the defaults):',
  },
};

/** PROJECT.md of the This project kit: the project's vocabulary, never its design. */
export function projectSheet(input: ProjectSheetInput, purpose: SheetPurpose = 'analysis'): string {
  const words = SHEET_WORDS[purpose];
  const out: string[] = [];
  out.push(`# This project: ${input.toolkit ? `toolkit ${input.toolkit.name}` : 'no toolkit'}`, '');
  out.push(
    'Written by Spatial Graph Lab when this kit was downloaded. It lists what THIS project has beyond what every project has. ' +
      words.intro +
      'If the project changes (a new Function or field), download the kit again.',
    '',
  );
  if (!input.toolkit) out.push('This project has no toolkit: its Functions and fields are its own (tagged **Yours** in the app).', '');

  out.push('## Functions (`room.function`)', '');
  if (input.functions.length === 0) out.push('This project has no Functions yet.', '');
  else {
    out.push('| id | label | from |', '|---|---|---|');
    for (const f of input.functions) out.push(`| ${code(f.id)} | ${cell(f.label)} | ${originLabel(f.origin, input)} |`);
    out.push('');
  }

  out.push(words.nodeFields, '');
  out.push(...(input.nodeFields.length === 0 ? ['This project has no custom node fields.'] : fieldTable(input.nodeFields, input)), '');
  out.push(words.edgeFields, '');
  out.push(...(input.edgeFields.length === 0 ? ['This project has no custom edge fields.'] : fieldTable(input.edgeFields, input)), '');
  out.push('A custom value may be missing or `null` ("no value"): check its type before using it.', '');

  out.push('## Calculated values (`ctx.metrics.value(id, itemId)`, every project has them)', '');
  out.push('| id | of | value | unit | what it is |', '|---|---|---|---|---|');
  for (const m of input.metrics) {
    out.push(`| ${code(m.id)} | ${m.collection === 'nodes' ? 'node' : 'edge'} | ${m.valueKind} | ${m.unit ?? '—'} | ${cell(m.label)}${m.definition ? `: ${cell(m.definition)}` : ''} |`);
  }
  out.push('');

  out.push('## Grid', '');
  out.push(
    `Each node becomes a room: a box of whole cells. One cell is ${input.cell.horizontal} × ${input.cell.horizontal} m and one level ${input.cell.vertical} m high. ` +
      '`position` is the node\'s minimum corner cell `[x, y, z]`; z is the level (0 = ground). `size` is `[sx, sy, sz]` in cells (sz = number of floors).',
    '',
  );

  // Two made-up rooms with this project's vocabulary (never the student's design).
  const [a, b] = [input.functions[0]?.id ?? 'room', input.functions[1]?.id ?? input.functions[0]?.id ?? 'room'];
  const custom = Object.fromEntries(input.nodeFields.map((f) => [f.key, exampleValue(f)]));
  const edgeCustom = Object.fromEntries(input.edgeFields.map((f) => [f.key, exampleValue(f)]));
  const example = {
    nodes: [
      { id: 1, function: a, position: [0, 0, 0], size: [2, 1, 1], custom },
      { id: 2, function: b, position: [2, 0, 0], size: [1, 1, 1], custom },
    ],
    edges: [{ id: 1, source: 1, target: 2, relationship: 'access', custom: edgeCustom }],
  };
  out.push('## Example (made up, not your design)', '');
  out.push(words.example, '');
  out.push('```json', JSON.stringify(example, null, 2), '```', '');
  return out.join('\n');
}

// ── Building a kit ──────────────────────────────────────────────────────────────────────────

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';

/** The zip's file name (its folder inside has the same name without `.zip`). */
export function kitFileName(kind: KitKind, toolkit?: { readonly id: string } | null): string {
  if (kind === 'graph') return 'spatial-graph-lab-graph-kit.zip';
  if (kind === 'design') return 'spatial-graph-lab-design-kit.zip';
  if (kind === 'toolkit') return 'spatial-graph-lab-toolkit-kit.zip';
  if (kind === 'transform') return 'spatial-graph-lab-transform-kit.zip';
  if (kind === 'transform-project') return `spatial-graph-lab-transform-kit-${toolkit ? slug(toolkit.id) : 'project'}.zip`;
  return `spatial-graph-lab-design-kit-${toolkit ? slug(toolkit.id) : 'project'}.zip`;
}

/** Whether a kit is built for the open project (it needs `project` and adds PROJECT.md). */
export const isProjectKit = (kind: KitKind): boolean => kind === 'project' || kind === 'transform-project';

/** Build one kit as zip bytes. `project` is required for the project kit. */
export async function buildKit(kind: KitKind, project?: ProjectSheetInput): Promise<{ readonly fileName: string; readonly bytes: Uint8Array }> {
  if (isProjectKit(kind) && !project) throw new Error('the project kit needs the open project');
  const fileName = kitFileName(kind, project?.toolkit);
  const folder = fileName.replace(/\.zip$/, '');
  const transform = kind === 'transform' || kind === 'transform-project';
  const files = kind === 'graph' ? GRAPH_KIT_FILES : kind === 'toolkit' ? toolkitKitFiles() : transform ? TRANSFORM_KIT_FILES : DESIGN_KIT_FILES;
  const texts = await Promise.all(files.map(async (f) => ({ name: `${folder}/${f.path}`, text: await f.load() })));
  if (isProjectKit(kind)) texts.splice(1, 0, { name: `${folder}/PROJECT.md`, text: projectSheet(project!, transform ? 'transform' : 'analysis') });
  return { fileName, bytes: storedZip(texts) };
}
