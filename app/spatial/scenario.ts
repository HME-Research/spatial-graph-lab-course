import { fail, issue, ok, type Result } from '@app/document';
import type { DesignDocumentV2 } from '@app/document/v2';
import { applyDesignCommand, type DesignCommand, type DesignCommandOptions, type NewRelationship } from './commands';
import { checkFacePreference, facePreferenceSchema, resolveWithPreferences, type FacePreference, type FacePreferences } from './preferences';

/**
 * Scenario content (Gate F, F-C): what one scenario's undo history records — the design plus its
 * face-preference sidecar. One `DocumentSession<ScenarioContent>` per scenario.
 *
 * Every command is pure and returns new content or readable issues (the input is never mutated).
 * - Design commands run through `applyDesignCommand`, resolving with the scenario's preferences
 *   (unless the caller supplies `options.resolve`). Removing an edge or a node drops the
 *   preferences of edges that no longer exist IN THE SAME STEP. Moving or resizing never removes
 *   an edge or its preference (an unavailable preference makes the edge unresolved instead).
 * - `set-face-preference` sets (only to a currently shared face) or clears one edge's preference.
 * - `add-edge-at-face` adds an edge and its preference as ONE step.
 */

export interface ScenarioContent {
  readonly design: DesignDocumentV2;
  readonly facePreferences: FacePreferences;
}

export type ScenarioCommand =
  | DesignCommand
  | { readonly type: 'set-face-preference'; readonly edgeId: string; readonly preference: FacePreference | null }
  | { readonly type: 'add-edge-at-face'; readonly edge: NewRelationship; readonly preference: FacePreference };

const CHECK_TEXT = {
  'not-endpoint': 'the chosen face must belong to one of the two rooms of the connection',
  'outside-room': 'the chosen face is not inside the room',
  'not-shared': 'the chosen face is not shared by the two rooms of the connection',
} as const;

function withPreference(prefs: FacePreferences, edgeId: string, preference: FacePreference | null): FacePreferences {
  const next: Record<string, FacePreference> = {};
  for (const [k, v] of Object.entries(prefs)) if (k !== edgeId) next[k] = v;
  if (preference !== null) next[edgeId] = { nodeId: preference.nodeId, offset: [...preference.offset], direction: preference.direction };
  return next;
}

/** Drop preferences of edges that are not in `doc`; the same object when nothing is dropped. */
export function prunePreferences(prefs: FacePreferences, doc: Pick<DesignDocumentV2, 'edges'>): FacePreferences {
  const ids = new Set(doc.edges.map((e) => e.id));
  const keys = Object.keys(prefs);
  if (keys.every((k) => ids.has(k))) return prefs;
  const next: Record<string, FacePreference> = {};
  for (const k of keys) if (ids.has(k)) next[k] = prefs[k]!;
  return next;
}

/** Validate `preference` against `doc` for `edgeId`; null when acceptable. */
function preferenceIssue(doc: DesignDocumentV2, edgeId: string, preference: FacePreference) {
  const parsed = facePreferenceSchema.safeParse(preference);
  if (!parsed.success) return issue(['facePreferences', edgeId], 'schema', parsed.error.issues[0]?.message ?? 'invalid face preference');
  const edge = doc.edges.find((e) => e.id === edgeId);
  if (!edge) return issue(['edges'], 'not-found', `edge "${edgeId}" does not exist`);
  const check = checkFacePreference(doc, edge, preference);
  return check.ok ? null : issue(['facePreferences', edgeId], 'invalid-edge-geometry', CHECK_TEXT[check.reason]);
}

export function applyScenarioCommand(
  content: ScenarioContent,
  command: ScenarioCommand,
  options: DesignCommandOptions = {},
): Result<ScenarioContent> {
  switch (command.type) {
    case 'set-face-preference': {
      const { design, facePreferences } = content;
      if (!design.edges.some((e) => e.id === command.edgeId)) return fail([issue(['edges'], 'not-found', `edge "${command.edgeId}" does not exist`)]);
      if (command.preference === null) {
        return ok(Object.prototype.hasOwnProperty.call(facePreferences, command.edgeId)
          ? { design, facePreferences: withPreference(facePreferences, command.edgeId, null) }
          : content);
      }
      const problem = preferenceIssue(design, command.edgeId, command.preference);
      if (problem) return fail([problem]);
      return ok({ design, facePreferences: withPreference(facePreferences, command.edgeId, command.preference) });
    }
    case 'add-edge-at-face': {
      const added = applyScenarioCommand(content, { type: 'add-edge', edge: command.edge }, options);
      if (!added.ok) return added;
      const problem = preferenceIssue(added.value.design, command.edge.id, command.preference);
      if (problem) return fail([problem]);
      return ok({
        design: added.value.design,
        facePreferences: withPreference(added.value.facePreferences, command.edge.id, command.preference),
      });
    }
    default: {
      const resolve = options.resolve ?? ((d: DesignDocumentV2) => resolveWithPreferences(d, content.facePreferences));
      const result = applyDesignCommand(content.design, command, { ...options, resolve });
      if (!result.ok) return result;
      if (result.value === content.design) return ok(content);
      return ok({ design: result.value, facePreferences: prunePreferences(content.facePreferences, result.value) });
    }
  }
}
