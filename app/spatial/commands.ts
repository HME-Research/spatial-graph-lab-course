import { removeNode as graphRemoveNode } from '@core/graph';
import type { GridCoord } from '@core/spatial';
import {
  type Attributes,
  bandIndex,
  settleDiagramPositions,
  canonicalFacadeModule,
  type CorridorLook,
  DEFAULT_RELATIONSHIP_KIND,
  type DesignDocumentV2,
  type DiagramPosition,
  type FacadeModule,
  fail,
  footprintCells,
  relationshipLabel,
  hasBands,
  issue,
  type Look,
  type RelationshipKind,
  type Result,
  type RoofStyle,
  type RoomSize,
  SPATIAL_GRAPH_POLICY,
  type StyleBy,
  type StyleGroupRef,
  type StyleMode,
  type StyleSetup,
  type StyleValue,
  styleValueKey,
  usesBands,
  validateDocumentV2,
  type ValidationOptionsV2,
  type WallStyle,
  type WindowLayout,
} from '@app/document';
import { commitSpatialEdit, proposeSpatialEdit, type SpatialEditOptions } from './edit';
import { resolveRelationships } from './resolve';

/**
 * Schema-v2 document commands — FROZEN Gate 0 command shapes. Every command is pure, returns a
 * new VALIDATED document or readable issues, and never mutates its input. One successful command
 * that changes the content = one history step (the app's existing history records it).
 * Implementation owner: 02-spatial-engine (shapes are frozen; bodies may improve).
 */

/**
 * A new room. It gets no id from the caller: `add-node` gives it `doc.nextNodeId` and advances the
 * counter (P4), so the new room's id is the document's `nextNodeId` before the command.
 */
export interface NewRoom {
  readonly position: GridCoord;
  /** Omitted: [1, 1, 1]. */
  readonly size?: RoomSize;
  readonly function: string;
  readonly custom?: Attributes;
}

/** A new relationship; like `NewRoom` it gets `doc.nextEdgeId` as its id. */
export interface NewRelationship {
  readonly source: number;
  readonly target: number;
  /** Omitted: `access`. The rooms need NOT touch (unresolved is valid). */
  readonly relationship?: RelationshipKind;
  /** Its own corridor walls / roof (absent fields use the design's Corridors card). */
  readonly corridor?: CorridorLook;
  readonly custom?: Attributes;
}

/** Look patch for one card: a value sets the field, `null` removes it (inherit again). */
export interface LookPatch {
  readonly windowFraction?: number | null;
  readonly windowLayout?: WindowLayout | null;
  readonly walls?: WallStyle | null;
  readonly roof?: RoofStyle | null;
  /** Imported façade: a module, `'none'` (no module even when Default has one), or `null` (inherit again). */
  readonly facade?: FacadeModule | 'none' | null;
}

/** Change of a corridor look (the Corridors card or one relationship's own): a value sets the field, `null` clears it (inherit again), absent keeps it. */
export interface CorridorPatch {
  readonly walls?: WallStyle | null;
  readonly roof?: RoofStyle | null;
  /** Built width in metres (0 < width ≤ one cell; checked when the document is validated). */
  readonly width?: number | null;
}

/** `current` with `patch` applied, or undefined when no field is left (fixed key order `walls`, `roof`, `width`). */
export function patchCorridor(current: CorridorLook | undefined, patch: CorridorPatch): CorridorLook | undefined {
  const pick = <K extends keyof CorridorPatch>(key: K) => (patch[key] === undefined ? current?.[key] : (patch[key] ?? undefined));
  const walls = pick('walls');
  const roof = pick('roof');
  const width = pick('width');
  if (walls === undefined && roof === undefined && width === undefined) return undefined;
  return { ...(walls === undefined ? {} : { walls }), ...(roof === undefined ? {} : { roof }), ...(width === undefined ? {} : { width }) };
}

