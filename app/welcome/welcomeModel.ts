import type { ProjectSummary } from '@app/project';
import type { RecentList } from '@app/session/projectStoreController';

/** Pure helpers for the Welcome screen and the Project Files actions (workstream B). */

export type RecentState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly items: readonly ProjectSummary[] }
  /** Local storage cannot be used: say so instead of showing an empty list. */
  | { readonly status: 'unavailable'; readonly message: string };

export const recentStateOf = (list: RecentList): RecentState =>
  list.status === 'ok' ? { status: 'ready', items: list.items } : { status: 'unavailable', message: list.message };

/** A code project (`projects/<id>`) that can supply types and algorithms for a new project. */
export interface DefinitionChoice {
  readonly id: string;
  readonly label: string;
}

export type RecentRow =
  | { readonly kind: 'ok'; readonly projectId: string; readonly name: string; readonly detail: string; readonly description: string | null }
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
export function recentRows(items: readonly ProjectSummary[], when: (iso: string) => string = formatWhen): RecentRow[] {
  return items.map((s) =>
    s.status === 'ok'
      ? {
          kind: 'ok',
          projectId: s.projectId,
          name: s.name,
          detail: `${plural(s.scenarioCount, 'scenario')} · edited ${when(s.updatedAt)}${s.definitionId ? ` · ${s.definitionId}` : ''}`,
          description: s.description ?? null,
        }
      : {
          kind: 'unreadable',
          projectId: s.projectId,
          detail: `This stored project cannot be read${s.issues[0] ? ` (${s.issues[0].message})` : ''}.${s.quarantineKey ? ' A copy has been kept aside.' : ''}`,
          quarantined: s.quarantineKey !== null,
        },
  );
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
