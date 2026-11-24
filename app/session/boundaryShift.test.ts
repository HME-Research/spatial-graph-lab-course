import { describe, expect, it } from 'vitest';
import { expectOk } from '@app/document/test-fixtures';
import { validateDocumentV2, type DesignDocumentV2 } from '@app/document';
import { resolveRelationships } from '@app/spatial';
import { createMetricEvaluator } from '@app/metrics';
import { runAlgorithmV2 } from '@app/extensions';
import { expectExtOk, labToolkit } from '@app/extensions/test-fixtures';
import { applyPreviewV2, describePreview } from './algorithmSession';
import { applyDesignCommandToSession, currentDocument, openDocument, redoDocument, undoDocument, versionOf, type DocumentSession } from './documentSession';
import { undoLabel } from './history';

/**
 * Boundary shifts through the app's workflows (2026-11-24): one undo step per command, and the
 * Student API's preview → Apply path with a `set-edge-boundary-shift` operation.
 */

/** Gallery 1 (2×2) with gallery 2 east of it, touching on one 3 m wall; access edge 1 (1 → 2). */
function lab(): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'Lab' },
      nodes: [
        { id: 1, position: [0, 0, 0], size: [2, 2, 1], function: 'gallery', custom: {} },
        { id: 2, position: [2, 1, 0], function: 'gallery', custom: {} },
      ],
      edges: [{ id: 1, source: 1, target: 2, relationship: 'access', custom: {} }],
    }),
  );
}

const ok = (s: DocumentSession<DesignDocumentV2>, command: Parameters<typeof applyDesignCommandToSession>[1]) => {
  const r = applyDesignCommandToSession(s, command);
  if (!r.ok) throw new Error(r.issues.map((i) => i.message).join('; '));
  return r.session;
};

describe('commands in the document history', () => {
  it('reverse and set-shift are one labelled undo step each; undo / redo restore exactly', () => {
    const start = openDocument(lab(), 'lab.json', null);
    const shifted = ok(start, { type: 'set-edges-boundary-shift', edgeIds: [1], boundaryShift: 'toward-target' });
    expect(undoLabel(shifted.history)).toBe('Shift the boundary of edge 1 → 2 toward its target');
    const reversed = ok(shifted, { type: 'reverse-edge', edgeId: 1 });
    expect(undoLabel(reversed.history)).toBe('Reverse edge 1 → 2'); // named as it was before the step
    expect(currentDocument(reversed).edges[0]).toMatchObject({ id: 1, source: 2, target: 1, boundaryShift: 'toward-target' });

    const undone = undoDocument(reversed);
    expect(currentDocument(undone)).toBe(currentDocument(shifted));
    expect(currentDocument(undoDocument(undone))).toBe(currentDocument(start));
    expect(currentDocument(redoDocument(undone))).toEqual(currentDocument(reversed));

    const cleared = ok(reversed, { type: 'set-edges-boundary-shift', edgeIds: [1], boundaryShift: 'none' });
    expect(undoLabel(cleared.history)).toBe('Remove the boundary shift of edge 2 → 1');
    expect(currentDocument(cleared).edges[0]).not.toHaveProperty('boundaryShift');
  });
});

