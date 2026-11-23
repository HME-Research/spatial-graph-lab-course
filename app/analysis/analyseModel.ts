import type { Selection } from '@core/viewer/selection';
import type { AnalysisUses } from '@app/extensions';
import {
  ANALYSE_SECTION_IDS,
  BUILT_IN_ANALYSES,
  analyseSectionFor,
  inputPrompts,
  pickMismatch,
  type AlgorithmSource,
  type AnalyseSectionId,
  type AnalysisInputs,
  type InputPrompt,
} from '@app/ui/analysisSections';

/**
 * Pure model of the Analyse tab (Programme P4): which analyses are listed in which section, the
 * "+" catalogue of built-ins, the source filter, and the step-by-step input picking of Queries.
 * No React; the panel (`AnalysePanel.tsx`) renders it.
 */

// ── Items ───────────────────────────────────────────────────────────────────────────────────

/** One analysis as the panel lists it, from any source. */
export interface AnalysisItem {
  /** Unique in the panel: `built-in:<id>`, `toolkit:<algorithm id>` or `yours:<upload id>`. */
  readonly key: string;
  /** Built-in id, the toolkit algorithm id, or the upload id (`settings.uploadedAnalyses[].id`). */
  readonly id: string;
  readonly name: string;
  readonly inputs: AnalysisInputs;
  readonly section: AnalyseSectionId;
  readonly source: AlgorithmSource;
  /** False for a toolkit analysis or an upload whose definition is invalid (listed with its problems), or an upload still loading. */
  readonly enabled: boolean;
  readonly problems: readonly string[];
  /** Set for a design analysis (it reads the rooms themselves): what it needs from the project. */
  readonly design?: DesignNeeds;
}

/**
 * What a design analysis needs beyond what every project has (owner 2026-11-20): plain phrases
 * such as `Function “bedroom”` or `room field “targetArea”`. Empty: it works in any project.
 */
export interface DesignNeeds {
  readonly needs: readonly string[];
}

/** A design analysis's `uses` as plain phrases (for its tag and ⓘ). */
export function designNeeds(uses: AnalysisUses | undefined): DesignNeeds {
  return {
    needs: [
      ...(uses?.functions ?? []).map((id) => `Function “${id}”`),
      ...(uses?.nodeFields ?? []).map((key) => `room field “${key}”`),
      ...(uses?.edgeFields ?? []).map((key) => `relationship field “${key}”`),
    ],
  };
}

/** The tag of a design analysis: "Any project" or "This project", with what it reads as its title. */
export function designTag(design: DesignNeeds): { readonly text: string; readonly title: string } {
  return design.needs.length === 0
    ? { text: 'Any project', title: 'Reads the rooms (Function, size, position, calculated values). Works in any project.' }
    : { text: 'This project', title: `Reads the rooms and uses ${design.needs.join(', ')}. Works only in projects that have them.` };
}

export const builtInKey = (id: string) => `built-in:${id}`;
export const toolkitKey = (id: string) => `toolkit:${id}`;
export const yoursKey = (uploadId: string) => `yours:${uploadId}`;

/** The built-ins listed when the project never chose (`shownAtStart`), in catalogue order. */
export const DEFAULT_SHOWN_ANALYSES: readonly string[] = BUILT_IN_ANALYSES.filter((a) => a.shownAtStart).map((a) => a.id);

/**
 * The project's listed built-ins (`settings.analyses`, validated at runtime): absent or not a list →
 * the defaults; otherwise the known ids only, in catalogue order (unknown ids are ignored).
 */
export function sanitizeShownAnalyses(stored: unknown): readonly string[] {
  if (!Array.isArray(stored)) return DEFAULT_SHOWN_ANALYSES;
  const wanted = new Set(stored.filter((id): id is string => typeof id === 'string'));
  return BUILT_IN_ANALYSES.filter((a) => wanted.has(a.id)).map((a) => a.id);
}

/** Add (`on`) or remove a built-in from the listed ones; canonical order. */
export function setAnalysisShown(shown: readonly string[], id: string, on: boolean): readonly string[] {
  const next = new Set(shown);
  if (on) next.add(id);
  else next.delete(id);
  return BUILT_IN_ANALYSES.filter((a) => next.has(a.id)).map((a) => a.id);
}

/** Every built-in of a section with whether it is listed (the "+" catalogue). */
export function catalogueFor(section: AnalyseSectionId, shown: readonly string[]): readonly { readonly id: string; readonly name: string; readonly shown: boolean }[] {
  const listed = new Set(shown);
  return BUILT_IN_ANALYSES.filter((a) => analyseSectionFor(a.inputs) === section).map((a) => ({ id: a.id, name: a.name, shown: listed.has(a.id) }));
}

