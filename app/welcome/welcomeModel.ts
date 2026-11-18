import type { ProjectSummary } from '@app/project';
import type { RecentList } from '@app/session/projectStoreController';

/** Pure helpers for the Welcome screen and the Project Files actions (workstream B). */

export type RecentState =
  | { readonly status: 'loading' }
  /** `unsaved`: ids of the last session that was not saved locally (replaced by the next project). */
  | { readonly status: 'ready'; readonly items: readonly ProjectSummary[]; readonly unsaved?: readonly string[] }
  /** Local storage cannot be used: say so instead of showing an empty list. */
  | { readonly status: 'unavailable'; readonly message: string };

export const recentStateOf = (list: RecentList): RecentState =>
  list.status === 'ok' ? { status: 'ready', items: list.items, unsaved: list.unsaved ?? [] } : { status: 'unavailable', message: list.message };

/** A toolkit (`toolkits/<id>`) that can supply types and algorithms for a new project. */
export interface DefinitionChoice {
  readonly id: string;
  readonly label: string;
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

/** A readable toolkit name from a toolkit id: "example-gallery" → "Example gallery". */
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
