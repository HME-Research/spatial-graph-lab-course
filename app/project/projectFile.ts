import { z } from 'zod';
import { fail, ok, type Issue, type IssuePath, type Result } from '@core/graph';
import { savedCameraSchema, type CameraPose, type SavedCamera } from '@core/viewer/three/camera';
import { type DesignDocumentV2, formatIssuePath, idSchema, readDesign, serializeDesignV2 } from '@app/document';
import { facePreferencesSchema, type FacePreferences } from '@app/spatial';
import {
  DEFAULT_DISPLAY,
  DISPLAY_VIEW_MODES,
  displayDefaultsSchema,
  displayOverridesSchema,
  type DisplayDefaults,
  type DisplayOverrides,
  type PartialDisplay,
} from '@app/display/contracts';
import { readAttributeRecord, serializeAttributeRecord } from '@app/extensions/projectAttributes';
import { toolkitIdSchema } from '@app/extensions/discover';
import { canonicalFacadeAsset, FACADE_LIMITS, facadeAssetsBytes, formatBytes, readFacadeAsset, type FacadeAssetV1 } from '@app/assets';

/**
 * Project file (format version 2; Gate F, F-B; root-owned). Pure.
 *
 * One local project = several scenarios (complete design alternatives) + the project-wide
 * attribute record + project display defaults. This is the JSON that is exported/imported and the
 * text that is stored per project in the browser (`./storage.ts`).
 *
 * - **Whole-file validation.** `readProjectFile` validates everything (envelope, every scenario's
 *   design through `readDesign`, face preferences against that design's edges, cameras, display,
 *   attribute record through its own reader). Any problem rejects the WHOLE file; the caller keeps
 *   its current state.
 * - **Canonical text.** `serializeProjectFile` writes a fixed key order and a trailing newline;
 *   the same file always gives the same text.
 * - **Assets** (owner decision D4, 2026-11-17). Imported façades are embedded as validated,
 *   normalised meshes (`assets: {policy: 'embedded-mesh-v1', items}`, `@app/assets`), so the
 *   stored record (autosave) and an exported file carry them; the original `.3dm` is not kept.
 *   Without imported façades the file says `{policy: 'none'}`, byte-identical to older files.
 *   Every item is checked (structure, hash, bytes, indices, bounds) and the total is limited;
 *   one bad item rejects the whole file.
 */

export const PROJECT_FILE_FORMAT = 'spatial-graph-lab/project';
export const PROJECT_FILE_VERSION = 2;

export interface ScenarioRecord {
  readonly id: string;
  readonly name: string;
  readonly design: DesignDocumentV2;
  readonly facePreferences: FacePreferences;
  readonly cameras: readonly SavedCamera[];
  readonly display: DisplayOverrides;
}

export interface ProjectFileV2 {
  readonly format: typeof PROJECT_FILE_FORMAT;
  readonly version: typeof PROJECT_FILE_VERSION;
  /** Local identity (idSchema-compatible); a new id on Save As. */
  readonly projectId: string;
  readonly name: string;
  readonly description?: string | undefined;
  /** ISO 8601. */
  readonly createdAt: string;
  /** ISO 8601. */
  readonly updatedAt: string;
  /** The toolkit (`toolkits/<id>`) the project was started from, supplying its types and algorithms: referenced, never embedded. */
  readonly toolkit: { readonly id: string } | null;
  /**
   * The project-attribute record (`exportAttributeFile` shape, `app/extensions/projectAttributes.ts`),
   * validated by `readAttributeRecord` against `toolkit.id` (or its own project id when
   * there is no toolkit). `null` = use the schema derived from the toolkit files.
   */
  readonly attributes: unknown | null;
  readonly activeScenarioId: string;
  /** At least one; unique ids. */
  readonly scenarios: readonly ScenarioRecord[];
  readonly settings: ProjectSettings;
  readonly assets: ProjectAssets;
}

