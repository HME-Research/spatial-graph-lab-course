/**
 * Analyse / Transform structure (Programme P4, shared definition, 19 November 2026;
 * docs/DECISIONS.md). Pure presentation data; nothing here runs an algorithm.
 *
 * - The TAB comes from how an algorithm is defined: graph algorithms return results (Analyse);
 *   spatial algorithms return changes (Transform).
 * - Every analysis declares an exact, ordered list of INPUTS. From that list alone the app derives
 *   (a) its Analyse SECTION and (b) how the student supplies the inputs (see `inputPrompts`).
 * - The SOURCE (built-in, a toolkit, or uploaded by the student) is shown as a tag.
 *
 * Replaces the Explore / Analyse / Generate grouping in `algorithmGroups.ts` (worktree F).
 */

export const ALGORITHM_TABS = ['analyse', 'transform'] as const;
export type AlgorithmTab = (typeof ALGORITHM_TABS)[number];

export const ALGORITHM_TAB_LABELS: Readonly<Record<AlgorithmTab, { readonly label: string; readonly summary: string }>> = {
  analyse: { label: 'Analyse', summary: 'Reads your design and shows a result. Never changes it.' },
  transform: { label: 'Transform', summary: 'Proposes a change to your design: preview, then Apply (one undo step).' },
};

/**
 * One input an analysis needs. Nodes and edges are picked in any view (one at a time, in order);
 * numbers are typed into a small field.
 */
export type AnalysisInput =
  | { readonly kind: 'node'; readonly label: string }
  | { readonly kind: 'edge'; readonly label: string }
  | { readonly kind: 'number'; readonly label: string; readonly min?: number; readonly max?: number; readonly default?: number };

/** The exact, ordered inputs of an analysis. `[]` = the whole network. */
export type AnalysisInputs = readonly AnalysisInput[];

export const ANALYSE_SECTION_IDS = ['node', 'edge', 'network', 'queries'] as const;
export type AnalyseSectionId = (typeof ANALYSE_SECTION_IDS)[number];

export const ANALYSE_SECTIONS: Readonly<
  Record<AnalyseSectionId, { readonly title: string; readonly subtitle: string; readonly openByDefault: boolean }>
> = {
  node: { title: 'Node', subtitle: 'about the selected node', openByDefault: true },
  edge: { title: 'Edge', subtitle: 'about the selected edge', openByDefault: true },
  network: { title: 'Network', subtitle: 'measures of the whole graph', openByDefault: false },
  queries: { title: 'Queries', subtitle: 'inputs you pick', openByDefault: false },
};

/**
 * The Analyse section, derived only from the inputs:
 * none → Network; exactly one node → Node; exactly one edge → Edge; anything else
 * (several items, a mix, or any number) → Queries.
 */
export function analyseSectionFor(inputs: AnalysisInputs): AnalyseSectionId {
  if (inputs.length === 0) return 'network';
  if (inputs.length === 1 && inputs[0]!.kind === 'node') return 'node';
  if (inputs.length === 1 && inputs[0]!.kind === 'edge') return 'edge';
  return 'queries';
}

/**
 * How the inputs are collected, in order. Node / Edge sections run on the current selection
 * (`useSelection: true`). Queries ask for each input in turn: the current selection fills the
 * first input when its kind matches; nodes/edges are picked in any view; numbers are typed.
 */
export interface InputPrompt {
  readonly index: number;
  readonly kind: AnalysisInput['kind'];
  /** e.g. "Pick From (a node) in any view" or "Steps". */
  readonly text: string;
}

export function inputPrompts(inputs: AnalysisInputs): { readonly useSelection: boolean; readonly prompts: readonly InputPrompt[] } {
  const section = analyseSectionFor(inputs);
  if (section === 'node' || section === 'edge' || section === 'network') return { useSelection: section !== 'network', prompts: [] };
  return {
    useSelection: false,
    prompts: inputs.map((input, index) => ({
      index,
      kind: input.kind,
      text: input.kind === 'number' ? input.label : `Pick ${input.label} (${input.kind === 'node' ? 'a node' : 'an edge'}) in any view`,
    })),
  };
}

/** Readable reason when a picked item has the wrong kind, else null. */
export function pickMismatch(expected: AnalysisInput, picked: 'node' | 'edge'): string | null {
  if (expected.kind === 'number' || expected.kind === picked) return null;
  return `${expected.label} needs ${expected.kind === 'node' ? 'a node' : 'an edge'}, not ${picked === 'node' ? 'a node' : 'an edge'}.`;
}

export const TRANSFORM_SECTION_IDS = ['built-in', 'toolkit'] as const;
export type TransformSectionId = (typeof TRANSFORM_SECTION_IDS)[number];

/** Where an algorithm (or a custom attribute) comes from; shown as a small rounded tag. */
export type AlgorithmSource =
  | { readonly kind: 'built-in' }
  | { readonly kind: 'toolkit'; readonly toolkitName: string }
  | { readonly kind: 'yours' };

export function sourceTag(source: AlgorithmSource): string {
  switch (source.kind) {
    case 'built-in':
      return 'Built-in';
    case 'toolkit':
      return `Toolkit: ${source.toolkitName}`;
    case 'yours':
      return 'Yours';
  }
}

/** Built-in analyses: id, inputs, and whether shown from the start (else offered by "+"). */
export interface BuiltInAnalysis {
  readonly id: string;
  readonly name: string;
  readonly inputs: AnalysisInputs;
  readonly shownAtStart: boolean;
}

const NODE: AnalysisInputs = [{ kind: 'node', label: 'Node' }];
const EDGE: AnalysisInputs = [{ kind: 'edge', label: 'Edge' }];
const NONE: AnalysisInputs = [];

export const BUILT_IN_ANALYSES: readonly BuiltInAnalysis[] = [
  { id: 'degree', name: 'Degree', inputs: NODE, shownAtStart: true },
  { id: 'neighbours', name: 'Neighbours', inputs: NODE, shownAtStart: true },
  { id: 'routes-through', name: 'Routes through it', inputs: EDGE, shownAtStart: true },
  { id: 'touching-edges', name: 'Touching edges', inputs: EDGE, shownAtStart: true },
  { id: 'shared-neighbours', name: 'Shared neighbours', inputs: EDGE, shownAtStart: true },
  { id: 'ends-connections', name: 'Ends’ connections', inputs: EDGE, shownAtStart: true },
  { id: 'summary', name: 'Summary', inputs: NONE, shownAtStart: true },
  { id: 'most-connected-node', name: 'Most connected node', inputs: NONE, shownAtStart: true },
  { id: 'connected-parts', name: 'Connected parts', inputs: NONE, shownAtStart: true },
  { id: 'bridges', name: 'Bridges', inputs: NONE, shownAtStart: false },
  { id: 'cut-nodes', name: 'Cut nodes', inputs: NONE, shownAtStart: false },
  { id: 'leaf-nodes', name: 'Leaf nodes', inputs: NONE, shownAtStart: false },
  { id: 'diameter', name: 'Diameter', inputs: NONE, shownAtStart: false },
  { id: 'most-central-node', name: 'Most central node', inputs: NONE, shownAtStart: false },
  {
    id: 'shortest-path',
    name: 'Shortest path',
    inputs: [{ kind: 'node', label: 'From' }, { kind: 'node', label: 'To' }],
    shownAtStart: true,
  },
  {
    id: 'reach-within-k',
    name: 'Reach within k steps',
    inputs: [{ kind: 'node', label: 'Start' }, { kind: 'number', label: 'Steps', min: 1, default: 2 }],
    shownAtStart: false,
  },
];
