/**
 * Presentation of the Algorithms list (pure): three groups — Explore, Analyse, Generate — each
 * algorithm with its human-action name, a graph-theory sublabel and whether it is read-only or
 * changes the design. Nothing here runs or validates an algorithm.
 *
 * The Student API has no group or term field, so:
 * - spatial transformations always go to Generate (they change the design, after Apply);
 * - graph analyses go to Analyse, unless listed in `KNOWN_ALGORITHMS` as Explore;
 * - `KNOWN_ALGORITHMS` gives graph-theory sublabels for the owner's reference algorithms only.
 *   It is presentation data, pending the teaching (learning-objective) review; other algorithms
 *   get a generic sublabel from their scope.
 */
export const ALGORITHM_GROUPS = ['explore', 'analyse', 'generate'] as const;
export type AlgorithmGroup = (typeof ALGORITHM_GROUPS)[number];

export const ALGORITHM_GROUP_LABELS: Readonly<Record<AlgorithmGroup, { readonly label: string; readonly description: string }>> = {
  explore: { label: 'Explore', description: 'Follow the graph from room to room. Read-only.' },
  analyse: { label: 'Analyse', description: 'Measure the graph and show values on the rooms. Read-only.' },
  generate: { label: 'Generate', description: 'Propose changes to the design. Nothing changes until you Apply.' },
};

/** What the algorithm does to the design. */
export type AlgorithmEffect = 'read-only' | 'modifies' | 'unavailable';

export const EFFECT_LABELS: Readonly<Record<AlgorithmEffect, { readonly tag: string; readonly spoken: string; readonly description: string }>> = {
  'read-only': { tag: 'Read-only', spoken: ' analysis', description: 'Shows values only; never changes the design.' },
  modifies: { tag: 'Changes design', spoken: ' (transformation, after Apply)', description: 'Shows a preview; the design changes only when you Apply it (one undo step).' },
  unavailable: { tag: 'Disabled', spoken: ' (invalid definition)', description: 'Its definition is invalid, so it cannot run.' },
};

interface KnownAlgorithm {
  readonly group: AlgorithmGroup;
  readonly term: string;
}

/** Reference algorithms of the owner's projects (example-gallery, starter-template). */
export const KNOWN_ALGORITHMS: Readonly<Record<string, KnownAlgorithm>> = {
  'access-depth': { group: 'explore', term: 'Breadth-first search · graph distance' },
  'count-connections': { group: 'analyse', term: 'Node degree' },
  'connect-neighbours': { group: 'generate', term: 'Edge insertion · adjacent nodes' },
  'connect-storage-to-galleries': { group: 'generate', term: 'Rule-based edge insertion' },
  'daylight-from-exposure': { group: 'generate', term: 'Attribute update · exposed faces' },
};

export interface AlgorithmPresentationInput {
  readonly id: string;
  readonly scope: 'graph' | 'spatial' | 'unknown';
  readonly enabled: boolean;
}

export interface AlgorithmPresentation {
  readonly group: AlgorithmGroup;
  /** Graph-theory (or scope) sublabel. */
  readonly term: string;
  readonly effect: AlgorithmEffect;
}

export function presentAlgorithm(entry: AlgorithmPresentationInput): AlgorithmPresentation {
  const known = Object.prototype.hasOwnProperty.call(KNOWN_ALGORITHMS, entry.id) ? KNOWN_ALGORITHMS[entry.id] : undefined;
  // The scope decides read-only vs modifying; a table entry can never make a transformation look read-only.
  const group: AlgorithmGroup =
    entry.scope === 'spatial' ? 'generate' : known && known.group !== 'generate' ? known.group : 'analyse';
  const term = known && (known.group === 'generate') === (entry.scope === 'spatial') ? known.term : entry.scope === 'spatial' ? 'Spatial transformation' : 'Graph analysis';
  const effect: AlgorithmEffect = !entry.enabled || entry.scope === 'unknown' ? 'unavailable' : entry.scope === 'spatial' ? 'modifies' : 'read-only';
  return { group, term, effect };
}

/** Entries grouped in Explore → Analyse → Generate order (empty groups omitted), keeping list order inside a group. */
export function groupAlgorithms<E extends AlgorithmPresentationInput>(
  entries: readonly E[],
): readonly { readonly group: AlgorithmGroup; readonly items: readonly { readonly entry: E; readonly index: number; readonly presentation: AlgorithmPresentation }[] }[] {
  const presented = entries.map((entry, index) => ({ entry, index, presentation: presentAlgorithm(entry) }));
  return ALGORITHM_GROUPS.map((group) => ({ group, items: presented.filter((p) => p.presentation.group === group) })).filter((g) => g.items.length > 0);
}
