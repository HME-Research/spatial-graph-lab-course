import { type DesignDocumentV2, fail, issue, ok, type Result } from '@app/document';
import { applyDesignCommand, type DesignCommand, type DesignCommandOptions, type NewRelationship } from './commands';
import {
  checkFacePreference,
  facePreferenceSchema,
  rebasePreferences,
  resolveWithPreferences,
  type FacePreference,
  type FacePreferences,
} from './preferences';

/**
 * Scenario content (Gate F, F-C): what one scenario's undo history records — the design plus its
 * face-preference sidecar. One `DocumentSession<ScenarioContent>` per scenario.
 *
 * Every command is pure and returns new content or readable issues (the input is never mutated).
 * - Design commands run through `applyDesignCommand`, resolving with the scenario's preferences
 *   (unless the caller supplies `options.resolve`). IN THE SAME STEP the sidecar is then kept
 *   consistent with the new design (`nextPreferences`):
 *   - removing an edge or a node drops the preferences of edges that no longer exist;
 *   - changing an edge to `open` drops its preference (changing it back to `access` does not
 *     bring it back: the representative face applies until a face is chosen again);
 *   - moving a room keeps its offsets (the face moves with the room); resizing it keeps each
 *     preferred face at its ABSOLUTE cell (`rebasePreferences`). Moving or resizing never removes
 *     an edge or its preference (an unavailable preference makes the edge unresolved instead).
 * - `set-face-preference` sets (only to a currently shared face of an `access` edge) or clears one
 *   edge's preference. Setting the identical preference, or clearing a missing one, returns the
 *   SAME content object (no change, no undo step).
 * - `add-edge-at-face` adds an `access` edge and its preference as ONE step.
 */

export interface ScenarioContent {
  readonly design: DesignDocumentV2;
  readonly facePreferences: FacePreferences;
}

export type ScenarioCommand =
  | DesignCommand
  | { readonly type: 'set-face-preference'; readonly edgeId: number; readonly preference: FacePreference | null }
  | { readonly type: 'add-edge-at-face'; readonly edge: NewRelationship; readonly preference: FacePreference };

const CHECK_TEXT = {
  'not-endpoint': 'the chosen face must belong to one of the two rooms of the edge',
  'outside-room': 'the chosen face is not inside the room',
  'not-shared': 'the chosen face is not shared by the two rooms of the edge',
} as const;

function withPreference(prefs: FacePreferences, edgeId: number, preference: FacePreference | null): FacePreferences {
  const next: Record<string, FacePreference> = {};
  for (const [k, v] of Object.entries(prefs)) if (k !== String(edgeId)) next[k] = v;
  if (preference !== null) next[edgeId] = { nodeId: preference.nodeId, offset: [...preference.offset], direction: preference.direction };
  return next;
}

const samePreference = (a: FacePreference, b: FacePreference) =>
  a.nodeId === b.nodeId && a.direction === b.direction && a.offset.length === b.offset.length && a.offset.every((v, i) => v === b.offset[i]);

/**
 * Drop preferences of edges that are not in `doc` or are not `access` edges; the same object when
 * nothing is dropped.
 */
export function prunePreferences(prefs: FacePreferences, doc: Pick<DesignDocumentV2, 'edges'>): FacePreferences {
  const ids = new Set(doc.edges.filter((e) => e.relationship === 'access').map((e) => e.id));
  const keys = Object.keys(prefs);
  if (keys.every((k) => ids.has(Number(k)))) return prefs;
  const next: Record<string, FacePreference> = {};
  for (const k of keys) if (ids.has(Number(k))) next[k] = prefs[k]!;
  return next;
}

/**
 * The sidecar that goes with `after`, a design derived from `before` in one step (a command or
 * an applied algorithm result): rebased for resized rooms, then pruned of removed / non-access
 * edges. The same object when nothing changes.
 */
export function nextPreferences(prefs: FacePreferences, before: DesignDocumentV2, after: DesignDocumentV2): FacePreferences {
  return prunePreferences(rebasePreferences(prefs, before, after), after);
}

/** Validate `preference` against `doc` for `edgeId`; null when acceptable. */
function preferenceIssue(doc: DesignDocumentV2, edgeId: number, preference: FacePreference) {
  const parsed = facePreferenceSchema.safeParse(preference);
  if (!parsed.success) return issue(['facePreferences', edgeId], 'schema', parsed.error.issues[0]?.message ?? 'invalid face preference');
  const edge = doc.edges.find((e) => e.id === edgeId);
  if (!edge) return issue(['edges'], 'not-found', `edge "${edgeId}" does not exist`);
  if (edge.relationship !== 'access') {
    return issue(
      ['facePreferences', edgeId],
      'schema',
      `only access edges can choose the wall they open on; "${edgeId}" is an ${edge.relationship} edge, which opens the whole shared boundary`,
    );
  }
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
      if (!design.edges.some((e) => e.id === command.edgeId)) return fail([issue(['edges'], 'not-found', `edge ${command.edgeId} does not exist`)]);
      const has = Object.prototype.hasOwnProperty.call(facePreferences, command.edgeId);
      if (command.preference === null) {
        return ok(has ? { design, facePreferences: withPreference(facePreferences, command.edgeId, null) } : content);
      }
      const problem = preferenceIssue(design, command.edgeId, command.preference);
      if (problem) return fail([problem]);
      if (has && samePreference(facePreferences[command.edgeId]!, command.preference)) return ok(content);
      return ok({ design, facePreferences: withPreference(facePreferences, command.edgeId, command.preference) });
    }
    case 'add-edge-at-face': {
      // The new relationship gets the design's next edge id (`add-edge`).
      const edgeId = content.design.nextEdgeId;
      const added = applyScenarioCommand(content, { type: 'add-edge', edge: command.edge }, options);
      if (!added.ok) return added;
      const problem = preferenceIssue(added.value.design, edgeId, command.preference);
      if (problem) return fail([problem]);
      return ok({
        design: added.value.design,
        facePreferences: withPreference(added.value.facePreferences, edgeId, command.preference),
      });
    }
    default: {
      // A proposed design is resolved with the preferences it would carry (rebased / pruned), so
      // the command's own checks (e.g. "would this become unresolved?") see the same result as
      // the committed scenario will.
      const resolve =
        options.resolve ??
        ((d: DesignDocumentV2) =>
          resolveWithPreferences(d, d === content.design ? content.facePreferences : nextPreferences(content.facePreferences, content.design, d)));
      const result = applyDesignCommand(content.design, command, { ...options, resolve });
      if (!result.ok) return result;
      if (result.value === content.design) return ok(content);
      return ok({ design: result.value, facePreferences: nextPreferences(content.facePreferences, content.design, result.value) });
    }
  }
}
