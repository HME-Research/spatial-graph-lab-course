import { describe, expect, it } from 'vitest';
import { readDesignJson } from './serialize';
import { relationshipLabel } from './display';

/** Phase 09 regressions: explicit refusal of unsafe attribute keys; one relationship label helper. */
describe('phase 09 hardening', () => {
  const v2 = (attributes: string) =>
    `{"schemaVersion":2,"metadata":{"name":"x"},"nodes":[{"id":1,"position":[0,0,0],"function":"room","custom":${attributes}}],"edges":[]}`;

  it('refuses an attribute named __proto__ with a message instead of dropping it silently', () => {
    for (const text of [v2('{"__proto__":"x","a":1}'), v2('{"__proto__":"x"}')]) {
      const r = readDesignJson(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues.map((i) => i.message).join(' ')).toMatch(/__proto__/);
    }
    const fine = readDesignJson(v2('{"proto":"x","a":1}'));
    expect(fine.ok && fine.value.doc.nodes[0]!.custom).toEqual({ proto: 'x', a: 1 });
  });

  it('labels relationships by room ids (source → target); unknown ids unchanged', () => {
    const doc = { edges: [{ id: 4, source: 7, target: 3 }] } as never;
    expect(relationshipLabel(doc, 4)).toBe('7 → 3');
    expect(relationshipLabel(doc, 9)).toBe('9');
  });
});
