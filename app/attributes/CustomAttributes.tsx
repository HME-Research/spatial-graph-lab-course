import { useId, type ReactNode } from 'react';
import type { AttributeValue } from '@app/document';
import {
  attributesOutsideSchema,
  describeField,
  resolveEdgeAttributes,
  resolveNodeAttributes,
  type AttributeCollection,
  type EffectiveAttribute,
  type ProjectAttributeSchema,
} from '@app/extensions';
import type { DesignCommand } from '@app/spatial';
import { CommitInput } from '@app/inspector/fields';
import { setEdgeFieldCommand, setNodeFieldCommand } from '@app/inspector/fieldCommands';
import {
  decodeChoice,
  encodeChoice,
  EXPLICIT_NONE,
  formatFieldValue,
  inheritedText,
  INHERIT,
  parseValueDraft,
  sourceText,
} from './attributesModel';
import { HelpTip } from '@app/ui/help';
import './attributes.css';

type Stored = { readonly [key: string]: AttributeValue };

/** Link from Properties to the project's attribute manager (Attributes destination, Node or Edge tab). */
export function ManageAttributesLink({ onManage }: { readonly onManage: () => void }) {
  return (
    <button type="button" className="sgl-link sgl-manage-link" onClick={onManage} title="Add, rename or delete this project's attributes">
      Manage attributes
    </button>
  );
}

/**
 * Properties section for the custom attributes of ONE node or edge (docs/PROJECT-ATTRIBUTES.md).
 *
 * Every field of the project is listed (the same list for every node / every edge), with its
 * EFFECTIVE value and where it comes from: set here, the node type's default, the field default
 * or no value. Each change is one design command (one undo step):
 * - choosing or typing a value sets it for this item only;
 * - "Use default" removes the item's own value so the type/field default applies again;
 * - "No value" stores an explicit empty value that overrides any default.
 * Values stored under a field's former name and values outside the schema are kept unchanged.
 */
