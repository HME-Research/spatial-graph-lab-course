import type { DesignDocumentV2 } from '@app/document/v2';
import { formatProjectIssues, type ProjectIssue } from '@app/project';
import { checkName, newProjectFromDesign, readProjectOrDesign } from '@app/session/projectStore';
import type { ProjectController } from '@app/session/projectStoreController';

/**
 * Welcome / Project Files actions as UI-independent async steps (workstream B). The shell supplies
 * how a code project's starting design is obtained (it activates `projects/<id>`); everything else
 * is validated here and opened on the controller. Failures never replace the open project.
 */

export type StartingDesign =
  | { readonly ok: true; readonly doc: DesignDocumentV2; readonly source: string }
  | { readonly ok: false; readonly message: string };

export interface WelcomeHost {
  readonly controller: ProjectController;
  /** The starting design of code project `definitionId` (its default design, else the built-in example). */
  readonly startingDesign: (definitionId: string | null) => Promise<StartingDesign>;
  /** Code project referenced by projects made from a plain design file. */
  readonly defaultDefinitionId: string | null;
}

export type FlowOutcome =
  | { readonly ok: true; readonly projectId: string }
  /** `issues` for validation failures (shown with paths), `message` otherwise. */
  | { readonly ok: false; readonly source: string; readonly message: string; readonly issues: readonly ProjectIssue[] };

const failed = (source: string, message: string, issues: readonly ProjectIssue[] = []): FlowOutcome => ({ ok: false, source, message, issues });

export async function createProject(host: WelcomeHost, rawName: string, definitionId: string | null): Promise<FlowOutcome> {
  const name = checkName(rawName, 'project');
  if (!name.ok) return failed('new project', name.message);
  const start = await host.startingDesign(definitionId);
  if (!start.ok) return failed('new project', start.message);
  const file = newProjectFromDesign(start.doc, { name: name.value, definition: definitionId === null ? null : { projectId: definitionId } });
  if (!file.ok) return failed(start.source, `The starting design could not be used: ${formatProjectIssues(file.issues)}`, file.issues);
  const opened = await host.controller.open(file.value, { kind: 'created', label: start.source });
  return opened.ok ? { ok: true, projectId: opened.project.meta.projectId } : failed(start.source, opened.message);
}

export const EXAMPLE_PROJECT_NAME = 'Two-storey example';

/** Try Example: the built-in example as a NEW project (each time; Recent restores earlier ones). */
export async function tryExample(host: WelcomeHost, example: DesignDocumentV2, exampleSource: string): Promise<FlowOutcome> {
  const file = newProjectFromDesign(example, {
    name: EXAMPLE_PROJECT_NAME,
    definition: host.defaultDefinitionId === null ? null : { projectId: host.defaultDefinitionId },
  });
  if (!file.ok) return failed(exampleSource, `The example could not be opened: ${formatProjectIssues(file.issues)}`, file.issues);
  const opened = await host.controller.open(file.value, { kind: 'example', label: exampleSource });
  return opened.ok ? { ok: true, projectId: opened.project.meta.projectId } : failed(exampleSource, opened.message);
}

/**
 * Open a chosen file: a project file opens as that project (a separate copy if this browser already
 * has a project with its id); a design file (v1/v2) becomes a new project with one scenario.
 */
export async function openProjectText(host: WelcomeHost, text: string, fileName: string): Promise<FlowOutcome> {
  const stem = fileName.replace(/\.json$/i, '').replace(/\.project$/i, '');
  const read = readProjectOrDesign(text, { definition: host.defaultDefinitionId === null ? null : { projectId: host.defaultDefinitionId } });
  if (!read.ok) return failed(fileName, `${fileName} could not be opened: ${formatProjectIssues(read.issues)}`, read.issues);
  const file = read.kind === 'design' && read.file.name.trim() === '' ? { ...read.file, name: stem } : read.file;
  const opened = await host.controller.open(file, { kind: read.kind === 'project' ? 'opened-file' : 'imported-design', label: fileName }, { exported: read.kind === 'project' });
  return opened.ok ? { ok: true, projectId: opened.project.meta.projectId } : failed(fileName, opened.message);
}
