/**
 * A small in-memory reference toolkit for tests (imported by *.test.ts only). The repository ships
 * no toolkit of its own after the P4 reset, so tests that need a realistic toolkit (types with
 * façades and attributes, a graph analysis and two spatial transformations, a default design)
 * activate this one through `fakeGlobs`, exactly as the app activates a folder under `toolkits/`.
 */
import {
  defineGraphAlgorithm,
  defineNodeType,
  defineSpatialAlgorithm,
  defineToolkit,
  edgesBetween,
  FACE_DIRECTIONS,
  getNode,
  neighbourCell,
  neighbours,
  uniqueId,
  type SpatialOperation,
} from '@student-api';
import twoStoreyText from '../document/test-designs/two-storey.json?raw';
import { activate, type ActiveToolkit } from './activate';
import { fakeGlobs } from './test-fixtures';

/** The test toolkit's default design: six one-cell rooms over two storeys (schema v2 text). */
export const TWO_STOREY_TEXT: string = twoStoreyText;

const HORIZONTAL = FACE_DIRECTIONS.filter((d) => d !== '+z' && d !== '-z');

export const gallery = defineNodeType({
  id: 'gallery',
  label: 'Gallery',
  facade: { windowFraction: 0.7 },
  attributes: {
    daylight: { kind: 'enum', values: ['high', 'medium', 'low'] },
    public: { kind: 'boolean', default: true },
  },
});

export const storage = defineNodeType({
  id: 'storage',
  label: 'Storage',
  facade: { windowFraction: 0.04 },
  attributes: { public: { kind: 'boolean', default: false } },
});

export const studio = defineNodeType({
  id: 'studio',
  label: 'Studio',
  facade: { windowFraction: 0.25 },
  attributes: { occupancy: { kind: 'number', min: 0 }, public: { kind: 'boolean', default: false } },
});

/** Graph analysis: relationship steps from a start room (breadth-first). */
export const accessDepth = defineGraphAlgorithm({
  id: 'access-depth',
  label: 'Access depth from a room',
  parameters: { start: { kind: 'text', default: 'entry-gallery' } },
  run({ graph, params }) {
    const start = params.start ?? '';
    const depth = new Map<string, number>();
    if (graph.nodes.some((n) => n.id === start)) {
      depth.set(start, 0);
      const queue = [start];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const next of neighbours(graph, current)) {
          if (!depth.has(next)) {
            depth.set(next, depth.get(current)! + 1);
            queue.push(next);
          }
        }
      }
    }
    const nodeValues: Record<string, number | null> = {};
    for (const n of graph.nodes) nodeValues[n.id] = depth.get(n.id) ?? null;
    const unreachable = graph.nodes.length - depth.size;
    return {
      kind: 'analysis',
      summary: depth.size === 0 ? `Start room "${start}" does not exist.` : `${unreachable} room(s) cannot be reached from "${start}".`,
      nodeValues,
    };
  },
});

/** Spatial transformation: an access relationship between each storage room and every gallery beside it. */
export const connectStorage = defineSpatialAlgorithm({
  id: 'connect-storage-to-galleries',
  label: 'Connect storage to neighbouring galleries',
  run(ctx) {
    const operations: SpatialOperation[] = [];
    const newIds: string[] = [];
    for (const room of ctx.design.nodes) {
      if (room.typeId !== storage.id) continue;
      for (const direction of HORIZONTAL) {
        const otherId = ctx.nodeAt(neighbourCell(room.grid, direction));
        const other = otherId === undefined ? undefined : getNode(ctx.design, otherId);
        if (!other || other.typeId !== gallery.id) continue;
        if (edgesBetween(ctx.design, room.id, other.id).length > 0) continue;
        const id = uniqueId(ctx.design, 'door', newIds);
        newIds.push(id);
        operations.push({ op: 'add-edge', id, source: room.id, target: other.id, kind: 'door' });
      }
    }
    return { kind: 'transformation', summary: `${operations.length} door(s) added.`, operations };
  },
});

/** Spatial transformation: each gallery's daylight from how many of its walls face the outside. */
export const daylightFromExposure = defineSpatialAlgorithm({
  id: 'daylight-from-exposure',
  label: 'Daylight from exposed walls',
  run(ctx) {
    const operations: SpatialOperation[] = [];
    for (const node of ctx.design.nodes) {
      if (node.typeId !== gallery.id) continue;
      const exposed = HORIZONTAL.filter((d) => ctx.nodeAt(neighbourCell(node.grid, d)) === undefined).length;
      const daylight = exposed >= 3 ? 'high' : exposed === 2 ? 'medium' : 'low';
      if (ctx.attributesOf(node, gallery).daylight !== daylight) {
        operations.push({ op: 'set-node-attribute', nodeId: node.id, key: 'daylight', value: daylight });
      }
    }
    return { kind: 'transformation', summary: `${operations.length} gallery daylight value(s) updated.`, operations };
  },
});

export const GALLERY_TOOLKIT_ID = 'gallery';

/** Every file of the test toolkit, as `fakeGlobs` input. */
export const GALLERY_FILES: Readonly<Record<string, unknown>> = {
  'toolkits/gallery/toolkit.ts': { default: defineToolkit({ name: 'Gallery', defaultDesign: 'two-storey' }) },
  'toolkits/gallery/types/gallery.ts': { default: gallery },
  'toolkits/gallery/types/storage.ts': { default: storage },
  'toolkits/gallery/types/studio.ts': { default: studio },
  'toolkits/gallery/algorithms/access-depth.ts': { default: accessDepth },
  'toolkits/gallery/algorithms/connect-storage-to-galleries.ts': { default: connectStorage },
  'toolkits/gallery/algorithms/daylight-from-exposure.ts': { default: daylightFromExposure },
  'toolkits/gallery/designs/two-storey.json': TWO_STOREY_TEXT,
};

export const GALLERY_GLOBS = fakeGlobs(GALLERY_FILES);

/** The activated test toolkit. */
export async function galleryToolkit(): Promise<ActiveToolkit> {
  const { activation } = await activate(GALLERY_GLOBS, { query: GALLERY_TOOLKIT_ID });
  if (activation.status !== 'active') throw new Error(`the gallery test toolkit did not activate: ${JSON.stringify(activation)}`);
  return activation.toolkit;
}