/** A toolkit's graph analysis as the panel needs it (from `listAlgorithms`, graph scope only). */
export interface ToolkitAnalysisEntry {
  readonly id: string;
  readonly label: string;
  readonly inputs: AnalysisInputs;
  readonly enabled: boolean;
  readonly problems: readonly string[];
  readonly design?: DesignNeeds;
}

/**
 * An uploaded analysis as the panel needs it. One that failed (or is still loading) has no inputs
 * that can be trusted: it is listed, disabled, in Network with its reason.
 */
export interface UploadedAnalysisEntry {
  readonly uploadId: string;
  readonly label: string;
  readonly inputs: AnalysisInputs;
  readonly enabled: boolean;
  readonly problems: readonly string[];
  readonly design?: DesignNeeds;
}

/**
 * The listed items: shown built-ins first (catalogue order), then the toolkit's analyses (file
 * order), then the student's uploads (upload order).
 */
export function analysisItems(
  shown: readonly string[],
  toolkit: { readonly name: string; readonly analyses: readonly ToolkitAnalysisEntry[] } | null,
  uploads: readonly UploadedAnalysisEntry[] = [],
): readonly AnalysisItem[] {
  const listed = new Set(shown);
  const builtIns: AnalysisItem[] = BUILT_IN_ANALYSES.filter((a) => listed.has(a.id)).map((a) => ({
    key: builtInKey(a.id),
    id: a.id,
    name: a.name,
    inputs: a.inputs,
    section: analyseSectionFor(a.inputs),
    source: { kind: 'built-in' },
    enabled: true,
    problems: [],
  }));
  const fromToolkit: AnalysisItem[] = (toolkit?.analyses ?? []).map((a) => ({
    key: toolkitKey(a.id),
    id: a.id,
    name: a.label,
    inputs: a.inputs,
    section: analyseSectionFor(a.inputs),
    source: { kind: 'toolkit', toolkitName: toolkit!.name },
    enabled: a.enabled,
    problems: a.problems,
    ...(a.design && { design: a.design }),
  }));
  const yours: AnalysisItem[] = uploads.map((u) => ({
    key: yoursKey(u.uploadId),
    id: u.uploadId,
    name: u.label,
    inputs: u.inputs,
    section: analyseSectionFor(u.inputs),
    source: { kind: 'yours' },
    enabled: u.enabled,
    problems: u.problems,
    ...(u.design && { design: u.design }),
  }));
  return [...builtIns, ...fromToolkit, ...yours];
}

export const SOURCE_FILTERS = ['all', 'built-in', 'toolkit', 'yours'] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];
export const SOURCE_FILTER_LABELS: Readonly<Record<SourceFilter, string>> = { all: 'All', 'built-in': 'Built-in', toolkit: 'Toolkit', yours: 'Yours' };

export const matchesFilter = (source: AlgorithmSource, filter: SourceFilter): boolean => filter === 'all' || source.kind === filter;

/** Items per section, in section order, after the filter. */
export function itemsBySection(items: readonly AnalysisItem[], filter: SourceFilter): Readonly<Record<AnalyseSectionId, readonly AnalysisItem[]>> {
  const out = Object.fromEntries(ANALYSE_SECTION_IDS.map((s) => [s, [] as AnalysisItem[]])) as Record<AnalyseSectionId, AnalysisItem[]>;
  for (const item of items) if (matchesFilter(item.source, filter)) out[item.section].push(item);
  return out;
}

// ── Uploading your own analysis (one button at the top of the tab) ──────────────────────────

export const UPLOAD_BUTTON_LABEL = 'Upload your own (.ts)';
/** The plain note under the button. */
export const UPLOAD_NOTE = 'It appears in Node, Edge, Network or Queries, depending on its input.';
/** The ⓘ of the button: what an uploaded analysis is (the AI kit tabs below it say how to write one). */
export const UPLOAD_INFO =
  'An analysis reads your design and shows a result; it never changes your design. Write one with an AI assistant or from a template, then upload the .ts file.';

/** The section a new upload lands in (from its inputs): the one to open and bring into view. */
export const uploadLandingSection = (inputs: AnalysisInputs): AnalyseSectionId => analyseSectionFor(inputs);

// ── Running on the selection (Node / Edge) ──────────────────────────────────────────────────