export function CustomAttributes({
  collection,
  item,
  schema,
  run,
  onError,
  onManage,
  showHeader = true,
  before,
  after,
}: {
  readonly collection: AttributeCollection;
  readonly item: { readonly id: number; readonly typeId?: string; readonly attributes: Stored };
  readonly schema: ProjectAttributeSchema;
  /** Sends one design command; false when refused (the host shows why). */
  readonly run: (command: DesignCommand) => boolean;
  readonly onError: (message: string) => void;
  /** Opens the Attributes manager (shown as a link). */
  readonly onManage?: () => void;
  /** Own heading and Manage link (default). Off when the host's section header shows them (Properties). */
  readonly showHeader?: boolean;
  /** Rows listed before the custom ones (Properties: the required attributes, Function and Level). */
  readonly before?: ReactNode;
  /** Rows listed after the custom ones (Properties: the calculated attributes). */
  readonly after?: ReactNode;
}) {
  const resolved =
    collection === 'nodes' ? resolveNodeAttributes(schema, { typeId: item.typeId ?? '', attributes: item.attributes }) : resolveEdgeAttributes(schema, item);
  const outside = attributesOutsideSchema(schema, collection, item.attributes);
  const send = (r: EffectiveAttribute, value: AttributeValue | undefined): boolean => {
    const result = collection === 'nodes' ? setNodeFieldCommand(item, r.field, value) : setEdgeFieldCommand(item, r.field, value);
    if (!result.ok) {
      onError(result.message);
      return false;
    }
    return run(result.command);
  };
  const what = collection === 'nodes' ? 'room' : 'relationship';

  return (
    <section className="sgl-section sgl-custom-attributes" aria-label={before !== undefined ? 'Attributes' : 'Custom attributes'}>
      {showHeader && (
        <div className="sgl-help-row">
          <h4>Custom attributes</h4>
          <HelpTip topicId="project-attributes" />
          {onManage && <ManageAttributesLink onManage={onManage} />}
        </div>
      )}
      {before}
      {resolved.length === 0 && before === undefined ? (
        <p className="meta">
          The project has no custom {collection === 'nodes' ? 'node' : 'edge'} attributes yet.{onManage ? ' Use “Manage attributes” to add one.' : ''}
        </p>
      ) : null}
      {resolved.map((r) => (
        <FieldValue key={`${r.field.id}:${JSON.stringify(r.storedValue)}:${r.storedKey ?? ''}`} r={r} typeId={item.typeId} send={(v) => send(r, v)} onError={onError} />
      ))}
      {after}
      {Object.keys(outside).length > 0 && (
        <details className="sgl-outside">
          <summary>Not in the project attributes ({Object.keys(outside).length})</summary>
          <p className="sgl-help">Stored on this {what} but not a project attribute (e.g. a deleted attribute). Kept exactly as stored.</p>
          <ul className="sgl-list">
            {Object.entries(outside).map(([k, v]) => (
              <li key={k}>
                <code>{k}</code>: {formatFieldValue(v)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function FieldValue({
  r,
  typeId,
  send,
  onError,
}: {
  readonly r: EffectiveAttribute;
  readonly typeId: string | undefined;
  readonly send: (value: AttributeValue | undefined) => boolean;
  readonly onError: (message: string) => void;
}) {
  const { field } = r;
  const id = useId();
  const source = sourceText(r, typeId);
  const own = r.source === 'instance';
  const inherit = inheritedText(r, typeId);
  const label = `${field.label} (${field.key})`;

  let control;
  if (field.kind === 'enum' || field.kind === 'boolean') {
    const choices: [string, string][] =
      field.kind === 'enum' ? (field.values ?? []).map((v) => [encodeChoice(v), v]) : [[encodeChoice(true), 'yes'], [encodeChoice(false), 'no']];
    const current = r.stored === 'ok' ? encodeChoice(r.storedValue as string | boolean) : r.stored === 'null' ? EXPLICIT_NONE : INHERIT;
    control = (
      <select
        id={id}
        aria-describedby={`${id}-src`}
        value={current}
        onChange={(e) => {
          const next = e.currentTarget.value;
          if (next !== current) send(decodeChoice(next));
        }}
      >
        <option value={INHERIT}>Use default ({inherit})</option>
        {choices.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
        <option value={EXPLICIT_NONE}>No value</option>
      </select>
    );
  } else {
    const stored = r.stored === 'ok' ? String(r.storedValue) : '';
    control = (
      <CommitInput
        label={label}
        type={field.kind === 'number' ? 'number' : 'text'}
        stored={stored}
        placeholder={r.stored === 'null' ? 'no value (set)' : r.inherited !== undefined ? `${String(r.inherited)} (default)` : 'no value'}
        onCommit={(draft) => {
          const parsed = parseValueDraft(field, draft);
          if (!parsed.ok) {
            onError(parsed.message);
            return false;
          }
          return send(parsed.value);
        }}
      />
    );
  }

  return (
    <div className={`sgl-field sgl-field-${source.tone}`} data-attribute={field.id} data-attribute-kind="custom">
      <label
        className="sgl-field-label"
        htmlFor={field.kind === 'enum' || field.kind === 'boolean' ? id : undefined}
        title={field.description ? `${field.description}
Identifier: ${field.key}` : `Identifier: ${field.key}`}
      >
        {field.label}
      </label>
      <div className="sgl-field-control">{control}</div>
      <div className="sgl-field-meta">
        <span id={`${id}-src`} className={`sgl-field-src sgl-field-src-${source.tone}`} title={`Effective value: ${formatFieldValue(r.value)}`}>
          {source.chip}
        </span>
        {own && (
          <button type="button" className="sgl-link" onClick={() => send(undefined)} title={`Remove this value; ${inherit} applies again`}>
            Use default
          </button>
        )}
        {(field.kind === 'text' || field.kind === 'number') && r.stored !== 'null' && (
          <button type="button" className="sgl-link" onClick={() => send(null)} title="Store an explicit empty value that overrides any default">
            No value
          </button>
        )}
      </div>
      {r.stored === 'invalid' && (
        <p className="sgl-warning">
          ⚠ Stored value {JSON.stringify(r.storedValue)} is not {describeField(field)}. It is kept until you change it; meanwhile the {inherit} is used.
        </p>
      )}
      {r.storedKey !== undefined && r.storedKey !== field.key && (
        <p className="sgl-help">
          Stored under an earlier identifier of this attribute; editing saves it under the current one.
        </p>
      )}
    </div>
  );
}
