import type { ZodType } from 'zod';
import { type DesignDocumentV2, readDesignJson, type Result } from '@app/document';
import type { GraphAlgorithm, NodeTypeDefinition, ToolkitDefinition, SpatialAlgorithm } from '@student-api';
import {
  algorithmDefinitionSchema,
  nodeTypeDefinitionSchema,
  toolkitDefinitionSchema,
  readableId,
  zodMessages,
} from './definitions';
import { deriveAttributeBaseline, type AttributeBaseline } from './attributeBaseline';
import { diagnostic, type ExtensionDiagnostic } from './diagnostics';
import {
  discoverToolkits,
  selectToolkit,
  type ModuleLoader,
  type ToolkitGlobs,
  type ToolkitRequest,
  type ToolkitSource,
  type SourceFile,
} from './discover';

/**
 * Toolkit activation: loads the selected toolkit's modules, validates every definition at
 * runtime and builds a registry of plain data. Invalid or colliding definitions stay in the
 * registry with a failed status (so nodes of a broken type are recognised as broken, not
 * unknown) and conspicuous error diagnostics; they are never applied.
 */

export type DefinitionStatus = { readonly ok: true } | { readonly ok: false; readonly diagnosticIds: readonly string[] };

export interface RegisteredNodeType {
  readonly id: string;
  readonly file: string;
  /** The student's own object (reference identity is used by `attributesOf`). */
  readonly definition: NodeTypeDefinition;
  readonly status: DefinitionStatus;
}

export interface RegisteredAlgorithm {
  readonly id: string;
  readonly file: string;
  readonly definition: GraphAlgorithm | SpatialAlgorithm;
  readonly status: DefinitionStatus;
}

export interface RegisteredDesign {
  /** File name without `.json`. */
  readonly id: string;
  readonly file: string;
  /** Read and validated with `readDesignJson`. */
  readonly result: Result<DesignDocumentV2>;
}

export interface ActiveToolkit {
  readonly id: string;
  readonly definition: ToolkitDefinition;
  readonly nodeTypes: readonly RegisteredNodeType[];
  readonly algorithms: readonly RegisteredAlgorithm[];
  readonly designs: readonly RegisteredDesign[];
  /**
   * The toolkit-wide attribute schema its FILES describe (`defineToolkit({ attributes })` plus
   * node type declarations): the immutable baseline that seeds the stored schema. See
   * docs/PROJECT-ATTRIBUTES.md; the schema in use comes from app/session/projectAttributeStore.ts.
   */
  readonly attributeBaseline: AttributeBaseline;
  /** Every loading/definition problem of this toolkit. */
  readonly diagnostics: readonly ExtensionDiagnostic[];
}

export type Activation =
  | { readonly status: 'none' }
  | { readonly status: 'active'; readonly toolkit: ActiveToolkit }
  | { readonly status: 'failed'; readonly toolkitId: string; readonly diagnostics: readonly ExtensionDiagnostic[] };

type Loaded = { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly diagnostic: ExtensionDiagnostic };

async function loadDefault(source: SourceFile<ModuleLoader>): Promise<Loaded> {
  const subject = { kind: 'file', path: source.file } as const;
  try {
    const mod = await source.load();
    if (typeof mod === 'object' && mod !== null && 'default' in mod) return { ok: true, value: (mod as { default: unknown }).default };
    return { ok: false, diagnostic: diagnostic('missing-default-export', 'error', subject, `${source.file} has no default export`) };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, diagnostic: diagnostic('module-load-failed', 'error', subject, `${source.file} could not be loaded: ${detail}`) };
  }
}

interface Entry<D> {
  id: string;
  file: string;
  definition: D;
  diagnosticIds: string[];
}

/**
 * Load and validate one kind of definition file. Returns entries (valid or not, when an id can
 * be read) and diagnostics; entries sharing an id are all marked as duplicates.
 */
