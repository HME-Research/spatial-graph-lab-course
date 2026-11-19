import { type DesignDocumentV2, type GraphIssue, nodeLabel, relationshipLabel } from '@app/document';
import type { ActiveToolkit } from '@app/extensions';
import type { SpatialEditProposal } from '@app/spatial';
import { nodeTypeStatus, type NodeTypeStatus } from '@app/views/project';
import type { ParseResult } from './inspectorModel';

/**
 * Pure models behind the Properties panel (Stage 05): three-number fields that commit on Enter or
 * blur, the node-type menu, and the plan for a move/resize proposal. No React here.
 */

// ── Three-number fields (position, size) ────────────────────────────────────────────────────

export type Triple = readonly [number, number, number];
export type TripleDraft = readonly [string, string, string];

export interface TripleBounds {
  /** Names used in messages, e.g. ['x', 'y', 'z (storey)']. */
  readonly names: readonly [string, string, string];
  readonly min?: number;
  readonly max?: number;
}

export const POSITION_BOUNDS: TripleBounds = { names: ['x', 'y', 'z (storey)'] };

export const tripleToDraft = (value: Triple): TripleDraft => [String(value[0]), String(value[1]), String(value[2])];

export const sameTriple = (a: Triple, b: Triple): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Every axis must be a whole number within bounds. Partial input ("", "-", "1.5", "1e") fails. */
export function parseTriple(draft: TripleDraft, bounds: TripleBounds): ParseResult<Triple> {
  const values: number[] = [];
  for (const [i, text] of draft.entries()) {
    const name = bounds.names[i as 0 | 1 | 2];
    const t = text.trim();
    const n = Number(t);
    if (t === '' || !/^[+-]?\d+$/.test(t) || !Number.isSafeInteger(n)) return { ok: false, message: `${name} must be a whole number` };
    if (bounds.min !== undefined && n < bounds.min) return { ok: false, message: `${name} must be at least ${bounds.min}` };
    if (bounds.max !== undefined && n > bounds.max) return { ok: false, message: `${name} must be at most ${bounds.max}` };
    values.push(n + 0); // normalise -0
  }
  return { ok: true, value: [values[0]!, values[1]!, values[2]!] };
}

export const tripleKey = (value: Triple): string => value.join(',');

/**
 * What to do when a three-number field is committed (Enter, or focus leaving the group):
 * - `unchanged`: equals the stored value; send nothing.
 * - `invalid`: show `message`; send nothing.
 * - `repeat`: the same value was just sent and refused (e.g. Enter then blur); send nothing again.
 * - `send`: send exactly one command with `value`.
 */
export type TripleCommit =
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'repeat' }
  | { readonly kind: 'send'; readonly value: Triple };

export function decideTripleCommit(
  draft: TripleDraft,
  stored: Triple,
  bounds: TripleBounds,
  /** `tripleKey` of the last value sent that did not change the document, if any. */
  lastRefused: string | null,
): TripleCommit {
  const parsed = parseTriple(draft, bounds);
  if (!parsed.ok) return { kind: 'invalid', message: parsed.message };
  if (sameTriple(parsed.value, stored)) return { kind: 'unchanged' };
  if (lastRefused === tripleKey(parsed.value)) return { kind: 'repeat' };
  return { kind: 'send', value: parsed.value };
}

// ── Node type menu ───────────────────────────────────────────────────────────────────────────

export interface TypeOption {
  readonly value: string;
  readonly label: string;
  /** Not selectable (broken definitions; the current invalid value shown for context). */
  readonly disabled: boolean;
}

export interface TypeMenu {
  readonly options: readonly TypeOption[];
  /** Status of the current value; a warning is shown for unknown or broken types. */
  readonly current: NodeTypeStatus;
  /** true without an active project: any valid type id may be typed in ("Other type…"). */
  readonly allowCustom: boolean;
}

/**
 * Options for the node-type `<select>`.
 * - With an active project: its registered types (by label), broken ones disabled. The current
 *   value always appears, even if the project does not define it, so it stays visible and is
 *   only changed when the student picks another type.
 * - Without a project: the types used in the design, plus free entry.
 */
