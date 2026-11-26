import type { DesignDocumentV2 } from '@app/document';
import type { ActiveToolkit } from './activate';
import { mergeBaseline } from './attributeBaseline';
import { isProjectFunction } from './projectFunctions';
import { checkFieldValue, fieldKeys, makeAttributeRecord, serializeAttributeRecord, type AttributeCollection, type AttributeField, type ProjectAttributeSchema } from './projectAttributes';

/**
 * Add a toolkit to a project that has none (owner 2026-11-26). Pure: decides whether the project's
 * own attributes and the toolkit's can live together, and what the project's attribute record
 * becomes. Nothing in the designs changes: every room keeps its Function id and its stored values.
 *
 * Rule (the safe option): the project's attributes are kept as they are, and the toolkit's are added
 * (`mergeBaseline`, the same merge as "Add toolkit attributes"). The toolkit is REFUSED, with a plain
 * explanation, when one of its attributes has the key of one of yours but another type (or, for a
 * choice, options yours lacks), or when rooms or edges already hold values under a key the toolkit
 * would add that do not fit the toolkit's attribute. Rooms whose Function the toolkit also defines
 * then use the toolkit's Function (its colour unless you chose one, its façade, its defaults);
 * a project Function with such an id is settled with the existing clash notice.
 */

export type AttachPlan =
  | {
      readonly ok: true;
      /** The project's attribute record afterwards (owner scope: the toolkit's name). */
      readonly attributes: unknown;
      /** What changes, in plain words, for the confirmation. */
      readonly changes: readonly string[];
    }
  | { readonly ok: false; readonly problems: readonly string[] };

const what = (collection: AttributeCollection) => (collection === 'nodes' ? 'node' : 'edge');
const kindName = (f: Pick<AttributeField, 'kind'>) => ({ number: 'Number', text: 'Text', boolean: 'Yes/No', enum: 'Choice' })[f.kind];

/** Whether the project's toolkit could be `toolkit` without breaking the project's attributes or values. */
export function planToolkitAttach(
  toolkit: ActiveToolkit,
  current: ProjectAttributeSchema,
  designs: readonly DesignDocumentV2[],
  projectFunctions: readonly { readonly id: string; readonly label: string }[] = [],
): AttachPlan {
  const baseline = toolkit.attributeBaseline.schema;
  const name = toolkit.definition.name;
  const problems: string[] = [];
  const added: AttributeField[] = [];
  for (const collection of ['nodes', 'edges'] as const) {
    for (const field of baseline[collection]) {
      const mine = current[collection].find((f) => fieldKeys(f).some((k) => k.toLowerCase() === field.key.toLowerCase()));
      if (!mine) {
        added.push(field);
        // Values stored earlier under this key (not in your attributes) must fit the toolkit's attribute.
        const items = designs.flatMap((d) => (collection === 'nodes' ? d.nodes : d.edges) as readonly { readonly id: number; readonly custom?: Readonly<Record<string, unknown>> }[]);
        const misfits = items.filter((item) => item.custom && Object.prototype.hasOwnProperty.call(item.custom, field.key) && item.custom[field.key] !== null && checkFieldValue(field, item.custom[field.key]) !== 'ok');
        if (misfits.length > 0) {
          problems.push(
            `${what(collection) === 'node' ? 'Nodes' : 'Edges'} ${misfits.slice(0, 5).map((m) => m.id).join(', ')}${misfits.length > 5 ? ' …' : ''} hold a value under "${field.key}" that does not fit the toolkit's ${kindName(field)} attribute "${field.label}". Change or clear those values first.`,
          );
        }
        continue;
      }
      if (mine.kind !== field.kind) {
        problems.push(`Your ${what(collection)} attribute "${mine.label}" (${mine.key}) is ${kindName(mine)}, but the toolkit's "${field.label}" with the same key is ${kindName(field)}. Rename your attribute (Attributes › edit › Advanced › key) or change its type, then add the toolkit again.`);
      } else if (field.kind === 'enum') {
        const missing = (field.values ?? []).filter((v) => !(mine.values ?? []).includes(v));
        if (missing.length > 0) problems.push(`Your ${what(collection)} attribute "${mine.label}" (${mine.key}) lacks the options ${missing.map((v) => `"${v}"`).join(', ')} that the toolkit's attribute with the same key uses. Add them, then add the toolkit again.`);
      }
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  const merged = mergeBaseline(current, baseline);
  const record = JSON.parse(serializeAttributeRecord(makeAttributeRecord(toolkit.id, merged.schema, toolkit.attributeBaseline.signature))) as unknown;
  const own = toolkit.functions.filter((f) => f.status.ok && !isProjectFunction(f));
  const used = new Set(designs.flatMap((d) => d.nodes.map((n) => n.function)));
  const shared = own.filter((f) => used.has(f.id)).map((f) => f.definition.label);
  const clashes = projectFunctions.filter((p) => own.some((f) => f.id === p.id)).map((p) => p.label);
  const changes = [
    `The toolkit “${name}” adds ${own.length} Function${own.length === 1 ? '' : 's'}, its analyses and transforms, and its example designs (Open toolkit design…).`,
    added.length > 0 ? `New attributes: ${added.map((f) => f.label).join(', ')}.` : 'No new attributes; yours stay as they are.',
    ...(shared.length > 0 ? [`Rooms that already use ${shared.join(', ')} now use the toolkit's Function of that name (its colour and defaults; values you set stay).`] : []),
    ...(clashes.length > 0 ? [`Your own Function${clashes.length === 1 ? '' : 's'} ${clashes.join(', ')} ha${clashes.length === 1 ? 's' : 've'} the same id as the toolkit's: you will be asked which to keep.`] : []),
    'Every room, edge and value stays unchanged. A toolkit cannot be removed again; export the project first if you want to keep this version.',
  ];
  return { ok: true, attributes: record, changes };
}
