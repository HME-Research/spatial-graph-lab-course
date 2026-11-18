import type { DesignDocumentV2 } from '@app/document/v2';
import { EMPTY_ATTRIBUTE_SCHEMA, makeAttributeRecord, serializeAttributeRecord } from '@app/extensions/projectAttributes';
import { formatProjectIssues, readProjectFile, serializeProjectFile, type ProjectFileV2, type ProjectIssue } from '@app/project';
import type { KeyValueStorage } from '@app/session/projectAttributeStore';
import { blankDesign, checkName, newProjectFromDesign, readProjectOrDesign, type ProjectOrigin } from '@app/session/projectStore';
import type { LeaveOptions, ProjectController } from '@app/session/projectStoreController';
import { seedLegacyAttributes } from './legacyAttributes';

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
    }
  | { readonly ok: false; readonly message: string };

export interface WelcomeHost {
  readonly controller: ProjectController;
  /** The starting design of toolkit `toolkitId` (its default design, else the built-in example). */
  readonly startingDesign: (toolkitId: string | null) => Promise<StartingDesign>;
  /** Toolkit referenced by projects made from a plain design file. */
  readonly defaultToolkitId: string | null;
  /**
   * Browser storage holding attribute schemas saved before local projects existed
   * (`sgl:project-attributes:<codeProjectId>`). Read only, to seed NEW projects once. null = none.
   */
  readonly legacyAttributes?: KeyValueStorage | null;
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

/** Open `file` (seeded with legacy attributes when it is new and references a toolkit). */
async function openNew(
  host: WelcomeHost,
  file: ProjectFileV2,
  origin: ProjectOrigin,
  options: { readonly exported?: boolean; readonly seed: boolean } & LeaveOptions,
): Promise<FlowOutcome> {
  const seeded = options.seed ? seedLegacyAttributes(file, host.legacyAttributes ?? null) : { file, notice: null };
  const opened = await host.controller.open(seeded.file, origin, {
    ...(options.exported !== undefined && { exported: options.exported }),
    ...(options.discard !== undefined && { discard: options.discard }),
  });
  if (!opened.ok) {
    return { ok: false, source: origin.label, message: opened.message, issues: [], ...(opened.needsConfirmation && { needsConfirmation: true as const }) };
  }
  if (seeded.notice) host.controller.notify(seeded.notice);
  return { ok: true, projectId: opened.project.meta.projectId };
}

/**
 * The minimal starting state of a CREATED project (owner decision, UI refinement 2026-11-17): one
 * scenario with an empty graph (no rooms; the toolkit's Building settings are kept), only the
 * required attributes (Function, Level: no custom attributes) and no calculated attributes shown.
 * Students add attributes explicitly. The attributes declared by the toolkit's types stay
 * available through Attributes → Advanced → "Add attributes from the toolkit files".
 */
export function minimalProjectFile(
  file: ProjectFileV2,
  attributeSignature: string | undefined,
): { readonly ok: true; readonly value: ProjectFileV2 } | { readonly ok: false; readonly issues: readonly ProjectIssue[] } {
  const attributes =
    file.toolkit !== null && attributeSignature !== undefined
      ? (JSON.parse(serializeAttributeRecord(makeAttributeRecord(file.toolkit.id, EMPTY_ATTRIBUTE_SCHEMA, attributeSignature))) as unknown)
      : file.attributes;
  // Re-read the result: validated exactly like a stored or imported file.
  const read = readProjectFile(serializeProjectFile({ ...file, attributes, settings: { ...file.settings, calculatedFields: [] } }));
  return read.ok ? { ok: true, value: read.value } : { ok: false, issues: read.issues };
}

/** Create project: an EMPTY graph with only the required attributes (see `minimalProjectFile`). */
export async function createProject(host: WelcomeHost, rawName: string, toolkitId: string | null, options: LeaveOptions = {}): Promise<FlowOutcome> {
  const name = checkName(rawName, 'project');
  if (!name.ok) return failed('new project', name.message);
  const start = await host.startingDesign(toolkitId);
  if (!start.ok) return failed('new project', start.message);
  const file = newProjectFromDesign(blankDesign(start.doc, name.value), { name: name.value, toolkit: toolkitId === null ? null : { id: toolkitId } });
  if (!file.ok) return failed('new project', `The new project could not be created: ${formatProjectIssues(file.issues)}`, file.issues);
  const minimal = minimalProjectFile(file.value, start.attributeSignature);
  if (!minimal.ok) return failed('new project', `The new project could not be created: ${formatProjectIssues(minimal.issues)}`, minimal.issues);
  return openNew(host, minimal.value, { kind: 'created', label: 'new project' }, { ...options, seed: false });
}

export const EXAMPLE_PROJECT_NAME = 'Two-storey example';

/** Try Example: the built-in example as a NEW project (each time; Recent restores earlier ones). */
export async function tryExample(host: WelcomeHost, example: DesignDocumentV2, exampleSource: string, options: LeaveOptions = {}): Promise<FlowOutcome> {
  const file = newProjectFromDesign(example, {
    name: EXAMPLE_PROJECT_NAME,
    toolkit: host.defaultToolkitId === null ? null : { id: host.defaultToolkitId },
  });
  if (!file.ok) return failed(exampleSource, `The example could not be opened: ${formatProjectIssues(file.issues)}`, file.issues);
  return openNew(host, file.value, { kind: 'example', label: exampleSource }, { ...options, seed: true });
}

/**
 * Open a chosen file: a project file opens as that project (a separate copy if this browser already
 * has a project with its id; its own attribute record is kept); a design file (v1/v2) becomes a new
 * project with one scenario (seeded with legacy attributes of its toolkit, if any).
 */
export async function openProjectText(host: WelcomeHost, text: string, fileName: string, options: LeaveOptions = {}): Promise<FlowOutcome> {
  const stem = fileName.replace(/\.json$/i, '').replace(/\.project$/i, '');
  const read = readProjectOrDesign(text, { toolkit: host.defaultToolkitId === null ? null : { id: host.defaultToolkitId } });
  if (!read.ok) return failed(fileName, `${fileName} could not be opened: ${formatProjectIssues(read.issues)}`, read.issues);
  const file = read.kind === 'design' && read.file.name.trim() === '' ? { ...read.file, name: stem } : read.file;
  const isProject = read.kind === 'project';
  return openNew(host, file, { kind: isProject ? 'opened-file' : 'imported-design', label: fileName }, { ...options, exported: isProject, seed: !isProject });
}