/**
 * Binary assets of the project. `none` when there are none (also what older files say);
 * otherwise the imported façades as embedded, validated meshes (at least one, unique ids).
 */
export type ProjectAssets =
  | { readonly policy: 'none' }
  | { readonly policy: typeof EMBEDDED_ASSET_POLICY; readonly items: readonly FacadeAssetV1[] };

export const EMBEDDED_ASSET_POLICY = 'embedded-mesh-v1';
export const NO_ASSETS: ProjectAssets = Object.freeze({ policy: 'none' });

/** The imported façades of a project (empty for `policy: 'none'`). */
export const facadeAssetsOf = (assets: ProjectAssets): readonly FacadeAssetV1[] => (assets.policy === 'none' ? [] : assets.items);

/** Assets from a list: `none` for an empty list, so a project without façades keeps the older text. */
export const projectAssetsOf = (items: readonly FacadeAssetV1[]): ProjectAssets =>
  items.length === 0 ? NO_ASSETS : { policy: EMBEDDED_ASSET_POLICY, items: items.map(canonicalFacadeAsset) };

/**
 * Project-level settings (not per scenario, not undoable).
 * - `display`: the Display defaults (scenario overrides and per-view settings refine them).
 * - `calculatedFields` (optional, I1): the ids of the calculated values (metrics) the project shows in
 *   Properties and offers for colour-by. Metric ids only, never values. Absent = the built-in
 *   default selection. The file keeps the ids as written; the app reads them with
 *   `sanitizeEnabledMetrics` (unknown ids are ignored, order is canonical) and writes canonical lists.
 */
export interface ProjectSettings {
  readonly display: DisplayDefaults;
  readonly calculatedFields?: readonly string[];
  /**
   * Project functions (optional, UI refinement 2026-11-17): node types added in the browser, beside
   * the toolkit's `types/`. Each is `{id (a document typeId), label}`; no façade or attributes
   * of their own (the fallback façade and colour apply). A function whose id the toolkit also
   * defines is ignored (the code definition wins). Absent = none; written only when set.
   */
  readonly functions?: readonly ProjectFunction[];
  /**
   * Ids of toolkit functions removed from this project (optional, 2026-11-17): they are
   * not offered and not registered while the project is open. The code files are never changed, so
   * removing is undone by restoring the id. Absent = none; written only when set.
   */
  readonly hiddenFunctions?: readonly string[];
}

/** A project function: a node type defined in the project file (`settings.functions`). */
export interface ProjectFunction {
  /** The document `typeId`: lowercase letters, digits and "-", starting with a letter. Never changes. */
  readonly id: string;
  /** Display name. */
  readonly label: string;
}

/** Same pattern as the document schema's type id. */
export const FUNCTION_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
export const MAX_FUNCTION_LABEL = 60;
export const MAX_PROJECT_FUNCTIONS = 64;

export type ProjectIssueCode =
  | 'invalid-json'
  | 'wrong-format'
  | 'unsupported-version'
  | 'schema'
  | 'duplicate-scenario-id'
  | 'unknown-active-scenario'
  | 'invalid-design'
  | 'unknown-preference-edge'
  | 'invalid-preference'
  | 'duplicate-camera-id'
  | 'invalid-attributes'
  /** An embedded asset is malformed, damaged, duplicated or over the limits (additive 2026-11-17). */
  | 'invalid-asset';

export type ProjectIssue = Issue<ProjectIssueCode>;
export type ProjectResult<T> = Result<T, ProjectIssue>;

const projectIssue = (path: IssuePath, code: ProjectIssueCode, message: string): ProjectIssue => ({ path, code, message });

/** Readable one-line summary of issues (e.g. for a status message). */
export const formatProjectIssues = (issues: readonly ProjectIssue[]): string =>
  issues.map((i) => (i.path.length ? `${formatIssuePath(i.path)}: ${i.message}` : i.message)).join('; ');

// ---------------------------------------------------------------------------------------------
// Ids and clock (injectable)

