import type { FacadeAssetV1 } from '@app/assets';
import type { DesignDocumentV2 } from '@app/document';
import { EMPTY_ATTRIBUTE_SCHEMA, makeAttributeRecord, serializeAttributeRecord, type ProjectAttributeSchema } from '@app/extensions/projectAttributes';
import { formatProjectIssues, projectAssetsOf, readProjectFile, serializeProjectFile, type ProjectFileV2, type ProjectIssue } from '@app/project';
import { blankDesign, checkName, newProjectFromDesign, readProjectOrDesign, type ProjectOrigin } from '@app/session/projectStore';
import type { LeaveOptions, ProjectController } from '@app/session/projectStoreController';

/**
 * Welcome / Project Files actions as UI-independent async steps (workstream B). The shell supplies
 * how a toolkit's starting design is obtained (it activates `toolkits/<id>`); everything else
 * is validated here and opened on the controller. Failures never replace the open project, and the
 * open project is never left with unstored changes unless the caller passes `discard` (after asking).
 */

export type StartingDesign =
  | {
      readonly ok: true;
      readonly doc: DesignDocumentV2;
      readonly source: string;
      /**
       * Signature of the toolkit's attribute baseline (`ActiveToolkit.attributeBaseline.signature`).
       * Lets a NEW project record "no custom attributes" against the baseline it started from, so it
       * is not reported as "the toolkit files changed". Absent when the toolkit did not activate.
       */
      readonly attributeSignature?: string;
      /**
       * The toolkit's custom attributes (`ActiveToolkit.attributeBaseline.schema`: the fields its
       * `toolkit.ts` and Functions declare, with each Function's defaults). A created project starts
       * with exactly these (owner decision 2026-11-19). Absent: no custom attributes.
       */
      readonly attributeSchema?: ProjectAttributeSchema;
    }
  | { readonly ok: false; readonly message: string };

/**
 * A toolkit design opened with Open example… (owner decision 2026-11-20): the validated design,
 * the toolkit's custom attributes (as for Create project) and the façade assets the design uses,
 * already imported from `toolkits/<id>/assets/` through the normal façade import.
 */
export type ExampleDesign =
  | (Omit<Extract<StartingDesign, { ok: true }>, 'ok'> & { readonly ok: true; readonly assets: readonly FacadeAssetV1[] })
  | { readonly ok: false; readonly source: string; readonly message: string; readonly issues?: readonly ProjectIssue[] };

export interface WelcomeHost {
  readonly controller: ProjectController;
  /** The starting design of toolkit `toolkitId` (its default design, else the built-in example). */
  readonly startingDesign: (toolkitId: string | null) => Promise<StartingDesign>;
  /** Toolkit referenced by projects made from a plain design file. */
  readonly defaultToolkitId: string | null;
  /** Design `designId` of toolkit `toolkitId` for Open example… (absent: toolkit examples cannot be opened). */
  readonly exampleDesign?: (toolkitId: string, designId: string) => Promise<ExampleDesign>;
}

export type FlowOutcome =
  | { readonly ok: true; readonly projectId: string }
  /**
   * `issues` for validation failures (shown with paths), `message` otherwise. `needsConfirmation`:
   * the shown project has changes that could not be stored; ask, then repeat with `discard`.
   */
  | {
      readonly ok: false;
      readonly source: string;
      readonly message: string;
      readonly issues: readonly ProjectIssue[];
      readonly needsConfirmation?: true;
    };

const failed = (source: string, message: string, issues: readonly ProjectIssue[] = []): FlowOutcome => ({ ok: false, source, message, issues });

/** Open `file` as the shown project. */
async function openNew(
  host: WelcomeHost,
  file: ProjectFileV2,
  origin: ProjectOrigin,
  options: { readonly exported?: boolean } & LeaveOptions,
): Promise<FlowOutcome> {
  const opened = await host.controller.open(file, origin, {
    ...(options.exported !== undefined && { exported: options.exported }),
    ...(options.discard !== undefined && { discard: options.discard }),
  });
  if (!opened.ok) {
    return { ok: false, source: origin.label, message: opened.message, issues: [], ...(opened.needsConfirmation && { needsConfirmation: true as const }) };
  }
  return { ok: true, projectId: opened.project.meta.projectId };
}