export type DesignCommand =
  /**
   * A new room taking connector cells needs `confirmRouteDisplacement`, like a move (phase 07, A11).
   * `duplicateOf` (2026-11-20, additive): the room this one copies; it only names the Undo step
   * ("Duplicate room 3 as room 6") and changes nothing else (`duplicateRoomRequest`).
   */
  | {
      readonly type: 'add-node';
      readonly node: NewRoom;
      readonly diagramPosition?: DiagramPosition;
      readonly confirmRouteDisplacement?: boolean;
      readonly duplicateOf?: number;
    }
  | { readonly type: 'remove-node'; readonly nodeId: number }
  /** Move and/or resize (min-corner anchored). Taking connector cells needs `confirmRouteDisplacement`. */
  | {
      readonly type: 'set-node-geometry';
      readonly nodeId: number;
      readonly position?: GridCoord;
      readonly size?: RoomSize;
      readonly confirmRouteDisplacement?: boolean;
    }
  | { readonly type: 'set-node-type'; readonly nodeId: number; readonly function: string }
  | { readonly type: 'set-node-custom'; readonly nodeId: number; readonly custom: Attributes }
  /** `null` removes the display id (the label falls back to the permanent id). */
  /**
   * Places one node in the diagram. Nodes without a stored position are stored where they are
   * currently shown (`settleDiagramPositions`), so only this node moves (2026-11-23).
   */
  | { readonly type: 'set-diagram-position'; readonly nodeId: number; readonly position: DiagramPosition }
  | { readonly type: 'add-edge'; readonly edge: NewRelationship }
  | { readonly type: 'remove-edge'; readonly edgeId: number }
  /**
   * Remove several UNRESOLVED relationships in one step ("Remove N invalid connections", Gate F).
   * Refused, with no change, when the list is empty, repeats an id, names an unknown edge, or names
   * an edge that is not `unresolved` under `options.resolve ?? resolveRelationships`. Never automatic.
   */
  | { readonly type: 'remove-edges'; readonly edgeIds: readonly number[] }
  | { readonly type: 'change-edge-kind'; readonly edgeId: number; readonly relationship: RelationshipKind }
  /** Replaces the edge's stored custom attributes (additive after Gate 0; see docs/PROJECT-ATTRIBUTES.md). */
  | { readonly type: 'set-edge-custom'; readonly edgeId: number; readonly custom: Attributes }
  /**
   * One relationship's own corridor walls / roof (Properties). Only the fields given change; `null`
   * clears a field (the design's Corridors card applies). An empty result removes `corridor`.
   */
  | { readonly type: 'set-edge-corridor'; readonly edgeId: number; readonly patch: CorridorPatch }
  /**
   * The Corridors look card (Building Designer, 2026-11-19): walls and roof of every corridor. Only
   * the fields given change; `null` clears a field (built-in default). An empty result removes `corridors`.
   */
  | { readonly type: 'set-corridors'; readonly patch: CorridorPatch }
  /**
   * Style rooms by another attribute; every attribute's setup stays remembered. `dividers`: starting
   * number bands, stored only when that attribute has no bands yet (same undo step).
   */
  | { readonly type: 'set-style-by'; readonly by: StyleBy; readonly dividers?: readonly number[] }
  /**
   * A number's value cards or bands (both remembered). Switching to bands without stored bands
   * needs starting `dividers` (default: none, one band for every value).
   */
  | { readonly type: 'set-style-mode'; readonly by: StyleBy; readonly mode: StyleMode; readonly dividers?: readonly number[] }
  /**
   * Change one card of `by`'s setup. A value card is created when missing (and kept when its look
   * becomes empty); a band must exist; Default is removed when it becomes empty.
   */
  | { readonly type: 'set-look'; readonly by: StyleBy; readonly group: StyleGroupRef; readonly patch: LookPatch }
  /** Remove a value card: its rooms use Default again. */
  | { readonly type: 'remove-style-group'; readonly by: StyleBy; readonly value: StyleValue }
  /**
   * Number bands of `by`: strictly ascending dividers, or `null` to drop the bands. Moving dividers
   * keeps each band's look; adding one copies the look of the band it splits; removing one keeps
   * the lower band's look.
   */
  | { readonly type: 'set-band-dividers'; readonly by: StyleBy; readonly dividers: readonly number[] | null };

export type DesignCommandType = DesignCommand['type'];

export interface DesignCommandOptions extends SpatialEditOptions {
  readonly validation?: ValidationOptionsV2;
}

const notFound = (what: 'node' | 'edge', id: number): Result<DesignDocumentV2> =>
  fail([issue([what === 'node' ? 'nodes' : 'edges'], 'not-found', `${what} ${id} does not exist`)]);

