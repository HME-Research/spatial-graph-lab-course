import { useContext, useMemo, type ReactNode } from 'react';
import { designCorridorLook, formatCorridorWidth, nodeLabel, parseCorridorWidth, type AttributeValue, type CorridorLook, type RelationshipKind } from '@app/document';
import { AttributeSection } from '@app/attributes/AttributeSection';
import { sourceResolver } from '@app/attributes/attributeSources';
import { decodeChoice, encodeChoice, EXPLICIT_NONE, INHERIT, parseValueDraft } from '@app/attributes/attributesModel';
import { ManageAttributesLink } from '@app/attributes/CustomAttributes';
import { ManageFunctionsContext, OpenAttributesContext } from '@app/attributes/navigation';
import { customAttributeTag } from '@app/attributes/sections';
import type { AttributeCollection, AttributeField, EffectiveAttribute } from '@app/extensions';
import type { CorridorPatch, DesignCommand } from '@app/spatial';
import { CORRIDOR_ROOF_CHOICES, CORRIDOR_WALL_CHOICES, IssueFeedback, labelOfChoice, RELATIONSHIP_KIND_CHOICES, UNDO_HINT, type Choice } from '@app/ui';
import { SourceTag } from '@app/ui/SourceTag';
import { useFunctionName } from '@app/views/functionColour';
import { NO_SELECTION, selectEdge, selectNode } from '@core/viewer/selection';
import { FieldRow } from './CalculatedValues';
import { CommitInput } from './fields';
import { multiFieldCommand, resolveMulti, sharedValue, storedStateOf, storedStateText, type MultiItem, type Shared, type StoredState } from './multiModel';
import { messageContextFor, useCommands, type PanelProps } from './panelSupport';
import { relationshipLabelIn, typeMenu } from './propertiesModel';

/** `<select>` value of the disabled "Mixed (…)" placeholder. */
const MIXED = '\u0000mixed';
const mixedText = (values: readonly string[]) => `Mixed (${values.join(', ')})`;

/** Sends one command; `null` (nothing would change) only clears earlier messages. */
type Send = (command: DesignCommand | null) => boolean;

/**
 * Properties of several selected nodes and/or edges (2026-11-23: box selection / Ctrl-click in
 * Graph 2D). Every attribute that Properties edits for ONE node or edge is offered, except Position
 * and Size (several rooms cannot take one place): nodes → Function and the custom attributes
 * (project and toolkit); edges → Relationship, Corridor (walls, roof, width) and the custom
 * attributes. A control shows the value all selected items share, or "Mixed (…)"; a change gives
 * every selected item that value as ONE command (one Undo step). Then Delete.
 */