async function loadDefinitions<D>(
  files: readonly SourceFile<ModuleLoader>[],
  schema: ZodType,
  codes: { readonly invalid: 'invalid-node-type' | 'invalid-algorithm'; readonly duplicate: 'duplicate-node-type' | 'duplicate-algorithm' },
  what: string,
): Promise<{ entries: Entry<D>[]; diagnostics: ExtensionDiagnostic[] }> {
  const entries: Entry<D>[] = [];
  const diagnostics: ExtensionDiagnostic[] = [];
  for (const source of files) {
    const loaded = await loadDefault(source);
    if (!loaded.ok) {
      diagnostics.push(loaded.diagnostic);
      continue;
    }
    const parsed = schema.safeParse(loaded.value);
    const id = readableId(loaded.value);
    if (parsed.success) {
      entries.push({ id: id!, file: source.file, definition: loaded.value as D, diagnosticIds: [] });
      continue;
    }
    const messages = zodMessages(parsed.error.issues);
    const d = diagnostic(
      codes.invalid,
      'error',
      { kind: 'file', path: source.file },
      `invalid ${what}${id ? ` "${id}"` : ''} in ${source.file}: ${messages.join('; ')}${id ? ` — ${what} "${id}" is disabled` : ''}`,
    );
    diagnostics.push(d);
    if (id) entries.push({ id, file: source.file, definition: loaded.value as D, diagnosticIds: [d.id] });
  }

  const byId = new Map<string, Entry<D>[]>();
  for (const e of entries) byId.set(e.id, [...(byId.get(e.id) ?? []), e]);
  for (const [id, group] of byId) {
    if (group.length < 2) continue;
    for (const e of group) {
      const others = group.filter((o) => o !== e).map((o) => o.file);
      const d = diagnostic(
        codes.duplicate,
        'error',
        { kind: 'file', path: e.file },
        `${what} id "${id}" in ${e.file} is also defined in ${others.join(', ')} — all definitions of "${id}" are disabled`,
        { detail: id },
      );
      diagnostics.push(d);
      e.diagnosticIds.push(d.id);
    }
  }
  return { entries, diagnostics };
}

const status = (ids: readonly string[]): DefinitionStatus => (ids.length === 0 ? { ok: true } : { ok: false, diagnosticIds: ids });

/** Load, validate and register one discovered toolkit. Never throws. */
export async function activateToolkit(source: ToolkitSource): Promise<Activation> {
  const toolkitFile = await loadDefault(source.toolkit);
  if (!toolkitFile.ok) return { status: 'failed', toolkitId: source.id, diagnostics: [toolkitFile.diagnostic] };
  const parsedToolkit = toolkitDefinitionSchema.safeParse(toolkitFile.value);
  if (!parsedToolkit.success) {
    return {
      status: 'failed',
      toolkitId: source.id,
      diagnostics: [
        diagnostic(
          'invalid-toolkit-definition',
          'error',
          { kind: 'file', path: source.toolkit.file },
          `invalid toolkit definition in ${source.toolkit.file}: ${zodMessages(parsedToolkit.error.issues).join('; ')} — toolkit "${source.id}" was not activated`,
        ),
      ],
    };
  }
  const definition = toolkitFile.value as ToolkitDefinition;

  const types = await loadDefinitions<NodeTypeDefinition>(
    source.types,
    nodeTypeDefinitionSchema,
    { invalid: 'invalid-node-type', duplicate: 'duplicate-node-type' },
    'node type',
  );
  const algorithms = await loadDefinitions<GraphAlgorithm | SpatialAlgorithm>(
    source.algorithms,
    algorithmDefinitionSchema,
    { invalid: 'invalid-algorithm', duplicate: 'duplicate-algorithm' },
    'algorithm',
  );

  const diagnostics: ExtensionDiagnostic[] = [...types.diagnostics, ...algorithms.diagnostics];
  const designs: RegisteredDesign[] = [];
  for (const d of source.designs) {
    let result: Result<DesignDocumentV2>;

    try {
      const read = readDesignJson(await d.load());
      if (read.ok) {
        result = { ok: true, value: read.value.doc };
      } else result = read;
    } catch (error) {
      result = { ok: false, issues: [{ path: [], code: 'invalid-json', message: error instanceof Error ? error.message : String(error) }] };
    }
    designs.push({ id: d.stem, file: d.file, result });
    if (!result.ok) {
      diagnostics.push(
        diagnostic('invalid-design', 'error', { kind: 'file', path: d.file }, `design ${d.file} is invalid (${result.issues.length} problem${result.issues.length === 1 ? '' : 's'}) and cannot be loaded`),
      );
    }
  }

  if (definition.defaultDesign !== undefined) {
    const chosen = designs.find((d) => d.id === definition.defaultDesign);
    const subject = { kind: 'file', path: source.toolkit.file } as const;
    if (!chosen) {
      diagnostics.push(
        diagnostic('default-design-missing', 'error', subject, `defaultDesign "${definition.defaultDesign}" does not exist in toolkits/${source.id}/designs/`),
      );
    } else if (!chosen.result.ok) {
      diagnostics.push(diagnostic('default-design-invalid', 'error', subject, `defaultDesign "${definition.defaultDesign}" (${chosen.file}) is invalid`));
    }
  }

  const nodeTypes = types.entries.map((e) => ({ id: e.id, file: e.file, definition: e.definition, status: status(e.diagnosticIds) }));
  const attributeBaseline = deriveAttributeBaseline(source.id, definition, nodeTypes);
  diagnostics.push(...attributeBaseline.diagnostics);

  return {
    status: 'active',
    toolkit: {
      id: source.id,
      definition,
      nodeTypes,
      attributeBaseline,
      algorithms: algorithms.entries.map((e) => ({ id: e.id, file: e.file, definition: e.definition, status: status(e.diagnosticIds) })),
      designs,
      diagnostics,
    },
  };
}