function withoutKey<V>(record: Readonly<Record<string, V>>, key: string): Record<string, V> {
  const copy: Record<string, V> = {};
  for (const [k, v] of Object.entries(record)) if (k !== key) copy[k] = v;
  return copy;
}

const setupOf = (doc: DesignDocumentV2, by: StyleBy): StyleSetup =>
  Object.prototype.hasOwnProperty.call(doc.settings.styles, by) ? doc.settings.styles[by]! : {};

const isEmptyLook = (look: Look): boolean => Object.keys(look).length === 0;

/** Apply a patch to a look (`null` removes a field); façades are stored canonically. */
function patchLook(current: Look, patch: LookPatch): Look {
  const out: { windowFraction?: number; windowLayout?: WindowLayout; walls?: WallStyle; roof?: RoofStyle; facade?: FacadeModule | 'none' } = {};
  const pick = <K extends keyof LookPatch>(key: K) => (patch[key] === undefined ? current[key] : patch[key]);
  const wf = pick('windowFraction');
  if (wf !== null && wf !== undefined) out.windowFraction = wf;
  const layout = pick('windowLayout');
  if (layout !== null && layout !== undefined) out.windowLayout = layout;
  const walls = pick('walls');
  if (walls !== null && walls !== undefined) out.walls = walls;
  const roof = pick('roof');
  if (roof !== null && roof !== undefined) out.roof = roof;
  const facade = pick('facade');
  // The whole module, door / open bay variants included.
  if (facade !== null && facade !== undefined) out.facade = facade === 'none' ? 'none' : canonicalFacadeModule(facade);
  return out;
}

