/**
 * Analyse / Transform structure (Programme P4, shared definition, 19 November 2026;
 * docs/DECISIONS.md). Pure presentation data; nothing here runs an algorithm.
 *
 * - The TAB comes from how an algorithm is defined: graph algorithms return results (Analyse);
 *   spatial algorithms return changes (Transform).
 * - The Analyse SECTION comes from the algorithm's REQUIRED `input` declaration.
 * - The SOURCE (built-in, a toolkit, or uploaded by the student) is shown as a tag.
 *
 * Replaces the Explore / Analyse / Generate grouping in `algorithmGroups.ts` (worktree F).
 */

export const ALGORITHM_TABS = ['analyse', 'transform'] as const;
export type AlgorithmTab = (typeof ALGORITHM_TABS)[number];

export const ALGORITHM_TAB_LABELS: Readonly<Record<AlgorithmTab, { readonly label: string; readonly summary: string }>> = {
  analyse: { label: 'Analyse', summary: 'Reads the graph and shows a result. Never changes your design.' },
  transform: { label: 'Transform', summary: 'Proposes a change to your design: preview, then Apply (one undo step).' },
};

/** What a graph analysis needs before it can run. `'none'` = the whole network. */
export type AnalysisInput =
  | 'node'
  | 'edge'
  | 'none'
  | { readonly query: readonly QueryInput[] };

/** One input picked for a query (e.g. two nodes for Shortest path, a node and a number for Reach). */
export type QueryInput =
  | { readonly kind: 'node'; readonly label: string }
  | { readonly kind: 'edge'; readonly label: string }
  | { readonly kind: 'number'; readonly label: string; readonly min?: number; readonly max?: number; readonly default?: number };

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

/** Which Analyse section an algorithm belongs to, from its input declaration. */
export function analyseSectionFor(input: AnalysisInput): AnalyseSectionId {
  if (input === 'node') return 'node';
  if (input === 'edge') return 'edge';
  if (input === 'none') return 'network';
  return 'queries';
}

export const TRANSFORM_SECTION_IDS = ['built-in', 'toolkit'] as const;
export type TransformSectionId = (typeof TRANSFORM_SECTION_IDS)[number];

/** Where an algorithm comes from; shown as a small rounded tag. */
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

/** Built-in analyses: id, section, and whether it is shown from the start (else offered by "+"). */
export interface BuiltInAnalysis {
  readonly id: string;
  readonly name: string;
  readonly section: AnalyseSectionId;
  readonly shownAtStart: boolean;
}

export const BUILT_IN_ANALYSES: readonly BuiltInAnalysis[] = [
  { id: 'degree', name: 'Degree', section: 'node', shownAtStart: true },
  { id: 'neighbours', name: 'Neighbours', section: 'node', shownAtStart: true },
  { id: 'shared-neighbours', name: 'Shared neighbours', section: 'edge', shownAtStart: true },
  { id: 'detour-if-removed', name: 'Detour if removed', section: 'edge', shownAtStart: false },
  { id: 'touching-edges', name: 'Touching edges', section: 'edge', shownAtStart: false },
  { id: 'summary', name: 'Summary', section: 'network', shownAtStart: true },
  { id: 'most-connected-node', name: 'Most connected node', section: 'network', shownAtStart: true },
  { id: 'connected-parts', name: 'Connected parts', section: 'network', shownAtStart: true },
  { id: 'bridges', name: 'Bridges', section: 'network', shownAtStart: false },
  { id: 'cut-nodes', name: 'Cut nodes', section: 'network', shownAtStart: false },
  { id: 'leaf-nodes', name: 'Leaf nodes', section: 'network', shownAtStart: false },
  { id: 'diameter', name: 'Diameter', section: 'network', shownAtStart: false },
  { id: 'most-central-node', name: 'Most central node', section: 'network', shownAtStart: false },
  { id: 'shortest-path', name: 'Shortest path', section: 'queries', shownAtStart: true },
  { id: 'reach-within-k', name: 'Reach within k steps', section: 'queries', shownAtStart: false },
];