/**
 * The registry of a project WITHOUT a toolkit (P4): no code types, algorithms, designs or attribute
 * declarations. Lets the shell treat a no-toolkit project like any other, so its project functions
 * (`withProjectFunctions`) and its own attribute record work. `projectId` is the saved project's own
 * id, the owner scope of its attribute record (docs/PROJECT-ATTRIBUTES.md). Pure.
 */
export function projectOnlyToolkit(projectId: string): ActiveToolkit {
  const definition: ToolkitDefinition = Object.freeze({ name: 'No toolkit' });
  return {
    id: projectId,
    definition,
    nodeTypes: [],
    algorithms: [],
    designs: [],
    attributeBaseline: deriveAttributeBaseline(projectId, definition, []),
    diagnostics: [],
  };
}

/**
 * Discover, select and activate. `discovery` holds problems with toolkit folders themselves
 * (shown alongside the activation outcome). A requested toolkit that does not exist yields a
 * failed activation.
 */
export async function activate(
  globs: ToolkitGlobs,
  request: ToolkitRequest,
): Promise<{ readonly activation: Activation; readonly discovery: readonly ExtensionDiagnostic[] }> {
  const { toolkits, diagnostics } = discoverToolkits(globs);
  const selection = selectToolkit(
    toolkits.map((p) => p.id),
    request,
  );
  if (selection.diagnostic) {
    const requested = selection.diagnostic.subject.kind === 'toolkit' ? selection.diagnostic.subject.id : '';
    return { activation: { status: 'failed', toolkitId: requested, diagnostics: [selection.diagnostic] }, discovery: diagnostics };
  }
  const source = toolkits.find((p) => p.id === selection.id);
  return { activation: source ? await activateToolkit(source) : { status: 'none' }, discovery: diagnostics };
}

export interface StartupDesign {
  /** null: nothing loaded (the toolkit's chosen default design is missing or invalid). */
  readonly doc: DesignDocumentV2 | null;
  readonly source: string;
  /** To be shown prominently and persistently. */
  readonly diagnostics: readonly ExtensionDiagnostic[];
}

/**
 * The design to show at startup:
 * - no toolkit → the built-in example;
 * - failed activation → the built-in example plus the activation diagnostics;
 * - active toolkit without `defaultDesign` → the built-in example;
 * - active toolkit with a valid `defaultDesign` → that design;
 * - active toolkit whose `defaultDesign` is missing or invalid → nothing, plus diagnostics.
 */
export function resolveStartupDesign(
  activation: Activation,
  builtIn: { readonly doc: DesignDocumentV2; readonly source: string },
): StartupDesign {
  if (activation.status === 'none') return { ...builtIn, diagnostics: [] };
  if (activation.status === 'failed') return { ...builtIn, diagnostics: activation.diagnostics };
  const { toolkit } = activation;
  const name = toolkit.definition.defaultDesign;
  if (name === undefined) return { ...builtIn, diagnostics: toolkit.diagnostics };
  const chosen = toolkit.designs.find((d) => d.id === name);
  if (chosen?.result.ok) return { doc: chosen.result.value, source: chosen.file, diagnostics: toolkit.diagnostics };
  return { doc: null, source: chosen?.file ?? `toolkits/${toolkit.id}/designs/${name}.json`, diagnostics: toolkit.diagnostics };
}
