import { fail as coreFail, ok as coreOk, type Result } from '@core/graph';

/**
 * Diagnostics produced while loading a project, checking conformance and running algorithms.
 * Each has a stable `id` built from its code, subject and attribute — never from array indices of
 * document items — so identities survive reordering and unrelated edits (used for conformance
 * non-regression).
 */

export type Severity = 'error' | 'warning' | 'info';

export type ExtensionIssueCode =
  // discovery, selection and activation
  | 'invalid-project-folder'
  | 'missing-project-file'
  | 'unknown-project'
  | 'module-load-failed'
  | 'missing-default-export'
  | 'invalid-project-definition'
  | 'invalid-node-type'
  | 'duplicate-node-type'
  | 'invalid-algorithm'
  | 'duplicate-algorithm'
  | 'invalid-design'
  | 'default-design-missing'
  | 'default-design-invalid'
  // conformance of a document to the project's node types
  | 'unknown-node-type'
  | 'broken-node-type'
  | 'invalid-attribute-value'
  | 'undeclared-attribute'
  | 'legacy-attribute-key'
  // project-wide attribute schema (docs/PROJECT-ATTRIBUTES.md)
  | 'attribute-declaration-conflict'
  | 'invalid-attribute-schema'
  | 'attribute-schema-version'
  | 'attribute-schema-project-mismatch'
  | 'attribute-baseline-changed'
  | 'attribute-schema-storage'
  | 'attribute-edit-refused'
  // algorithm execution
  | 'unknown-algorithm'
  | 'algorithm-disabled'
  | 'invalid-parameter'
  | 'run-failed'
  | 'type-not-registered'
  | 'type-mismatch'
  | 'invalid-result'
  | 'unknown-node-reference'
  | 'unknown-metric'
  // transformation operations
  | 'invalid-id'
  | 'duplicate-node-id'
  | 'duplicate-edge-id'
  | 'invalid-grid'
  | 'invalid-size'
  | 'occupied-cell'
  | 'undeclared-attribute-write'
  | 'unknown-edge-kind'
  | 'missing-node'
  | 'missing-edge'
  | 'self-edge'
  | 'duplicate-relationship'
  | 'invalid-edge-geometry'
  | 'final-document-invalid'
  | 'conformance-regression';

export type DiagnosticSubject =
  | { readonly kind: 'project'; readonly id: string }
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'node'; readonly id: string }
  | { readonly kind: 'edge'; readonly id: string }
  | { readonly kind: 'algorithm'; readonly id: string }
  | { readonly kind: 'operation'; readonly index: number };

export interface ExtensionDiagnostic {
  /** Stable identity, e.g. "invalid-attribute-value|node:store|daylight". */
  readonly id: string;
  readonly code: ExtensionIssueCode;
  readonly severity: Severity;
  readonly subject: DiagnosticSubject;
  readonly attribute?: string;
  readonly message: string;
}

export type ExtensionResult<T> = Result<T, ExtensionDiagnostic>;

export const ok = <T>(value: T): ExtensionResult<T> => coreOk(value);
export const fail = <T = never>(diagnostics: readonly ExtensionDiagnostic[]): ExtensionResult<T> => coreFail(diagnostics);

function subjectKey(subject: DiagnosticSubject): string {
  switch (subject.kind) {
    case 'file':
      return `file:${subject.path}`;
    case 'operation':
      return `operation:${subject.index}`;
    default:
      return `${subject.kind}:${subject.id}`;
  }
}

/**
 * Build a diagnostic. `detail` distinguishes several diagnostics with the same code and subject
 * (for example two problems in one definition file); `attribute` is part of the identity.
 */
export function diagnostic(
  code: ExtensionIssueCode,
  severity: Severity,
  subject: DiagnosticSubject,
  message: string,
  extra: { readonly attribute?: string; readonly detail?: string } = {},
): ExtensionDiagnostic {
  const parts = [code, subjectKey(subject)];
  if (extra.attribute !== undefined) parts.push(extra.attribute);
  if (extra.detail !== undefined) parts.push(extra.detail);
  return {
    id: parts.join('|'),
    code,
    severity,
    subject,
    ...(extra.attribute !== undefined && { attribute: extra.attribute }),
    message,
  };
}

/** Errors and warnings block a transformation that introduces them; information never does. */
export const isBlocking = (d: ExtensionDiagnostic): boolean => d.severity !== 'info';