export function MultiProperties(props: PanelProps & { readonly nodeIds: readonly number[]; readonly edgeIds: readonly number[] }) {
  const { design, project, onSelect, nodeIds, edgeIds } = props;
  const { issues, clearIssues, showIssues, runV2 } = useCommands(props);
  const openAttributes = useContext(OpenAttributesContext);
  const manageFunctions = useContext(ManageFunctionsContext);
  const functionName = useFunctionName();
  const nodes = useMemo(() => design.doc.nodes.filter((n) => nodeIds.includes(n.id)), [design, nodeIds]);
  const edges = useMemo(() => design.doc.edges.filter((e) => edgeIds.includes(e.id)), [design, edgeIds]);
  const typesInDesign = useMemo(() => design.doc.nodes.map((n) => n.function), [design]);
  const edgeLabel = relationshipLabelIn(design.doc);
  const active = project?.project ?? null;
  const schema = project?.attributes;
  const onError = (message: string) => showIssues([{ path: ['custom'], code: 'schema', message }]);
  const send: Send = (command) => {
    if (command !== null) return runV2(command);
    clearIssues();
    return true;
  };

  const functions = sharedValue(nodes.map((n) => n.function), functionName);
  const menu = typeMenu(active, typesInDesign, functions.kind === 'same' ? functions.value : (nodes[0]?.function ?? 'room'));

  // Edges of the selected nodes that are deleted with them, beyond the selected edges.
  const alsoRemoved = design.doc.edges.filter((e) => !edgeIds.includes(e.id) && (nodeIds.includes(e.source) || nodeIds.includes(e.target))).length;
  const nodeCount = nodeIds.length;
  const edgeCount = edgeIds.length;
  const nodesText = `${nodeCount} node${nodeCount === 1 ? '' : 's'}`;
  const edgesText = `${edgeCount} edge${edgeCount === 1 ? '' : 's'}`;
  const count = [nodeCount ? nodesText : '', edgeCount ? edgesText : ''].filter(Boolean).join(' and ');
  const manageLink = (collection: AttributeCollection) =>
    project && openAttributes ? { actions: <ManageAttributesLink onManage={() => openAttributes(collection)} /> } : {};

  return (
    <div className="sgl-panel sgl-multi">
      <section className="sgl-section">
        <h4>{count} selected</h4>
        <p className="sgl-help">
          A change applies to every selected {nodeCount && edgeCount ? 'node or edge' : nodeCount ? 'node' : 'edge'} as one undo step. Position and Size
          are edited one node at a time. Ctrl/⌘-click adds or removes an item; Esc clears the selection.
        </p>
        {nodeCount > 0 && (
          <ItemLinks title="Nodes">
            {nodes.map((n) => (
              <button key={n.id} type="button" className="sgl-link" onClick={() => onSelect(selectNode(n.id))} title="Select only this node">
                {nodeLabel(n)}
              </button>
            ))}
          </ItemLinks>
        )}
        {edgeCount > 0 && (
          <ItemLinks title="Edges">
            {edgeIds.map((id) => (
              <button key={id} type="button" className="sgl-link" onClick={() => onSelect(selectEdge(id))} title="Select only this edge">
                {edgeLabel(id)}
              </button>
            ))}
          </ItemLinks>
        )}
      </section>

      <IssueFeedback issues={issues} context={messageContextFor(props)} onDismiss={clearIssues} />

      {nodeCount > 0 && (
        <div className="sgl-attr-sections" data-section="nodes">
          {edgeCount > 0 && <h4 className="sgl-multi-heading">{nodesText}</h4>}
          <AttributeSection section="required" {...(!(schema && schema.nodes.length > 0) && manageLink('nodes'))}>
            <FieldRow
              attributeId="function"
              kind="required"
              label="Function"
              title="What the rooms are used for. A change gives every selected node this Function."
              control={
                <select
                  key={functions.kind === 'same' ? functions.value : MIXED}
                  aria-label="Function of the selected nodes"
                  value={functions.kind === 'same' ? functions.value : MIXED}
                  onChange={(e) => {
                    const functionId = e.currentTarget.value;
                    if (functionId === MIXED || (functions.kind === 'same' && functionId === functions.value)) return;
                    send({ type: 'set-nodes-type', nodeIds, function: functionId });
                  }}
                  title={`Gives every selected node this Function. ${UNDO_HINT}`}
                >
                  {functions.kind === 'mixed' && (
                    <option value={MIXED} disabled>
                      {mixedText(functions.values)}
                    </option>
                  )}
                  {menu.options.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.disabled}>
                      {o.label}
                    </option>
                  ))}
                </select>
              }
              meta={
                manageFunctions && (
                  <button type="button" className="sgl-link" onClick={manageFunctions} title="Add or remove the functions this project offers">
                    Edit functions
                  </button>
                )
              }
            />
          </AttributeSection>
          {schema && schema.nodes.length > 0 && (
            <AttributeSection section="custom" {...manageLink('nodes')}>
              <MultiCustomFields
                collection="nodes"
                items={nodes}
                resolved={resolveMulti(schema, 'nodes', nodes)}
                send={send}
                onError={onError}
                tagOf={(f) => customAttributeTag(sourceResolver('nodes', active)(f))}
              />
            </AttributeSection>
          )}
        </div>
      )}

      {edgeCount > 0 && (
        <div className="sgl-attr-sections" data-section="edges">
          {nodeCount > 0 && <h4 className="sgl-multi-heading">{edgesText}</h4>}
          <AttributeSection section="required">
            <RelationshipRow edges={edges} onChange={(relationship) => send({ type: 'set-edges-kind', edgeIds, relationship })} />
          </AttributeSection>
          <AttributeSection section="geometry" {...(!(schema && schema.edges.length > 0) && manageLink('edges'))}>
            <CorridorRow
              edges={edges}
              designLook={designCorridorLook(design.doc.settings)}
              onPatch={(patch) => send({ type: 'set-edges-corridor', edgeIds, patch })}
              onInvalid={(message) => showIssues([{ path: ['corridor', 'width'], code: 'schema', message }])}
            />
          </AttributeSection>
          {schema && schema.edges.length > 0 && (
            <AttributeSection section="custom" {...manageLink('edges')}>
              <MultiCustomFields
                collection="edges"
                items={edges}
                resolved={resolveMulti(schema, 'edges', edges)}
                send={send}
                onError={onError}
                tagOf={(f) => customAttributeTag(sourceResolver('edges', active)(f))}
              />
            </AttributeSection>
          )}
        </div>
      )}

      <section className="sgl-section sgl-panel-actions">
        <button
          type="button"
          className="sgl-danger"
          onClick={() => {
            if (runV2({ type: 'remove-items', nodeIds, edgeIds })) onSelect(NO_SELECTION);
          }}
          title={`Deletes everything selected${alsoRemoved ? `, and the ${alsoRemoved} other edge(s) of the selected nodes` : ''}. ${UNDO_HINT}`}
        >
          Delete {count}
        </button>
      </section>
    </div>
  );
}

