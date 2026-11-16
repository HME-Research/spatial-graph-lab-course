import { readAttributeRecord, serializeAttributeRecord } from '@app/extensions/projectAttributes';
import { readProjectFile, serializeProjectFile, type ProjectFileV1 } from '@app/project';
import { attributeStorageKey, type KeyValueStorage } from '@app/session/projectAttributeStore';

/**
 * One-time, non-destructive seed of a NEW local project's attribute record from the attribute
 * schema saved in this browser before local projects existed (`sgl:project-attributes:<codeProjectId>`,
 * docs/PROJECT-ATTRIBUTES.md). Owner decision (wave 1 audit): read-only — the legacy record is
 * never modified or deleted; an unreadable one is ignored with a short notice.
 */

export type LegacyAttributeSeed =
  | { readonly kind: 'none' }
  | { readonly kind: 'seed'; readonly record: unknown }
  | { readonly kind: 'unreadable'; readonly message: string };

/** The legacy record of `codeProjectId`, read only (never written, never removed). */
export function readLegacyAttributeRecord(storage: KeyValueStorage | null, codeProjectId: string): LegacyAttributeSeed {
  if (!storage) return { kind: 'none' };
  let text: string | null;
  try {
    text = storage.getItem(attributeStorageKey(codeProjectId));
  } catch {
    return { kind: 'none' };
  }
  if (text === null) return { kind: 'none' };
  const read = readAttributeRecord(text, { projectId: codeProjectId });
  if (!read.ok) return { kind: 'unreadable', message: read.issues.map((i) => i.message).join('; ') };
  return { kind: 'seed', record: JSON.parse(serializeAttributeRecord(read.value)) as unknown };
}

/**
 * `file` with its attribute record seeded from the legacy browser record of its code project, when
 * it references one and has no record of its own. Returns a notice when a legacy record exists but
 * cannot be used (the project then starts with the code project files' fields).
 */
export function seedLegacyAttributes(file: ProjectFileV1, storage: KeyValueStorage | null): { readonly file: ProjectFileV1; readonly notice: string | null } {
  if (file.definition === null || file.attributes !== null) return { file, notice: null };
  const id = file.definition.projectId;
  const seed = readLegacyAttributeRecord(storage, id);
  const ignored = (why: string) => ({
    file,
    notice: `The attribute fields saved earlier in this browser for “${id}” could not be read, so this project starts with the course project’s own fields (${why}).`,
  });
  if (seed.kind === 'none') return { file, notice: null };
  if (seed.kind === 'unreadable') return ignored(seed.message);
  const seeded = readProjectFile(serializeProjectFile({ ...file, attributes: seed.record }));
  if (!seeded.ok) return ignored(seeded.issues.map((i) => i.message).join('; '));
  return { file: seeded.value, notice: null };
}