function randomToken(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Default project id generator (idSchema-compatible). */
export const newProjectId = (): string => `project-${randomToken()}`;
/** Default scenario id generator (idSchema-compatible). */
export const newScenarioId = (): string => `scenario-${randomToken()}`;
/** Default clock. */
export const nowIso = (): string => new Date().toISOString();

// ---------------------------------------------------------------------------------------------
// Schema

const isoSchema = z.iso.datetime({ offset: true, error: 'must be an ISO 8601 date-time' });

const scenarioShape = z.strictObject({
  id: idSchema,
  name: z.string().trim().min(1, { error: 'scenario name must not be empty' }),
  design: z.unknown(),
  facePreferences: facePreferencesSchema,
  cameras: z.array(savedCameraSchema),
  display: displayOverridesSchema,
});

const projectShape = z.strictObject({
  format: z.literal(PROJECT_FILE_FORMAT),
  version: z.literal(PROJECT_FILE_VERSION),
  projectId: idSchema,
  name: z.string().trim().min(1, { error: 'project name must not be empty' }),
  description: z.string().optional(),
  createdAt: isoSchema,
  updatedAt: isoSchema,
  toolkit: z.strictObject({ id: toolkitIdSchema }).nullable(),
  attributes: z.looseObject({}).nullable(),
  activeScenarioId: idSchema,
  scenarios: z.array(scenarioShape).min(1, { error: 'a project needs at least one scenario' }),
  settings: z.strictObject({
    display: displayDefaultsSchema,
    calculatedFields: z.array(z.string().min(1).max(64), { error: 'calculatedFields must be a list of calculated value ids' }).max(64).optional(),
    functions: z
      .array(
        z.strictObject({
          id: z.string().regex(FUNCTION_ID_PATTERN, { error: 'a function id must be lowercase letters, digits or "-", starting with a letter' }),
          label: z.string().trim().min(1, { error: 'a function name must not be empty' }).max(MAX_FUNCTION_LABEL),
        }),
        { error: 'functions must be a list of {id, label}' },
      )
      .max(MAX_PROJECT_FUNCTIONS)
      .refine((list) => new Set(list.map((f) => f.id)).size === list.length, { error: 'function ids must be unique' })
      .optional(),
    hiddenFunctions: z
      .array(z.string().regex(FUNCTION_ID_PATTERN, { error: 'a function id must be lowercase letters, digits or "-", starting with a letter' }))
      .max(MAX_PROJECT_FUNCTIONS)
      .optional(),
  }),
  assets: z.union(
    [
      z.strictObject({ policy: z.literal('none') }),
      z.strictObject({
        policy: z.literal(EMBEDDED_ASSET_POLICY),
        items: z.array(z.unknown()).min(1, { error: 'an embedded asset list must not be empty (use policy "none")' }).max(FACADE_LIMITS.maxAssets, { error: `at most ${FACADE_LIMITS.maxAssets} imported façades per project` }),
      }),
    ],
    { error: `assets must be {"policy": "none"} or {"policy": "${EMBEDDED_ASSET_POLICY}", "items": [...]}` },
  ),
});

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Read a project file from JSON text or an already parsed value. Never throws. On success the
 * returned file is a fresh, normalised copy (designs as v2, canonical attribute record).
 */
export function readProjectFile(input: unknown): ProjectResult<ProjectFileV2> {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (error) {
      return fail([projectIssue([], 'invalid-json', `file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)]);
    }
  }
  if (!isRecord(raw) || raw.format !== PROJECT_FILE_FORMAT) {
    return fail([projectIssue(['format'], 'wrong-format', `not a Spatial Graph Lab project file (format must be "${PROJECT_FILE_FORMAT}")`)]);
  }
  if (raw.version !== PROJECT_FILE_VERSION) {
    return fail([
      projectIssue(['version'], 'unsupported-version', `unsupported project file version ${JSON.stringify(raw.version)}; this application reads version ${PROJECT_FILE_VERSION} only`),
    ]);
  }
  if (!('attributes' in raw)) return fail([projectIssue(['attributes'], 'schema', 'attributes is required (null when not customised)')]);

  const parsed = projectShape.safeParse(raw);
  if (!parsed.success) {
    return fail(parsed.error.issues.map((i) => projectIssue(i.path.filter((p): p is string | number => typeof p !== 'symbol'), 'schema', i.message)));
  }
  const data = parsed.data;
  const issues: ProjectIssue[] = [];

  const seen = new Set<string>();
  const scenarios: ScenarioRecord[] = [];
  data.scenarios.forEach((s, index) => {
    if (seen.has(s.id)) issues.push(projectIssue(['scenarios', index, 'id'], 'duplicate-scenario-id', `scenario id "${s.id}" is used more than once`));
    seen.add(s.id);

    const design = readDesign(s.design);
    if (!design.ok) {
      for (const i of design.issues) issues.push(projectIssue(['scenarios', index, 'design', ...i.path], 'invalid-design', i.message));
      return;
    }
    const edgesById = new Map(design.value.doc.edges.map((e) => [e.id, e] as const));
    for (const [edgeId, preference] of Object.entries(s.facePreferences)) {
      const edge = edgesById.get(edgeId);
      const path = ['scenarios', index, 'facePreferences', edgeId];
      if (!edge) {
        issues.push(projectIssue(path, 'unknown-preference-edge', `face preference for edge "${edgeId}", which is not in the scenario's design`));
      } else if (preference.nodeId !== edge.source && preference.nodeId !== edge.target) {
        // A preference names a face of one of the edge's own rooms (CONTRACTS-V3 §4); anything else is corrupt input.
        issues.push(projectIssue([...path, 'nodeId'], 'invalid-preference', `face preference for edge "${edgeId}" names room "${preference.nodeId}", which is not one of its two rooms`));
      } else if (edge.kind !== 'access') {
        issues.push(projectIssue(path, 'invalid-preference', `face preference for edge "${edgeId}", but preferred walls apply to Access relationships only`));
      }
    }
    const cameraIds = new Set<string>();
    s.cameras.forEach((c, ci) => {
      if (cameraIds.has(c.id)) issues.push(projectIssue(['scenarios', index, 'cameras', ci, 'id'], 'duplicate-camera-id', `camera id "${c.id}" is used more than once in this scenario`));
      cameraIds.add(c.id);
    });
    scenarios.push({
      id: s.id,
      name: s.name,
      design: design.value.doc,
      facePreferences: canonicalPreferences(s.facePreferences),
      cameras: s.cameras.map(canonicalCamera),
      display: canonicalOverrides(s.display),
    });
  });
  if (!seen.has(data.activeScenarioId)) {
    issues.push(projectIssue(['activeScenarioId'], 'unknown-active-scenario', `active scenario "${data.activeScenarioId}" is not one of the project's scenarios`));
  }

  let attributes: unknown | null = null;
  if (data.attributes !== null) {
    const owner = data.toolkit?.id ?? (typeof data.attributes.projectId === 'string' ? data.attributes.projectId : data.projectId);
    const read = readAttributeRecord(JSON.stringify(data.attributes), { projectId: owner });
    if (!read.ok) for (const d of read.issues) issues.push(projectIssue(['attributes'], 'invalid-attributes', d.message));
    else attributes = JSON.parse(serializeAttributeRecord(read.value)) as unknown;
  }

  const assetItems: FacadeAssetV1[] = [];
  if (data.assets.policy !== 'none') {
    const ids = new Set<string>();
    data.assets.items.forEach((item, index) => {
      const read = readFacadeAsset(item);
      if (!read.ok) {
        for (const i of read.issues) issues.push(projectIssue(['assets', 'items', index, ...i.path], 'invalid-asset', `imported façade: ${i.message}`));
        return;
      }
      if (ids.has(read.value.id)) issues.push(projectIssue(['assets', 'items', index, 'id'], 'invalid-asset', `imported façade "${read.value.id}" is listed more than once`));
      ids.add(read.value.id);
      assetItems.push(read.value);
    });
    const total = facadeAssetsBytes(assetItems);
    if (total > FACADE_LIMITS.maxTotalBytes) {
      issues.push(projectIssue(['assets'], 'invalid-asset', `imported façades total ${formatBytes(total)}; the limit is ${formatBytes(FACADE_LIMITS.maxTotalBytes)}`));
    }
  }

  if (issues.length) return fail(issues);
  return ok({
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    projectId: data.projectId,
    name: data.name,
    ...(data.description !== undefined && { description: data.description }),
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    toolkit: data.toolkit === null ? null : { id: data.toolkit.id },
    attributes,
    activeScenarioId: data.activeScenarioId,
    scenarios,
    settings: canonicalSettings(data.settings),
    assets: projectAssetsOf(assetItems),
  });
}

// ---------------------------------------------------------------------------------------------
// Canonical text

function canonicalPreferences(prefs: FacePreferences): FacePreferences {
  const out: Record<string, FacePreferences[string]> = {};
  for (const key of Object.keys(prefs).sort()) {
    const p = prefs[key]!;
    out[key] = { nodeId: p.nodeId, offset: [p.offset[0], p.offset[1], p.offset[2]], direction: p.direction };
  }
  return out;
}

function canonicalPose(p: CameraPose): CameraPose {
  return {
    projection: p.projection,
    position: [p.position[0], p.position[1], p.position[2]],
    target: [p.target[0], p.target[1], p.target[2]],
    up: [p.up[0], p.up[1], p.up[2]],
    ...(p.fov !== undefined && { fov: p.fov }),
    ...(p.orthoHeight !== undefined && { orthoHeight: p.orthoHeight }),
  };
}

const canonicalCamera = (c: SavedCamera): SavedCamera => ({ id: c.id, name: c.name, viewMode: c.viewMode, pose: canonicalPose(c.pose) });

const DISPLAY_FIELDS = ['labels', 'legend', 'roofs', 'colourPreset', 'lighting'] as const;

function canonicalPartial(p: PartialDisplay): PartialDisplay {
  const out: Record<string, unknown> = {};
  for (const f of DISPLAY_FIELDS) if (p[f] !== undefined) out[f] = p[f];
  return out as PartialDisplay;
}

function canonicalOverrides(o: DisplayOverrides): DisplayOverrides {
  const base = canonicalPartial(o);
  if (o.views === undefined) return base;
  const views: Record<string, PartialDisplay> = {};
  for (const mode of DISPLAY_VIEW_MODES) {
    const v = o.views[mode];
    if (v !== undefined) views[mode] = canonicalPartial(v);
  }
  return { ...base, views };
}

const canonicalDefaults = (d: DisplayDefaults): DisplayDefaults => ({
  labels: d.labels,
  legend: d.legend,
  roofs: d.roofs,
  colourPreset: d.colourPreset,
  lighting: d.lighting,
});

/**
 * Canonical JSON text: fixed key order, scenario/camera order as given, face preferences sorted
 * by edge id, optional fields omitted when undefined, trailing newline. Same file → same text.
 * Expects a valid file (as returned by `readProjectFile` or the builders here).
 */
/** Settings in canonical key order; optional keys only when present (older files stay byte-identical). */
const canonicalSettings = (settings: {
  readonly display: DisplayDefaults;
  readonly calculatedFields?: readonly string[] | undefined;
  readonly functions?: readonly ProjectFunction[] | undefined;
  readonly hiddenFunctions?: readonly string[] | undefined;
}): ProjectSettings => ({
  display: canonicalDefaults(settings.display),
  ...(settings.calculatedFields !== undefined && { calculatedFields: [...settings.calculatedFields] }),
  ...(settings.functions !== undefined && { functions: settings.functions.map((f) => ({ id: f.id, label: f.label })) }),
  ...(settings.hiddenFunctions !== undefined && { hiddenFunctions: [...settings.hiddenFunctions] }),
});

export function serializeProjectFile(file: ProjectFileV2): string {
  const canonical = {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    projectId: file.projectId,
    name: file.name,
    ...(file.description !== undefined && { description: file.description }),
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    toolkit: file.toolkit === null ? null : { id: file.toolkit.id },
    attributes: file.attributes ?? null,
    activeScenarioId: file.activeScenarioId,
    scenarios: file.scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      design: JSON.parse(serializeDesignV2(s.design)) as unknown,
      facePreferences: canonicalPreferences(s.facePreferences),
      cameras: s.cameras.map(canonicalCamera),
      display: canonicalOverrides(s.display),
    })),
    settings: canonicalSettings(file.settings),
    assets: projectAssetsOf(facadeAssetsOf(file.assets)),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