function ItemLinks({ title, children }: { readonly title: string; readonly children: readonly ReactNode[] }) {
  return (
    <p className="sgl-help">
      {title}:{' '}
      {children.map((child, i) => (
        <span key={i}>
          {i > 0 && ', '}
          {child}
        </span>
      ))}
    </p>
  );
}

/** Relationship (Access / Open) of several edges; neither option is marked while they differ. */
function RelationshipRow({ edges, onChange }: { readonly edges: readonly { readonly relationship: RelationshipKind }[]; readonly onChange: (kind: RelationshipKind) => void }) {
  const shared = sharedValue(edges.map((e) => e.relationship), (k) => labelOfChoice(RELATIONSHIP_KIND_CHOICES, k));
  const current = shared.kind === 'same' ? shared.value : null;
  return (
    <FieldRow
      attributeId="relationship"
      kind="required"
      label="Relationship"
      title="Access or Open. A change gives every selected edge this Relationship."
      control={
        <div className="sgl-segmented" role="radiogroup" aria-label="Relationship of the selected edges">
          {RELATIONSHIP_KIND_CHOICES.map((c) => (
            <label key={c.value} className={current === c.value ? 'checked' : undefined} title={c.description}>
              <input type="radio" name="multi-relationship" value={c.value} checked={current === c.value} onChange={() => current !== c.value && onChange(c.value)} />
              {c.label}
            </label>
          ))}
        </div>
      }
      {...(shared.kind === 'mixed' && { meta: <span className="sgl-field-src sgl-field-src-none">{mixedText(shared.values)}</span> })}
    />
  );
}

