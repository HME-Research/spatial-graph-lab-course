import type { ProjectSummary } from '@app/project';
import type { RecentList } from '@app/session/projectStoreController';
import type { ActiveToolkit } from '@app/extensions';

/** Pure helpers for the Welcome screen and the Project Files actions (workstream B). */

export type RecentState =
  | { readonly status: 'loading' }
  /** `unsaved`: ids of the last session that was not saved locally (replaced by the next project). */
  | { readonly status: 'ready'; readonly items: readonly ProjectSummary[]; readonly unsaved?: readonly string[] }
  /** Local storage cannot be used: say so instead of showing an empty list. */
  | { readonly status: 'unavailable'; readonly message: string };

export const recentStateOf = (list: RecentList): RecentState =>
  list.status === 'ok' ? { status: 'ready', items: list.items, unsaved: list.unsaved ?? [] } : { status: 'unavailable', message: list.message };

/**
 * What the Project panel's New project does (owner 2026-11-19): with any toolkit available it asks,
 * with the same toolkit choice as Welcome's Create project, preselecting `defaultToolkitId` (the
 * same default as Welcome: normally none, "No toolkit"); without toolkits it creates a project
 * with no toolkit at once.
 */
export const newProjectStart = (
  toolkitCount: number,
  defaultToolkitId: string | null,
): { readonly kind: 'ask'; readonly toolkitId: string | null } | { readonly kind: 'create'; readonly toolkitId: null } =>
  toolkitCount > 0 ? { kind: 'ask', toolkitId: defaultToolkitId } : { kind: 'create', toolkitId: null };

/** A toolkit (`toolkits/<id>`) that can supply types and algorithms for a new project. */
export interface DefinitionChoice {
  readonly id: string;
  readonly label: string;
}

/** What Open example… opens: the built-in graph-only example, or one design of one toolkit. */
export type ExampleChoice =
  | { readonly kind: 'built-in' }
  /** `uploaded`: a design of the toolkit uploaded as a zip (2026-11-26), not of `toolkits/<id>`. */
  | { readonly kind: 'toolkit'; readonly toolkitId: string; readonly designId: string; readonly uploaded?: true };

/** One row of Open example…. */
export interface ExampleOption {
  /** `built-in`, or `<toolkit id>/<design id>`. */
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  /** "No toolkit" or "Toolkit: <name>" (the tag the Attributes list uses for a toolkit). */
  readonly tag: string;
  /** Why it cannot be opened (an invalid design file), else null. */
  readonly problem: string | null;
  readonly choice: ExampleChoice;
}

/**
 * The rows of Open example… (owner decision 2026-11-20): the built-in House first (graph only, no
 * toolkit), then every design of every toolkit (toolkits by id, designs by file name), each with
 * the design's own name and description.
 */
export function exampleOptions(
  builtIn: { readonly name: string; readonly description?: string | undefined },
  toolkitExamples: readonly {
    readonly toolkitId: string;
    readonly toolkitName: string;
    readonly designId: string;
    readonly name: string;
    readonly description: string | null;
    readonly problem: string | null;
    readonly uploaded?: true;
  }[],
): ExampleOption[] {
  return [
    { key: 'built-in', name: builtIn.name, description: builtIn.description?.trim() || null, tag: 'No toolkit', problem: null, choice: { kind: 'built-in' } },
    ...toolkitExamples.map((e) => ({
      key: `${e.uploaded ? 'uploaded:' : ''}${e.toolkitId}/${e.designId}`,
      name: e.name,
      description: e.description,
      tag: `Toolkit: ${e.toolkitName}${e.uploaded ? ' (uploaded)' : ''}`,
      problem: e.problem,
      choice: { kind: 'toolkit' as const, toolkitId: e.toolkitId, designId: e.designId, ...(e.uploaded && { uploaded: true as const }) },
    })),
  ];
}

/**
 * The examples in sections, in list order: one per tag ("No toolkit", then "Toolkit: <name>" per
 * toolkit), each keeping its examples' order.
 */
export function exampleSections(options: readonly ExampleOption[]): { readonly title: string; readonly items: readonly ExampleOption[] }[] {
  const sections: { title: string; items: ExampleOption[] }[] = [];
  for (const option of options) {
    const section = sections.find((s) => s.title === option.tag);
    if (section) section.items.push(option);
    else sections.push({ title: option.tag, items: [option] });
  }
  return sections;
}

export type RecentRow =
  | { readonly kind: 'ok'; readonly projectId: string; readonly name: string; readonly detail: string; readonly description: string | null; readonly unsaved: boolean }
  | { readonly kind: 'unreadable'; readonly projectId: string; readonly detail: string; readonly quarantined: boolean };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Locale date-time, or the raw text when it is not a date. */
export function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  try {
    return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

/**
 * Rows for "Recent local projects": readable projects newest first (the store's order), then
 * records that cannot be read — listed honestly, never hidden and never opened.
 */
export function recentRows(items: readonly ProjectSummary[], when: (iso: string) => string = formatWhen, unsaved: readonly string[] = []): RecentRow[] {
  const last = new Set(unsaved);
  return items.map((s) =>
    s.status === 'ok'
      ? {
          kind: 'ok',
          projectId: s.projectId,
          name: s.name,
          detail: `${plural(s.scenarioCount, 'scenario')} · edited ${when(s.updatedAt)}`,
          description: s.description ?? null,
          unsaved: last.has(s.projectId),
        }
      : {
          kind: 'unreadable',
          projectId: s.projectId,
          detail: `This stored project cannot be read${s.issues[0] ? ` (${s.issues[0].message})` : ''}.${s.quarantineKey ? ' A copy has been kept aside.' : ''}`,
          quarantined: s.quarantineKey !== null,
        },
  );
}

/** A readable toolkit name from a toolkit id: "my-house_v2" → "My house v2". */
export function toolkitLabel(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words === '' ? id : words.charAt(0).toUpperCase() + words.slice(1);
}

/** File name for an exported project: `<slug>.project.json`. */
export function projectFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'project'}.project.json`;
}

export const DEFAULT_PROJECT_NAME = 'Untitled project';

/**
 * The designs of an UPLOADED toolkit as Open example… rows (2026-11-26): its default design first,
 * then by file; an invalid design is listed with its problem.
 */
export function uploadedToolkitExamples(toolkit: Pick<ActiveToolkit, 'id' | 'definition' | 'designs'>) {
  const first = toolkit.definition.defaultDesign;
  return [...toolkit.designs]
    .sort((a, b) => Number(b.id === first) - Number(a.id === first))
    .map((d) => ({
      toolkitId: toolkit.id,
      toolkitName: toolkit.definition.name,
      designId: d.id,
      name: d.result.ok ? d.result.value.metadata.name.trim() || d.id : d.id,
      description: d.result.ok ? d.result.value.metadata.description?.trim() || null : null,
      problem: d.result.ok ? null : `${d.file} is not a valid design`,
      uploaded: true as const,
    }));
}