// ---------------------------------------------------------------------------------------------
// Builders

export interface IdClockOptions {
  /** Clock (ISO 8601). Default: now. */
  readonly now?: () => string;
  /** New project id. Default: `newProjectId`. */
  readonly newId?: () => string;
  /** New scenario ids. Default: `newScenarioId`. */
  readonly newScenarioId?: () => string;
}

export interface LegacyImportOptions extends IdClockOptions {
  /** Project name. Default: the design's metadata name. */
  readonly name?: string;
  readonly toolkit?: { readonly id: string } | null;
}

/**
 * Wrap a design file (a JSON value, read through `readDesign`) into a new project
 * with one scenario "Scenario 1". The result is validated as a whole project file.
 */
export function projectFromLegacyDesign(design: unknown, options: LegacyImportOptions = {}): ProjectResult<ProjectFileV2> {
  const read = readDesign(design);
  if (!read.ok) return fail(read.issues.map((i) => projectIssue(['design', ...i.path], 'invalid-design', i.message)));
  const doc = read.value.doc;
  const at = (options.now ?? nowIso)();
  const scenarioId = (options.newScenarioId ?? newScenarioId)();
  const file: ProjectFileV2 = {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    projectId: (options.newId ?? newProjectId)(),
    name: options.name ?? doc.metadata.name,
    ...(doc.metadata.description !== undefined && { description: doc.metadata.description }),
    createdAt: at,
    updatedAt: at,
    toolkit: options.toolkit ?? null,
    attributes: null,
    activeScenarioId: scenarioId,
    scenarios: [{ id: scenarioId, name: 'Scenario 1', design: doc, facePreferences: {}, cameras: [], display: {} }],
    settings: { display: { ...DEFAULT_DISPLAY } },
    assets: { policy: 'none' },
  };
  return readProjectFile(serializeProjectFile(file));
}