/** Apply one v2 command purely. */
export function applyDesignCommand(
  doc: DesignDocumentV2,
  command: DesignCommand,
  options: DesignCommandOptions = {},
): Result<DesignDocumentV2> {
  const validate = (next: DesignDocumentV2) => validateDocumentV2(next, options.validation);
  const hasNode = (id: number) => doc.nodes.some((n) => n.id === id);
  const hasEdge = (id: number) => doc.edges.some((e) => e.id === id);
  const mapNode = (id: number, f: (n: DesignDocumentV2['nodes'][number]) => DesignDocumentV2['nodes'][number]) =>
    hasNode(id) ? validate({ ...doc, nodes: doc.nodes.map((n) => (n.id === id ? f(n) : n)) }) : notFound('node', id);
  const mapEdge = (id: number, f: (e: DesignDocumentV2['edges'][number]) => DesignDocumentV2['edges'][number]) =>
    hasEdge(id) ? validate({ ...doc, edges: doc.edges.map((e) => (e.id === id ? f(e) : e)) }) : notFound('edge', id);
  /** Store `setup` for `by` (an empty setup is removed). */
  const withSetup = (by: StyleBy, setup: StyleSetup) => {
    const rest = withoutKey(doc.settings.styles, by);
    const styles = Object.keys(setup).length === 0 ? rest : { ...rest, [by]: setup };
    return validate({ ...doc, settings: { ...doc.settings, styles } });
  };

  switch (command.type) {
    case 'add-node': {
      const n = command.node;
      const id = doc.nextNodeId;
      const node = {
        id,
        function: n.function,
        position: [n.position[0], n.position[1], n.position[2]] as GridCoord,
        size: (n.size ? [n.size[0], n.size[1], n.size[2]] : [1, 1, 1]) as RoomSize,
        custom: { ...n.custom },
      };
      // Storing the new node's position first keeps every shown fallback position (nothing jumps).
      const diagram = command.diagramPosition
        ? { positions: { ...settleDiagramPositions(doc), [id]: [command.diagramPosition[0], command.diagramPosition[1]] as DiagramPosition } }
        : doc.diagram;
      const added = validate({ ...doc, nextNodeId: id + 1, nodes: [...doc.nodes, node], diagram });
      if (!added.ok) return added;
      // A new room never silently fills a generated connector: place it elsewhere and move it with
      // `set-node-geometry` + `confirmRouteDisplacement` ("Move anyway and recalculate").
      const occupancy = (options.resolve ?? resolveRelationships)(doc).occupancy;
      const displaced = new Set<number>();
      for (const cell of footprintCells(node)) {
        const o = occupancy.at(cell);
        if (o?.kind === 'route') displaced.add(o.edgeId);
      }
      if (displaced.size > 0 && !command.confirmRouteDisplacement) {
        return fail([
          issue(
            ['nodes'],
            'route-displacement',
            `room ${id} would take cells of the connector(s) of ${[...displaced].sort((a, b) => a - b).map((e) => relationshipLabel(doc, e)).join(', ')}; ` +
              'confirm to add it anyway and recalculate those connectors, or place it elsewhere',
          ),
        ]);
      }
      return added;
    }
    case 'remove-node': {
      const result = graphRemoveNode({ policy: SPATIAL_GRAPH_POLICY, nodes: doc.nodes, edges: doc.edges }, command.nodeId);
      if (!result.ok) return notFound('node', command.nodeId);
      return validate({
        ...doc,
        nodes: [...result.value.nodes],
        edges: [...result.value.edges],
        diagram: { positions: withoutKey(doc.diagram.positions, String(command.nodeId)) },
      });
    }
    case 'set-node-geometry': {
      const request = {
        nodeId: command.nodeId,
        ...(command.position ? { position: command.position } : {}),
        ...(command.size ? { size: command.size } : {}),
      };
      const proposal = proposeSpatialEdit(doc, request, options);
      return commitSpatialEdit(proposal, { confirmRouteDisplacement: command.confirmRouteDisplacement === true });
    }
    case 'set-node-type':
      return mapNode(command.nodeId, (n) => ({ ...n, function: command.function }));
    case 'set-node-custom':
      return mapNode(command.nodeId, (n) => ({ ...n, custom: { ...command.custom } }));
    case 'set-diagram-position':
      if (!hasNode(command.nodeId)) return notFound('node', command.nodeId);
      return validate({
        ...doc,
        // Every other node keeps the position it is shown at: fallback positions are stored too,
        // because the fallback layout would otherwise re-flow around the moved node.
        diagram: { positions: { ...settleDiagramPositions(doc), [command.nodeId]: [command.position[0], command.position[1]] } },
      });
    case 'add-edge': {
      const e = command.edge;
      const id = doc.nextEdgeId;
      const corridor = patchCorridor(e.corridor, {});
      const edge = {
        id,
        source: e.source,
        target: e.target,
        relationship: e.relationship ?? DEFAULT_RELATIONSHIP_KIND,
        ...(corridor ? { corridor } : {}),
        custom: { ...e.custom },
      };
      return validate({ ...doc, nextEdgeId: id + 1, edges: [...doc.edges, edge] });
    }
    case 'remove-edge':
      if (!hasEdge(command.edgeId)) return notFound('edge', command.edgeId);
      return validate({ ...doc, edges: doc.edges.filter((e) => e.id !== command.edgeId) });
    case 'remove-edges': {
      const ids = command.edgeIds;
      if (ids.length === 0) return fail([issue(['edges'], 'schema', 'no connections were chosen to remove')]);
      const listed = new Set<number>();
      for (const id of ids) {
        if (listed.has(id)) return fail([issue(['edges'], 'duplicate-edge-id', `connection ${relationshipLabel(doc, id)} is listed more than once`)]);
        listed.add(id);
        if (!hasEdge(id)) return notFound('edge', id);
      }
      const spatial = (options.resolve ?? resolveRelationships)(doc);
      const built = ids.filter((id) => spatial.byEdge.get(id)?.status !== 'unresolved');
      if (built.length > 0) {
        return fail([
          issue(
            ['edges'],
            'schema',
            `only unresolved connections can be removed together; ${built.map((id) => relationshipLabel(doc, id)).join(', ')} ` +
              `${built.length === 1 ? 'is' : 'are'} built`,
          ),
        ]);
      }
      return validate({ ...doc, edges: doc.edges.filter((e) => !listed.has(e.id)) });
    }
    case 'change-edge-kind':
      return mapEdge(command.edgeId, (e) => ({ ...e, relationship: command.relationship }));
    case 'set-edge-custom':
      return mapEdge(command.edgeId, (e) => ({ ...e, custom: { ...command.custom } }));
    case 'set-edge-corridor':
      return mapEdge(command.edgeId, (e) => {
        const { corridor: old, ...rest } = e;
        const corridor = patchCorridor(old, command.patch);
        return corridor ? { ...rest, corridor } : rest;
      });
    case 'set-corridors': {
      const { corridors: old, ...settings } = doc.settings;
      const corridors = patchCorridor(old, command.patch);
      return validate({ ...doc, settings: corridors ? { ...settings, corridors } : settings });
    }
    case 'set-style-by': {
      const setup = setupOf(doc, command.by);
      const settings = { ...doc.settings, styleBy: command.by };
      if (command.dividers === undefined || hasBands(setup)) return validate({ ...doc, settings });
      const banded: StyleSetup = { ...setup, dividers: [...command.dividers], bands: command.dividers.map(() => ({})).concat([{}]) };
      return validate({ ...doc, settings: { ...settings, styles: { ...doc.settings.styles, [command.by]: banded } } });
    }
    case 'set-style-mode': {
      const { mode: _m, ...setup } = setupOf(doc, command.by);
      if (command.mode === 'values') return withSetup(command.by, hasBands(setup) ? { ...setup, mode: 'values' } : setup);
      if (hasBands(setup)) return withSetup(command.by, setup);
      const dividers = [...(command.dividers ?? [])];
      return withSetup(command.by, { ...setup, dividers, bands: [{}, ...dividers.map(() => ({}))] });
    }
    case 'set-look': {
      const setup = setupOf(doc, command.by);
      const { group } = command;
      let next: StyleSetup;
      if (group.kind === 'default') {
        const look = patchLook(setup.default ?? {}, command.patch);
        const { default: _old, ...rest } = setup;
        next = isEmptyLook(look) ? rest : { ...rest, default: look };
      } else if (group.kind === 'value') {
        const key = styleValueKey(group.value);
        const groups = setup.groups ?? [];
        const at = groups.findIndex((g) => styleValueKey(g.value) === key);
        const look = patchLook(at >= 0 ? groups[at]!.look : {}, command.patch);
        next = { ...setup, groups: at >= 0 ? groups.map((g, i) => (i === at ? { value: g.value, look } : g)) : [...groups, { value: group.value, look }] };
      } else {
        if (!usesBands(setup) || group.index < 0 || group.index >= setup.bands!.length) {
          return fail([issue(['settings', 'styles', command.by, 'bands'], 'not-found', `band ${group.index + 1} does not exist`)]);
        }
        next = { ...setup, bands: setup.bands!.map((b, i) => (i === group.index ? patchLook(b, command.patch) : b)) };
      }
      return withSetup(command.by, next);
    }
    case 'remove-style-group': {
      const setup = setupOf(doc, command.by);
      const key = styleValueKey(command.value);
      const groups = (setup.groups ?? []).filter((g) => styleValueKey(g.value) !== key);
      if (groups.length === (setup.groups ?? []).length) {
        return fail([issue(['settings', 'styles', command.by, 'groups'], 'not-found', `there is no card for ${JSON.stringify(command.value)}`)]);
      }
      const { groups: _old, ...rest } = setup;
      return withSetup(command.by, groups.length > 0 ? { ...rest, groups } : rest);
    }
    case 'set-band-dividers': {
      const setup = setupOf(doc, command.by);
      const { dividers: _d, bands: oldBands, mode: oldMode, ...rest } = setup;
      // Dropping the bands drops the mode too (value cards are then the only kind).
      if (command.dividers === null) return withSetup(command.by, rest);
      const dividers = [...command.dividers];
      const old = hasBands(setup) ? { dividers: setup.dividers!, bands: oldBands! } : { dividers: [] as number[], bands: [{}] as Look[] };
      // Same count (dividers moved): every band keeps its look. Otherwise each new band takes the
      // look of the old band holding its lower bound (band 0 keeps old band 0).
      const bands =
        dividers.length === old.dividers.length ? old.bands : [old.bands[0]!, ...dividers.map((d) => old.bands[bandIndex(old.dividers, d)]!)];
      return withSetup(command.by, { ...rest, dividers, bands: bands.map((b) => ({ ...b })), ...(oldMode === undefined ? {} : { mode: oldMode }) });
    }
    default: {
      const unreachable: never = command;
      throw new Error(`unknown design command ${JSON.stringify(unreachable)}`);
    }
  }
}