/**
 * The inputs a Node / Edge / Network analysis runs with, from the current selection, or a hint
 * why it cannot run yet. Queries are not run this way (they collect inputs: `startPick`).
 */
export function selectionInputs(item: Pick<AnalysisItem, 'inputs' | 'section'>, selection: Selection): { readonly inputs: readonly number[] } | { readonly hint: string } {
  if (item.section === 'network') return { inputs: [] };
  if (item.section === 'node') return selection.kind === 'node' ? { inputs: [selection.id] } : { hint: 'Select a node first (in any view).' };
  if (item.section === 'edge') return selection.kind === 'edge' ? { inputs: [selection.id] } : { hint: 'Select an edge first (in any view).' };
  return { hint: 'Pick the inputs first.' };
}

// ── Picking inputs (Queries) ────────────────────────────────────────────────────────────────

/** A query collecting its inputs, one at a time. */
export interface PickState {
  readonly itemKey: string;
  readonly inputs: AnalysisInputs;
  /** One value per input (undefined: not given yet). */
  readonly values: readonly (number | undefined)[];
  /** Why the last pick was refused (wrong kind), else null. */
  readonly message: string | null;
}

/** Start collecting; the current selection fills the FIRST input of its kind; numbers start at their default. */
export function startPick(item: Pick<AnalysisItem, 'key' | 'inputs'>, selection: Selection): PickState {
  const values: (number | undefined)[] = item.inputs.map((i) => (i.kind === 'number' ? i.default : undefined));
  if (selection.kind === 'node' || selection.kind === 'edge') {
    const first = item.inputs.findIndex((i) => i.kind === selection.kind);
    if (first >= 0) values[first] = selection.id;
  }
  return { itemKey: item.key, inputs: item.inputs, values, message: null };
}

/** Index of the next node / edge input still to pick, or -1 when all are picked. */
export const nextPickIndex = (state: PickState): number => state.inputs.findIndex((i, n) => i.kind !== 'number' && state.values[n] === undefined);

/** The prompt to show now: the next node / edge to pick, else the first number to confirm; null when nothing remains. */
export function currentPrompt(state: PickState): InputPrompt | null {
  const { prompts } = inputPrompts(state.inputs);
  const next = nextPickIndex(state);
  if (next >= 0) return prompts[next] ?? null;
  const number = state.inputs.findIndex((i) => i.kind === 'number');
  return number >= 0 ? (prompts[number] ?? null) : null;
}

/** A node or edge was picked in a view: fill the next input of that kind, or refuse it with a reason. */
export function applyPick(state: PickState, picked: { readonly kind: 'node' | 'edge'; readonly id: number }): PickState {
  const next = nextPickIndex(state);
  if (next < 0) return state;
  const mismatch = pickMismatch(state.inputs[next]!, picked.kind);
  if (mismatch) return { ...state, message: mismatch };
  const values = [...state.values];
  values[next] = picked.id;
  return { ...state, values, message: null };
}

/** A number was typed (NaN: cleared). */
export function setPickNumber(state: PickState, index: number, value: number): PickState {
  if (state.inputs[index]?.kind !== 'number') return state;
  const values = [...state.values];
  values[index] = Number.isFinite(value) ? value : undefined;
  return { ...state, values, message: null };
}

/** Every node / edge input is picked (numbers are confirmed with Run). */
export const allPicked = (state: PickState): boolean => nextPickIndex(state) < 0;

/** Whether the query needs a typed number (then it runs on "Run", not automatically after the last pick). */
export const hasNumberInput = (state: Pick<PickState, 'inputs'>): boolean => state.inputs.some((i) => i.kind === 'number');

/** The values to run with, or a reason (missing input, number outside min/max). */
export function pickedInputs(state: PickState): { readonly inputs: readonly number[] } | { readonly problem: string } {
  const out: number[] = [];
  for (const [n, input] of state.inputs.entries()) {
    const v = state.values[n];
    if (v === undefined) return { problem: input.kind === 'number' ? `Type a number for ${input.label}.` : `Pick ${input.label} first.` };
    if (input.kind === 'number') {
      if (input.min !== undefined && v < input.min) return { problem: `${input.label} must be at least ${input.min}.` };
      if (input.max !== undefined && v > input.max) return { problem: `${input.label} must be at most ${input.max}.` };
    }
    out.push(v);
  }
  return { inputs: out };
}

/** "From 3 · To ?" — what has been picked so far. */
export function pickSummary(state: PickState): string {
  return state.inputs.map((i, n) => `${i.label} ${state.values[n] ?? '?'}`).join(' · ');
}