export interface SaveAsOptions extends IdClockOptions {
  /** Name of the new project. Default: the original's name. */
  readonly name?: string;
}

/**
 * "Save As New Project": an independent deep copy with a new project id and new scenario ids
 * (scenario order and content preserved; the active scenario is mapped). `createdAt` and
 * `updatedAt` are now. Nothing is shared with `file`: mutating either never changes the other.
 */
export function saveAsNewProject(file: ProjectFileV2, options: SaveAsOptions = {}): ProjectResult<ProjectFileV2> {
  const copy = readProjectFile(serializeProjectFile(file));
  if (!copy.ok) return copy;
  const at = (options.now ?? nowIso)();
  const makeScenarioId = options.newScenarioId ?? newScenarioId;
  const idMap = new Map(copy.value.scenarios.map((s) => [s.id, makeScenarioId()] as const));
  const next: ProjectFileV2 = {
    ...copy.value,
    projectId: (options.newId ?? newProjectId)(),
    name: options.name ?? copy.value.name,
    createdAt: at,
    updatedAt: at,
    activeScenarioId: idMap.get(copy.value.activeScenarioId)!,
    scenarios: copy.value.scenarios.map((s) => ({ ...s, id: idMap.get(s.id)! })),
  };
  return readProjectFile(serializeProjectFile(next));
}
