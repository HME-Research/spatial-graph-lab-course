import { describe, expect, it } from 'vitest';
import { applyDesignCommand } from '@app/spatial';
import { serializeDesignV2, type RoomNode } from '@app/document';
import { expectOk } from '@app/document/test-fixtures';
import { checkConformance } from '@app/extensions';
import { galleryType, labDoc, labToolkit, studioType } from '@app/extensions/test-fixtures';
import {
  fieldDraft,
  parseFieldDraft,
  setTypedAttributeCommand,
  setUndeclaredAttributesCommand,
  typedFields,
  undeclaredAttributes,
} from './typedAttributes';
import type { ParseResult } from './inspectorModel';

const gallerySpecs = galleryType.custom!;
const studioSpecs = studioType.custom!;
/** Value of a successful ParseResult (inspector helpers report a message, not issues). */
function parsed<T>(r: ParseResult<T>): T {
  if (!r.ok) throw new Error(r.message);
  return r.value;
}
const node = (id: number): RoomNode => labDoc().nodes.find((n) => n.id === id)!;

describe('typed attribute fields', () => {
  it('one field per declared attribute, with status, default hint and description', () => {
    const fields = typedFields(gallerySpecs, node(1).custom);
    expect(fields.map((f) => [f.key, f.stored, f.status, f.defaultValue])).toEqual([
      ['daylight', 'high', 'ok', undefined],
      ['public', true, 'ok', true],
    ]);
    expect(fields[0]!.accepts).toBe('one of "high", "medium", "low"');
  });

  it('keeps an invalid stored value visible and flagged, and shows a missing one as missing (no default written)', () => {
    const g2 = node(2);
    const fields = typedFields(gallerySpecs, g2.custom);
    expect(fields.map((f) => [f.key, f.stored, f.status])).toEqual([
      ['daylight', 'bright', 'invalid'],
      ['public', undefined, 'missing'],
    ]);
    expect(fieldDraft(fields[0]!)).toBe('bright');
    expect(fieldDraft(fields[1]!)).toBe('');
    expect(g2.custom).toEqual({ daylight: 'bright', legacy: 'kept' });
    expect(undeclaredAttributes(gallerySpecs, g2.custom)).toEqual({ legacy: 'kept' });
  });

  it('converts drafts by kind only', () => {
    expect(parseFieldDraft(studioSpecs['occupancy']!, ' 4 ')).toBe(4);
    expect(parseFieldDraft(studioSpecs['occupancy']!, 'abc')).toBeNaN();
    expect(parseFieldDraft(studioSpecs['occupancy']!, '')).toBeNaN();
    expect(parseFieldDraft(gallerySpecs['public']!, 'false')).toBe(false);
    expect(parseFieldDraft(gallerySpecs['daylight']!, 'low')).toBe('low');
  });
});

describe('typed attribute edits', () => {
  it('setting a declared value keeps every other attribute, including invalid and legacy ones, in order', () => {
    const doc = labDoc();
    const g2 = doc.nodes.find((n) => n.id === 2)!;
    const command = parsed(setTypedAttributeCommand(g2, gallerySpecs, 'public', false));
    expect(command).toEqual({ type: 'set-node-attributes', nodeId: 2, custom: { daylight: 'bright', legacy: 'kept', public: false } });
    const next = expectOk(applyDesignCommand(doc, command));
    expect(next.nodes.find((n) => n.id === 2)!.custom).toEqual({ daylight: 'bright', legacy: 'kept', public: false });
  });

  it('changing daylight updates the graph data and resolves the conformance warning', async () => {
    const project = await labToolkit();
    const doc = labDoc();
    expect(checkConformance(doc, project).map((d) => d.id)).toContain('invalid-attribute-value|node:2|daylight');
    const g2 = doc.nodes.find((n) => n.id === 2)!;
    const next = expectOk(applyDesignCommand(doc, parsed(setTypedAttributeCommand(g2, gallerySpecs, 'daylight', 'low'))));
    expect(next.nodes.find((n) => n.id === 2)!.custom).toEqual({ daylight: 'low', legacy: 'kept' });
    expect(serializeDesignV2(next)).toContain('"daylight": "low"');
    expect(checkConformance(next, project).map((d) => d.id)).not.toContain('invalid-attribute-value|node:2|daylight');
  });

  it('rejects values the declaration does not accept (the runtime’s own rule)', () => {
    const s1 = node(3);
    const g1 = node(1);
    const message = (r: ReturnType<typeof setTypedAttributeCommand>) => (r.ok ? 'ok' : r.message);
    expect(message(setTypedAttributeCommand(g1, gallerySpecs, 'daylight', 'bright'))).toBe('"daylight" must be one of "high", "medium", "low"');
    expect(message(setTypedAttributeCommand(s1, studioSpecs, 'occupancy', -1))).toBe('"occupancy" must be a number ≥ 0');
    expect(message(setTypedAttributeCommand(s1, studioSpecs, 'occupancy', Number.NaN))).toBe('"occupancy" must be a number ≥ 0');
    expect(message(setTypedAttributeCommand(g1, gallerySpecs, 'public', 'yes'))).toBe('"public" must be true or false');
    expect(message(setTypedAttributeCommand(g1, gallerySpecs, 'legacy', 'x'))).toBe('"legacy" is not declared by type "gallery"');
  });

  it('clearing removes only that declared attribute (the default applies on read; nothing else changes)', () => {
    const g1 = node(1);
    expect(parsed(setTypedAttributeCommand(g1, gallerySpecs, 'public', undefined))).toEqual({
      type: 'set-node-attributes',
      nodeId: 1,
      custom: { daylight: 'high' },
    });
  });

  it('the free-form editor changes undeclared attributes only and keeps declared values as stored', () => {
    const g2 = node(2);
    const command = parsed(
      setUndeclaredAttributesCommand(g2, gallerySpecs, [
        { key: 'legacy', kind: 'text', value: 'changed' },
        { key: 'extra', kind: 'number', value: '2' },
      ]),
    );
    expect(command).toEqual({ type: 'set-node-attributes', nodeId: 2, custom: { daylight: 'bright', legacy: 'changed', extra: 2 } });
    const removed = parsed(setUndeclaredAttributesCommand(g2, gallerySpecs, []));
    expect(removed).toMatchObject({ custom: { daylight: 'bright' } });
    const clash = setUndeclaredAttributesCommand(g2, gallerySpecs, [{ key: 'daylight', kind: 'text', value: 'low' }]);
    expect(clash.ok).toBe(false);
    expect(!clash.ok && clash.message).toContain('declared by type "gallery"');
  });
});