describe('Student API: requesting a boundary shift', () => {
  const ALG = 'toolkits/lab/algorithms/shift.ts';
  // Definitions are plain objects here: only app/extensions imports @student-api.
  const toolkit = (run: (ctx: { design: { edges: readonly { id: number; boundaryShift?: string }[] }; metrics: { value(id: string, item: number): unknown } }) => unknown) =>
    labToolkit({ [ALG]: { default: { id: 'shift', label: 'Shift', scope: 'spatial', run } } });

  it('reads source, target and the request; previews and applies a set-edge-boundary-shift operation', async () => {
    const seen: unknown[] = [];
    const project = await toolkit((ctx) => {
      const edge = ctx.design.edges[0]!;
      seen.push(edge.boundaryShift ?? 'none', ctx.metrics.value('area', 2), ctx.metrics.value('actual-area', 2), ctx.metrics.value('boundary-adjusted', 2));
      return { kind: 'transformation', operations: [{ op: 'set-edge-boundary-shift', edgeId: edge.id, boundaryShift: 'toward-target' }] };
    });
    const doc = lab();
    const outcome = expectExtOk(runAlgorithmV2(doc, project, 'shift'));
    expect(seen).toEqual(['none', 9, 9, false]);
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    const preview = outcome.preview;
    // The preview never changed the document; it lists the request.
    expect(doc.edges[0]).not.toHaveProperty('boundaryShift');
    expect(describePreview(preview).boundaryShiftChanges).toEqual([{ edgeId: 1, from: 'none', to: 'toward-target' }]);
    expect(describePreview(preview).affectedNodeIds).toEqual([1, 2]);

    const version = versionOf(openDocument(doc, 'lab.json', null));
    const applied = applyPreviewV2(version, preview, version.revision);
    if (!applied.ok) throw new Error(applied.message);
    expect(applied.doc.edges[0]!.boundaryShift).toBe('toward-target');
    const ctx = { doc: applied.doc, spatial: resolveRelationships(applied.doc) };
    const m = createMetricEvaluator();
    expect([m.value(ctx, 'actual-area', 1), m.value(ctx, 'actual-area', 2)]).toEqual([40.5, 4.5]);
    expect(m.value(ctx, 'boundary-shift-applied', 1)).toBe(true);

    // A later run reads the stored request and the applied state.
    seen.length = 0;
    expectExtOk(runAlgorithmV2(applied.doc, project, 'shift'));
    expect(seen).toEqual(['toward-target', 9, 4.5, true]);
  });

  it('stores an ineligible request (it is only a request) and refuses an unknown value or edge', async () => {
    const doc = lab();
    // Shrinking gallery 1 needs its whole 6 m side shared: not applicable, but stored.
    const store = await toolkit(() => ({ kind: 'transformation', operations: [{ op: 'set-edge-boundary-shift', edgeId: 1, boundaryShift: 'toward-source' }] }));
    const outcome = expectExtOk(runAlgorithmV2(doc, store, 'shift'));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    const after = outcome.preview.after;
    expect(after.edges[0]!.boundaryShift).toBe('toward-source');
    expect(createMetricEvaluator().value({ doc: after, spatial: resolveRelationships(after) }, 'boundary-shift-status', 1)).toBe('partial-wall');

    const bad = await toolkit(() => ({ kind: 'transformation', operations: [{ op: 'set-edge-boundary-shift', edgeId: 1, boundaryShift: 'left' }] }));
    expect(runAlgorithmV2(doc, bad, 'shift').ok).toBe(false);
    const missing = await toolkit(() => ({ kind: 'transformation', operations: [{ op: 'set-edge-boundary-shift', edgeId: 9, boundaryShift: 'none' }] }));
    const r = runAlgorithmV2(doc, missing, 'shift');
    expect(!r.ok && r.issues.map((d) => d.code)).toEqual(['missing-edge']);
  });

  it('add-edge may carry a request; none is not stored', async () => {
    const doc = expectOk(
      validateDocumentV2({ ...lab(), edges: [], nextEdgeId: 1 }),
    );
    const project = await toolkit(() => ({
      kind: 'transformation',
      operations: [{ op: 'add-edge', source: 2, target: 1, relationship: 'open', boundaryShift: 'toward-source' }],
    }));
    const outcome = expectExtOk(runAlgorithmV2(doc, project, 'shift'));
    if (outcome.kind !== 'transformation') throw new Error('expected a transformation');
    expect(outcome.preview.after.edges).toEqual([{ id: 1, source: 2, target: 1, relationship: 'open', boundaryShift: 'toward-source', custom: {} }]);
  });
});
