import type { ActiveToolkit, AttributeCollection, AttributeField, SchemaEdit, ProjectAttributeSchema } from '@app/extensions';
import { canDeleteCustomAttribute, customAttributeSource, type CustomAttributeSource } from './sections';

/**
 * Where each custom attribute comes from (Programme P4, item C). Pure.
 *
 * The origin is DERIVED, never stored: an attribute is "Toolkit: <name>" when the active toolkit's
 * files declare it (`isBaselineField` against `ActiveToolkit.attributeBaseline`, the same key rule
 * `mergeBaseline` uses), otherwise it is "Yours". A project without a toolkit has an empty
 * baseline, so all its attributes are yours. Nothing new is written to the attribute record or
 * the project file.
 */

/** The parts of the active toolkit that decide origins. */
export type AttributeOrigin = Pick<ActiveToolkit, 'definition' | 'attributeBaseline'>;

/** = `customAttributeSource` in `sections.ts` (the pure helper views may import). */
export const customAttributeSourceOf: (
  field: Pick<AttributeField, 'key' | 'formerKeys'>,
  collection: AttributeCollection,
  toolkit: AttributeOrigin | null | undefined,
) => CustomAttributeSource = customAttributeSource;

/** `customAttributeSourceOf` bound to one collection and toolkit. */
export const sourceResolver =
  (collection: AttributeCollection, toolkit: AttributeOrigin | null | undefined) =>
  (field: Pick<AttributeField, 'key' | 'formerKeys'>): CustomAttributeSource =>
    customAttributeSourceOf(field, collection, toolkit);

/** Why a toolkit attribute has no delete action (tooltip and refusal text). */
export const toolkitDeleteReason = (toolkitName: string): string =>
  `Comes from the toolkit “${toolkitName}”, so it cannot be deleted: the toolkit’s functions and algorithms may read it. You can still rename it or change its default.`;

/**
 * The refusal for a batch of schema edits that would delete a toolkit attribute, or null. The
 * Attributes panel hides the delete action for those rows; this keeps every other path (dialogs,
 * keyboard) from deleting one anyway.
 */
export function toolkitDeleteRefusal(edits: readonly SchemaEdit[], schema: ProjectAttributeSchema, toolkit: AttributeOrigin | null | undefined): string | null {
  for (const edit of edits) {
    if (edit.type !== 'delete-field') continue;
    const field = schema[edit.collection].find((f) => f.id === edit.fieldId);
    if (!field) continue;
    const source = customAttributeSourceOf(field, edit.collection, toolkit);
    if (!canDeleteCustomAttribute(source) && source.kind === 'toolkit') return `“${field.label}” ${toolkitDeleteReason(source.toolkitName).replace(/^Comes/, 'comes')}`;
  }
  return null;
}
