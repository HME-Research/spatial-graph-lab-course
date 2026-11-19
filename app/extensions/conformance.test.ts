import { describe, expect, it } from 'vitest';
import { validateDocumentV2, serializeDesignV2 } from '@app/document';
import { exampleFacadeProvider } from '@app/building';
import { expectOk } from '@app/document/test-fixtures';
import { typeColor } from '@core/viewer/appearance';
import { checkValue, effectiveAttributes } from './attributes';
import { checkConformance, findRegressions, typeAppearance } from './conformance';
import { diagnostic } from './diagnostics';
import { labDoc, labToolkit } from './test-fixtures';

describe('attribute semantics', () => {
  const spec = { kind: 'enum', values: ['high', 'low'], default: 'low' } as const;
  it('classifies missing, null, invalid and valid values', () => {
    expect(checkValue(spec, undefined)).toBe('missing');
    expect(checkValue(spec, null)).toBe('missing');
    expect(checkValue(spec, 'bright')).toBe('invalid');
    expect(checkValue(spec, 3)).toBe('invalid');
    expect(checkValue(spec, 'high')).toBe('ok');
    expect(checkValue({ kind: 'number', min: 0, max: 5 }, 6)).toBe('invalid');
    expect(checkValue({ kind: 'number' }, Number.NaN)).toBe('invalid');
    expect(checkValue({ kind: 'boolean' }, 'true')).toBe('invalid');
  });

  it('resolves effective values on read without writing to the stored record', () => {
    const stored = { a: 'bright', c: null, legacy: 1 };
    const specs = { a: spec, b: { kind: 'boolean', default: true }, c: { kind: 'text' }, d: { kind: 'number' } } as const;
    expect(effectiveAttributes(specs, stored)).toEqual({ a: 'low', b: true });
    expect(stored).toEqual({ a: 'bright', c: null, legacy: 1 });
  });
});

describe('conformance', () => {
  it('reports each case with its severity and a stable identity', async () => {
    const project = await labToolkit();
    const ds = checkConformance(labDoc(), project);
    expect(ds.map((d) => [d.id, d.severity])).toEqual([
      ['invalid-attribute-value|node:g2|daylight', 'warning'],
      ['undeclared-attribute|node:g2|legacy', 'info'],
      ['unknown-node-type|node:k1', 'warning'],
      // Phase 02: edges are checked against the project's edge fields (the lab project has none).
      ['undeclared-attribute|edge:e1|width', 'info'],
    ]);
  });

  it('missing declared attributes produce no diagnostic', async () => {
    const project = await labToolkit();
    const doc = labDoc();
    expect(checkConformance(doc, project).some((d) => d.subject.kind === 'node' && d.subject.id === 's1')).toBe(false);
  });

  it('marks nodes of a broken type as errors and skips their attribute checks', async () => {
    const project = await labToolkit({ 'toolkits/lab/types/gallery.ts': { default: { id: 'gallery', label: '' } } });
    const ds = checkConformance(labDoc(), project);
    expect(ds.filter((d) => d.code === 'broken-node-type').map((d) => [d.id, d.severity])).toEqual([
      ['broken-node-type|node:g1', 'error'],
      ['broken-node-type|node:g2', 'error'],
    ]);
    expect(ds.some((d) => d.code === 'invalid-attribute-value')).toBe(false);
  });

  it('does not warn about unknown types when the project defines no types, or without a project', async () => {
    const project = await labToolkit({ 'toolkits/lab/types/gallery.ts': undefined, 'toolkits/lab/types/studio.ts': undefined });
    expect(project.nodeTypes).toEqual([]);
    // Phase 02: values outside the (here empty) project schema are reported as information only.
    const ds = checkConformance(labDoc(), project);
    expect(ds.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(ds.every((d) => d.code === 'undeclared-attribute')).toBe(true);
    expect(checkConformance(labDoc(), null)).toEqual([]);
  });

  it('identities are stable when nodes are reordered or unrelated nodes are added', async () => {
    const project = await labToolkit();
    const doc = labDoc();
    const ids = (d: typeof doc) => checkConformance(d, project).map((x) => x.id).sort();
    const reordered = { ...doc, nodes: [...doc.nodes].reverse() };
    const extended = expectOk(
      validateDocumentV2({ ...doc, nodes: [{ id: 'aa', grid: [9, 9, 0], typeId: 'studio', attributes: {} }, ...doc.nodes] }),
    );
    expect(ids(reordered)).toEqual(ids(doc));
    expect(ids(extended)).toEqual(ids(doc));
  });

  it('never changes the document', async () => {
    const project = await labToolkit();
    const doc = labDoc();
    const before = serializeDesignV2(doc);
    checkConformance(doc, project);
    expect(serializeDesignV2(doc)).toBe(before);
  });
});

describe('conformance non-regression (identity-based)', () => {
  const d = (code: 'invalid-attribute-value' | 'undeclared-attribute', id: string, severity: 'warning' | 'info' = 'warning') =>
    diagnostic(code, severity, { kind: 'node', id }, `${code} ${id}`, { attribute: 'x' });

  it('flags a new blocking identity even when the total count is unchanged', () => {
    const before = [d('invalid-attribute-value', 'a')];
    const after = [d('invalid-attribute-value', 'b')];
    expect(findRegressions(before, after).map((r) => r.id)).toEqual(['invalid-attribute-value|node:b|x']);
  });

  it('tolerates persisting diagnostics (reordered, reworded) and ignores information', () => {
    const before = [d('invalid-attribute-value', 'a'), d('invalid-attribute-value', 'b')];
    const after = [{ ...d('invalid-attribute-value', 'b'), message: 'reworded' }, d('undeclared-attribute', 'c', 'info')];
    expect(findRegressions(before, after)).toEqual([]);
  });
});

describe('type appearance (existing gallery/studio/storage behaviour preserved)', () => {
  const ids = ['gallery', 'studio', 'storage', 'lab', 'toString'];

  it('without a project equals the existing typeColor and example façade for every type', () => {
    for (const id of ids) expect(typeAppearance(null, id)).toEqual({ status: 'ok', color: typeColor(id), facade: exampleFacadeProvider(id) });
  });

  it('uses a declared façade, falls back only for undefined types, and flags broken types', async () => {
    const project = await labToolkit();
    expect(typeAppearance(project, 'gallery')).toEqual({ status: 'ok', color: typeColor('gallery'), facade: { windowFraction: 0.6 } });
    expect(typeAppearance(project, 'studio')).toEqual({ status: 'ok', color: typeColor('studio'), facade: exampleFacadeProvider('studio') });
    expect(typeAppearance(project, 'kiosk')).toEqual({ status: 'ok', color: typeColor('kiosk'), facade: exampleFacadeProvider('kiosk') });

    const broken = await labToolkit({ 'toolkits/lab/types/gallery.ts': { default: { id: 'gallery', label: 'G', facade: { windowFraction: 2 } } } });
    const a = typeAppearance(broken, 'gallery');
    expect(a.status).toBe('broken');
    expect('facade' in a).toBe(false);
  });
});