export function typeMenu(project: ActiveToolkit | null, typesInDesign: readonly string[], current: string): TypeMenu {
  const status = nodeTypeStatus(project, current);
  if (!project) {
    const ids = [...new Set([...typesInDesign, current])].sort();
    return { options: ids.map((id) => ({ value: id, label: id, disabled: false })), current: status, allowCustom: true };
  }
  const registered = project.nodeTypes
    .map((t) => ({ id: t.id, status: nodeTypeStatus(project, t.id) }))
    // One entry per id (a duplicated definition is reported as broken by the registry).
    .filter((t, i, all) => all.findIndex((o) => o.id === t.id) === i);
  // Readable names only; the identifier is added only where two functions share a name.
  const labelCount = new Map<string, number>();
  for (const { status: s } of registered) if (s.kind === 'registered') labelCount.set(s.label, (labelCount.get(s.label) ?? 0) + 1);
  const options: TypeOption[] = registered
    .map(({ id, status: s }): TypeOption =>
      s.kind === 'registered'
        ? { value: id, label: (labelCount.get(s.label) ?? 0) > 1 ? `${s.label} (${id})` : s.label, disabled: false }
        : { value: id, label: `${s.kind === 'broken' && s.label ? s.label : id} (${id}): invalid definition`, disabled: true },
    )
    .sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.label.localeCompare(b.label));
  if (!options.some((o) => o.value === current)) {
    options.unshift({ value: current, label: `${current}: not defined in this project`, disabled: true });
  }
  return { options, current: status, allowCustom: false };
}

/** Same pattern as the document schema's type id: lowercase letters, digits and "-". */
export function parseTypeId(text: string): ParseResult<string> {
  const t = text.trim();
  return /^[a-z][a-z0-9-]*$/.test(t)
    ? { ok: true, value: t }
    : { ok: false, message: 'Use lowercase letters, digits and “-”, starting with a letter (e.g. gallery).' };
}

// ── Move / resize plan (schema v2) ──────────────────────────────────────────────────────────

/** Readable label of a room: its id. */
export function roomLabelIn(doc: DesignDocumentV2): (nodeId: number) => string {
  const byId = new Map(doc.nodes.map((n) => [n.id, nodeLabel(n)]));
  return (id) => byId.get(id) ?? String(id);
}

/** "3 → 7" for a relationship, else its id. */
export function relationshipLabelIn(doc: DesignDocumentV2): (edgeId: number) => string {
  return (id) => relationshipLabel(doc, id);
}

/**
 * What the Properties panel does with a spatial-engine proposal:
 * - `commit`: send `set-node-geometry` (one history step);
 * - `confirm`: ask Cancel / "Move anyway and recalculate", naming the relationships;
 * - `reject`: show the issues (room overlap is always refused); send nothing.
 */
export type GeometryPlan =
  | { readonly kind: 'commit' }
  | { readonly kind: 'confirm'; readonly relationships: readonly string[] }
  | { readonly kind: 'reject'; readonly issues: readonly GraphIssue[] };

export function planGeometryEdit(proposal: SpatialEditProposal, doc: DesignDocumentV2, subjectNodeId: number): GeometryPlan {
  switch (proposal.status) {
    case 'ok':
      return { kind: 'commit' };
    case 'needs-confirmation':
      return { kind: 'confirm', relationships: proposal.displacedRoutes.map(relationshipLabelIn(doc)) };
    case 'rejected': {
      const others = proposal.collidingRooms.filter((id) => id !== subjectNodeId);
      // Lead with the room overlap in plain words; keep every validator issue for details.
      if (others.length > 0 && !proposal.issues.some((i) => i.code === 'room-overlap' && others.some((o) => i.message.includes(`"${o}"`)))) {
        return {
          kind: 'reject',
          issues: [
            ...others.map((o): GraphIssue => ({ path: ['nodes'], code: 'room-overlap', message: `room "${subjectNodeId}" overlaps room "${o}"` })),
            ...proposal.issues,
          ],
        };
      }
      return { kind: 'reject', issues: proposal.issues };
    }
  }
}