/**
 * The starting state of a CREATED project (owner decisions 2026-11-17 and 2026-11-19): one scenario
 * with an EMPTY graph (no rooms; the toolkit's Building settings are kept; its `defaultDesign` is
 * never copied in), no calculated attributes shown, and — with a toolkit — exactly that toolkit's
 * custom attributes (`attributeSchema`: e.g. House's Target area and Priority, with each Function's
 * defaults), tagged `Toolkit: <name>`. Without a toolkit: only the required attributes.
 */
export function minimalProjectFile(
  file: ProjectFileV2,
  attributeSignature: string | undefined,
  attributeSchema: ProjectAttributeSchema = EMPTY_ATTRIBUTE_SCHEMA,
): { readonly ok: true; readonly value: ProjectFileV2 } | { readonly ok: false; readonly issues: readonly ProjectIssue[] } {
  const attributes = toolkitAttributes(file, attributeSignature, attributeSchema);
  // Re-read the result: validated exactly like a stored or imported file.
  const read = readProjectFile(serializeProjectFile({ ...file, attributes, settings: { ...file.settings, calculatedFields: [] } }));
  return read.ok ? { ok: true, value: read.value } : { ok: false, issues: read.issues };
}

/** The attribute record of a new project: exactly the toolkit's custom attributes (with a toolkit that activated). */
function toolkitAttributes(file: ProjectFileV2, attributeSignature: string | undefined, attributeSchema: ProjectAttributeSchema): unknown {
  return file.toolkit !== null && attributeSignature !== undefined
    ? (JSON.parse(serializeAttributeRecord(makeAttributeRecord(file.toolkit.id, attributeSchema, attributeSignature))) as unknown)
    : file.attributes;
}

/**
 * The project of a toolkit example (owner decision 2026-11-20): the design as its one scenario
 * (rooms, relationships and Building Designer settings kept), the toolkit's custom attributes
 * seeded as by Create project, the imported façades it uses as project assets, and the default
 * calculated attributes (like Try example). Re-read, so it is validated like any opened file.
 */
export function exampleProjectFile(
  file: ProjectFileV2,
  attributeSignature: string | undefined,
  attributeSchema: ProjectAttributeSchema = EMPTY_ATTRIBUTE_SCHEMA,
  assets: readonly FacadeAssetV1[] = [],
): { readonly ok: true; readonly value: ProjectFileV2 } | { readonly ok: false; readonly issues: readonly ProjectIssue[] } {
  const attributes = toolkitAttributes(file, attributeSignature, attributeSchema);
  const read = readProjectFile(serializeProjectFile({ ...file, attributes, assets: projectAssetsOf(assets) }));
  return read.ok ? { ok: true, value: read.value } : { ok: false, issues: read.issues };
}

/** Create project: an EMPTY graph with the chosen toolkit's custom attributes, if any (see `minimalProjectFile`). */
export async function createProject(host: WelcomeHost, rawName: string, toolkitId: string | null, options: LeaveOptions = {}): Promise<FlowOutcome> {
  const name = checkName(rawName, 'project');
  if (!name.ok) return failed('new project', name.message);
  const start = await host.startingDesign(toolkitId);
  if (!start.ok) return failed('new project', start.message);
  const file = newProjectFromDesign(blankDesign(start.doc, name.value), { name: name.value, toolkit: toolkitId === null ? null : { id: toolkitId } });
  if (!file.ok) return failed('new project', `The new project could not be created: ${formatProjectIssues(file.issues)}`, file.issues);
  const minimal = minimalProjectFile(file.value, start.attributeSignature, start.attributeSchema);
  if (!minimal.ok) return failed('new project', `The new project could not be created: ${formatProjectIssues(minimal.issues)}`, minimal.issues);
  return openNew(host, minimal.value, { kind: 'created', label: 'new project' }, options);
}

