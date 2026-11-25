import { beforeAll, describe, expect, it } from 'vitest';
import type { ActiveToolkit } from '@app/extensions';
import { labToolkit } from '@app/extensions/test-fixtures';
import { friendlyMessages } from '@app/ui';
import {
  decideTripleCommit,
  parseTriple,
  parseTypeId,
  planGeometryEdit,
  POSITION_BOUNDS,
  relationshipLabelIn,
  tripleKey,
  typeMenu,
  type TripleBounds,
} from './propertiesModel';
import { fakePort } from './test-fixtures';

const SIZE: TripleBounds = { names: ['x', 'y', 'z'], min: 1, max: 32 };

describe('three-number fields (position / size)', () => {
  it('accepts whole numbers only, never partial input', () => {
    expect(parseTriple(['1', '-2', '0'], POSITION_BOUNDS)).toEqual({ ok: true, value: [1, -2, 0] });
    expect(parseTriple([' 3 ', '+4', '-0'], POSITION_BOUNDS)).toEqual({ ok: true, value: [3, 4, 0] });
    for (const partial of ['', '-', '1.5', '1e3', 'abc', '0x1', 'NaN', 'Infinity']) {
      const result = parseTriple([partial, '0', '0'], POSITION_BOUNDS);
      expect(result.ok, partial).toBe(false);
    }
    expect(parseTriple(['0', '0', ''], POSITION_BOUNDS)).toEqual({ ok: false, message: 'z (storey) must be a whole number' });
  });

  it('applies size bounds', () => {
    expect(parseTriple(['0', '1', '1'], SIZE)).toEqual({ ok: false, message: 'x must be at least 1' });
    expect(parseTriple(['1', '33', '1'], SIZE)).toEqual({ ok: false, message: 'y must be at most 32' });
    expect(parseTriple(['2', '3', '1'], SIZE)).toEqual({ ok: true, value: [2, 3, 1] });
  });

  it('decides exactly one send per changed value', () => {
    const stored = [0, 0, 0] as const;
    expect(decideTripleCommit(['0', '0', '0'], stored, POSITION_BOUNDS, null)).toEqual({ kind: 'unchanged' });
    expect(decideTripleCommit(['0', '-', '0'], stored, POSITION_BOUNDS, null).kind).toBe('invalid');
    expect(decideTripleCommit(['1', '0', '0'], stored, POSITION_BOUNDS, null)).toEqual({ kind: 'send', value: [1, 0, 0] });
    // Enter sent [1,0,0] and it was refused: the following blur must not send it again.
    expect(decideTripleCommit(['1', '0', '0'], stored, POSITION_BOUNDS, tripleKey([1, 0, 0]))).toEqual({ kind: 'repeat' });
    // A different value is sent again.
    expect(decideTripleCommit(['2', '0', '0'], stored, POSITION_BOUNDS, tripleKey([1, 0, 0]))).toEqual({ kind: 'send', value: [2, 0, 0] });
  });
});

describe('node type menu', () => {
  let project: ActiveToolkit;
  beforeAll(async () => {
    project = await labToolkit();
  });

  it('lists the active project types with their labels', () => {
    const menu = typeMenu(project, ['gallery', 'legacy-thing'], 'gallery');
    expect(menu.allowCustom).toBe(false);
    expect(menu.options).toEqual([
      { value: 'gallery', label: 'Gallery', disabled: false },
      { value: 'studio', label: 'Studio', disabled: false },
    ]);
    expect(menu.current.kind).toBe('registered');
  });

  it('keeps an unknown current type visible, not selectable as a new choice', () => {
    const menu = typeMenu(project, ['legacy-thing'], 'legacy-thing');
    expect(menu.options[0]).toEqual({ value: 'legacy-thing', label: 'legacy-thing: not defined in this project', disabled: true });
    expect(menu.options.slice(1).map((o) => o.value)).toEqual(['gallery', 'studio']);
    expect(menu.current.kind).toBe('undefined-type');
  });

  it('lists broken definitions as disabled', async () => {
    const broken = await labToolkit({ 'toolkits/lab/functions/kiosk.ts': { default: { id: 'kiosk', label: 7 } } });
    const menu = typeMenu(broken, [], 'gallery');
    const kiosk = menu.options.find((o) => o.value === 'kiosk');
    expect(kiosk?.disabled).toBe(true);
    expect(kiosk?.label).toContain('invalid definition');
    expect(menu.options.filter((o) => !o.disabled).map((o) => o.value)).toEqual(['gallery', 'studio']);
  });

  it('without a project, offers the design types and free entry', () => {
    const menu = typeMenu(null, ['studio', 'gallery', 'studio'], 'atrium');
    expect(menu.allowCustom).toBe(true);
    expect(menu.options.map((o) => o.value)).toEqual(['atrium', 'gallery', 'studio']);
    expect(parseTypeId(' new-type ')).toEqual({ ok: true, value: 'new-type' });
    expect(parseTypeId('New Type').ok).toBe(false);
  });
});

describe('move / resize plan (schema v2 port)', () => {
  it('commits a free move as one set-node-geometry command', () => {
    const port = fakePort();
    const proposal = port.proposeEdit({ nodeId: 3, position: [0, 8, 0] });
    expect(planGeometryEdit(proposal, port.doc, 3)).toEqual({ kind: 'commit' });
  });

  it('refuses a room overlap with a plain message naming the other room', () => {
    const port = fakePort();
    const proposal = port.proposeEdit({ nodeId: 3, position: [1, 1, 0] });
    const plan = planGeometryEdit(proposal, port.doc, 3);
    expect(plan.kind).toBe('reject');
    if (plan.kind !== 'reject') return;
    const messages = friendlyMessages(plan.issues, { subjectNodeId: '3', roomLabel: (id) => id });
    expect(messages[0]?.text).toBe('This node overlaps node 1. Nodes cannot share cells.');
    expect(messages[0]?.technical).toContain('room-overlap');
  });

  it('asks for confirmation when a generated corridor is in the way, naming the relationship', () => {
    const port = fakePort();
    expect(port.spatial.byEdge.get(1)?.status).toBe('routed');
    const proposal = port.proposeEdit({ nodeId: 3, position: [3, 0, 0] });
    expect(planGeometryEdit(proposal, port.doc, 3)).toEqual({ kind: 'confirm', relationships: ['1 → 2'] });
    expect(relationshipLabelIn(port.doc)(1)).toBe('1 → 2');
  });

  it('Cancel sends nothing; "Move anyway and recalculate" sends one confirmed command', () => {
    const cancelled = fakePort();
    cancelled.proposeEdit({ nodeId: 3, position: [3, 0, 0] });
    expect(cancelled.sent).toEqual([]);
    expect(cancelled.latest()).toBe(cancelled.doc);

    const port = fakePort();
    // Without confirmation the engine refuses; the document stays unchanged.
    expect(port.onCommand({ type: 'set-node-geometry', nodeId: 3, position: [3, 0, 0] })).toMatchObject({ ok: false });
    expect(port.latest()).toBe(port.doc);
    const outcome = port.onCommand({ type: 'set-node-geometry', nodeId: 3, position: [3, 0, 0], confirmRouteDisplacement: true });
    expect(outcome).toEqual({ ok: true });
    const next = port.latest();
    expect(next.nodes.find((n) => n.id === 3)?.position).toEqual([3, 0, 0]);
    // The relationship is kept; its corridor is recalculated (here: blocked by the moved room).
    expect(next.edges.map((e) => e.id)).toEqual([1]);
  });
});