/** The selected edges' own corridor walls, roof and width (empty = Design default). */
function CorridorRow({
  edges,
  designLook,
  onPatch,
  onInvalid,
}: {
  readonly edges: readonly { readonly corridor?: CorridorLook | undefined }[];
  readonly designLook: ReturnType<typeof designCorridorLook>;
  readonly onPatch: (patch: CorridorPatch) => boolean;
  readonly onInvalid: (message: string) => void;
}) {
  const field = (name: 'walls' | 'roof', title: string, choices: readonly Choice<string>[]) => {
    const shared = sharedValue(edges.map((e) => e.corridor?.[name] ?? ''), (v) => (v === '' ? 'Design default' : labelOfChoice(choices, v)));
    const value = shared.kind === 'same' ? shared.value : MIXED;
    return (
      <div className="sgl-corridor-field">
        <label htmlFor={`sgl-multi-corridor-${name}`}>{title}</label>
        <select
          id={`sgl-multi-corridor-${name}`}
          key={value}
          value={value}
          aria-label={`Corridor ${name} of the selected edges`}
          onChange={(e) => {
            const next = e.currentTarget.value;
            if (next === MIXED || next === value) return;
            onPatch(name === 'walls' ? { walls: (next || null) as NonNullable<CorridorPatch['walls']> | null } : { roof: (next || null) as NonNullable<CorridorPatch['roof']> | null });
          }}
        >
          {shared.kind === 'mixed' && (
            <option value={MIXED} disabled>
              {mixedText(shared.values)}
            </option>
          )}
          <option value="">Design default ({labelOfChoice(choices, designLook[name])})</option>
          {choices.map((c) => (
            <option key={c.value} value={c.value} title={c.description}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    );
  };
  const widths = sharedValue(edges.map((e) => e.corridor?.width ?? null), (w) => (w === null ? 'Design default' : formatCorridorWidth(w)));
  return (
    <FieldRow
      attributeId="corridor"
      kind="geometry"
      label="Corridor"
      title="The selected edges’ own corridor look: walls, roof and width. Used only when a corridor is generated; Design default follows the Corridors card (Building Designer → Corridors)."
      control={
        <div className="sgl-corridor">
          {field('walls', 'Walls', CORRIDOR_WALL_CHOICES)}
          {field('roof', 'Roof', CORRIDOR_ROOF_CHOICES)}
          <div className="sgl-corridor-field">
            <label>Width (m)</label>
            <span className="sgl-corridor-width">
              <CommitInput
                key={JSON.stringify(widths)}
                label="Corridor width of the selected edges"
                type="number"
                stored={widths.kind === 'same' && widths.value !== null ? String(widths.value) : ''}
                placeholder={widths.kind === 'mixed' ? mixedText(widths.values) : `Design default (${formatCorridorWidth(designLook.width)})`}
                onCommit={(draft) => {
                  const parsed = parseCorridorWidth(draft);
                  if (!parsed.ok) {
                    onInvalid(parsed.message);
                    return false;
                  }
                  return onPatch({ width: parsed.width });
                }}
              />
              {!(widths.kind === 'same' && widths.value === null) && (
                <button type="button" className="sgl-link" title="Use the design default width for every selected edge" aria-label="Use the design default width" onClick={() => onPatch({ width: null })}>
                  ↺
                </button>
              )}
            </span>
          </div>
        </div>
      }
    />
  );
}

/** Every project custom attribute of the collection (toolkit and own), for several items at once. */
function MultiCustomFields({
  collection,
  items,
  resolved,
  send,
  onError,
  tagOf,
}: {
  readonly collection: AttributeCollection;
  readonly items: readonly MultiItem[];
  readonly resolved: ReadonlyMap<string, readonly EffectiveAttribute[]>;
  readonly send: Send;
  readonly onError: (message: string) => void;
  readonly tagOf: (field: AttributeField) => string;
}) {
  return (
    <section className="sgl-section sgl-custom-attributes" aria-label="Custom attributes">
      {[...resolved.values()].map((rs) => {
        const field = rs[0]!.field;
        const state = sharedValue(rs.map(storedStateOf), storedStateText);
        const apply = (value: AttributeValue | undefined): boolean => {
          const result = multiFieldCommand(collection, items, field, value);
          if (!result.ok) {
            onError(result.message);
            return false;
          }
          return send(result.command);
        };
        return (
          <MultiFieldValue
            key={`${collection}:${field.id}:${JSON.stringify(state)}`}
            idPrefix={`sgl-multi-${collection}`}
            field={field}
            rs={rs}
            state={state}
            apply={apply}
            onError={onError}
            tag={tagOf(field)}
          />
        );
      })}
    </section>
  );
}

function MultiFieldValue({
  idPrefix,
  field,
  rs,
  state,
  apply,
  onError,
  tag,
}: {
  readonly idPrefix: string;
  readonly field: AttributeField;
  readonly rs: readonly EffectiveAttribute[];
  readonly state: Shared<StoredState>;
  readonly apply: (value: AttributeValue | undefined) => boolean;
  readonly onError: (message: string) => void;
  readonly tag: string;
}) {
  const id = `${idPrefix}-${field.id}`;
  const same = state.kind === 'same' ? state.value : null;
  const anyOwn = rs.some((r) => r.source === 'instance' || r.stored === 'invalid');
  const chip =
    state.kind === 'mixed'
      ? 'differs'
      : same?.kind === 'inherit'
        ? 'default'
        : same?.kind === 'none'
          ? 'set to no value'
          : same?.kind === 'invalid'
            ? 'invalid stored values'
            : 'set on all';

  let control;
  if (field.kind === 'enum' || field.kind === 'boolean') {
    const choices: [string, string][] =
      field.kind === 'enum' ? (field.values ?? []).map((v) => [encodeChoice(v), v]) : [[encodeChoice(true), 'yes'], [encodeChoice(false), 'no']];
    const current =
      same === null || same.kind === 'invalid' ? MIXED : same.kind === 'value' ? encodeChoice(same.value as string | boolean) : same.kind === 'none' ? EXPLICIT_NONE : INHERIT;
    control = (
      <select
        id={id}
        value={current}
        onChange={(e) => {
          const next = e.currentTarget.value;
          if (next !== current && next !== MIXED) apply(decodeChoice(next));
        }}
      >
        {current === MIXED && (
          <option value={MIXED} disabled>
            {state.kind === 'mixed' ? mixedText(state.values) : 'invalid stored values'}
          </option>
        )}
        <option value={INHERIT}>Use default</option>
        {choices.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
        <option value={EXPLICIT_NONE}>No value</option>
      </select>
    );
  } else {
    control = (
      <CommitInput
        label={`${field.label} (${field.key}) of the selected items`}
        type={field.kind === 'number' ? 'number' : 'text'}
        stored={same?.kind === 'value' ? String(same.value) : ''}
        placeholder={state.kind === 'mixed' ? mixedText(state.values) : same?.kind === 'none' ? 'no value (set)' : 'default'}
        onCommit={(draft) => {
          const parsed = parseValueDraft(field, draft);
          if (!parsed.ok) {
            onError(parsed.message);
            return false;
          }
          return apply(parsed.value);
        }}
      />
    );
  }

  return (
    <div className="sgl-field" data-attribute={field.id} data-attribute-kind="custom">
      <label
        className="sgl-field-label"
        htmlFor={field.kind === 'enum' || field.kind === 'boolean' ? id : undefined}
        title={field.description ? `${field.description}\nIdentifier: ${field.key}` : `Identifier: ${field.key}`}
      >
        {field.label}
      </label>
      <div className="sgl-field-control">{control}</div>
      <div className="sgl-field-meta">
        <SourceTag text={tag} />
        <span className="sgl-field-src sgl-field-src-none" title={state.kind === 'mixed' ? mixedText(state.values) : undefined}>
          {chip}
        </span>
        {anyOwn && (
          <button type="button" className="sgl-link" onClick={() => apply(undefined)} title="Remove the selected items’ own values; each one’s default applies again">
            Use default
          </button>
        )}
        {(field.kind === 'text' || field.kind === 'number') && same?.kind !== 'none' && (
          <button type="button" className="sgl-link" onClick={() => apply(null)} title="Store an explicit empty value on every selected item, overriding any default">
            No value
          </button>
        )}
      </div>
    </div>
  );
}