export const EXAMPLE_PROJECT_NAME = 'Example – graph only (no toolkit)';

/** "circulation" → "Circulation", "living-room" → "Living room". */
const functionLabel = (functionId: string): string => `${functionId.charAt(0).toUpperCase()}${functionId.slice(1).replace(/-/g, ' ')}`;

/**
 * Project functions for a design opened without a toolkit: one per Function its rooms use (first
 * use order), so the Function picker, Attributes and Designer list them like any other function.
 */
export const functionsOfDesign = (doc: DesignDocumentV2): { readonly id: string; readonly label: string }[] =>
  [...new Set(doc.nodes.map((n) => n.function))].map((id) => ({ id, label: functionLabel(id) }));

/**
 * Try Example: the built-in graph-only example as a NEW project (each time; Recent restores earlier
 * ones). It never uses a toolkit (P4): its Functions become project functions.
 */
export async function tryExample(host: WelcomeHost, example: DesignDocumentV2, exampleSource: string, options: LeaveOptions = {}): Promise<FlowOutcome> {
  const file = newProjectFromDesign(example, { name: EXAMPLE_PROJECT_NAME, toolkit: null });
  if (!file.ok) return failed(exampleSource, `The example could not be opened: ${formatProjectIssues(file.issues)}`, file.issues);
  const withFunctions: ProjectFileV2 = { ...file.value, settings: { ...file.value.settings, functions: functionsOfDesign(example) } };
  return openNew(host, withFunctions, { kind: 'example', label: exampleSource }, options);
}

/**
 * Open example… → a toolkit design (owner decision 2026-11-20): always a NEW project (the open one
 * is never overwritten) named after the design, with that toolkit active, its custom attributes
 * seeded (the same record as Create project with that toolkit), the design with its Building
 * Designer settings, and the façade assets it uses. Nothing is opened when the design, its assets
 * or the resulting project are invalid.
 */
export async function openToolkitExample(host: WelcomeHost, toolkitId: string, designId: string, options: LeaveOptions = {}): Promise<FlowOutcome> {
  if (!host.exampleDesign) return failed(designId, 'Toolkit examples cannot be opened here.');
  const start = await host.exampleDesign(toolkitId, designId);
  if (!start.ok) return failed(start.source, `The example could not be opened: ${start.message}`, start.issues ?? []);
  const name = checkName(start.doc.metadata.name, 'project');
  const file = newProjectFromDesign(start.doc, { name: name.ok ? name.value : designId, toolkit: { id: toolkitId } });
  if (!file.ok) return failed(start.source, `The example could not be opened: ${formatProjectIssues(file.issues)}`, file.issues);
  const project = exampleProjectFile(file.value, start.attributeSignature, start.attributeSchema, start.assets);
  if (!project.ok) return failed(start.source, `The example could not be opened: ${formatProjectIssues(project.issues)}`, project.issues);
  return openNew(host, project.value, { kind: 'example', label: start.source }, options);
}

/**
 * Open a chosen file: a project file opens as that project (a separate copy if this browser already
 * has a project with its id; its own attribute record is kept); a design file (v1/v2) becomes a new
 * project with one scenario.
 */
export async function openProjectText(host: WelcomeHost, text: string, fileName: string, options: LeaveOptions = {}): Promise<FlowOutcome> {
  const stem = fileName.replace(/\.json$/i, '').replace(/\.project$/i, '');
  const read = readProjectOrDesign(text, { toolkit: host.defaultToolkitId === null ? null : { id: host.defaultToolkitId } });
  if (!read.ok) return failed(fileName, `${fileName} could not be opened: ${formatProjectIssues(read.issues)}`, read.issues);
  const file = read.kind === 'design' && read.file.name.trim() === '' ? { ...read.file, name: stem } : read.file;
  const isProject = read.kind === 'project';
  return openNew(host, file, { kind: isProject ? 'opened-file' : 'imported-design', label: fileName }, { ...options, exported: isProject });
}
