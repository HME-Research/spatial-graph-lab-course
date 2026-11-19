/** Shared test helpers (imported by *.test.ts only). */
import { expect } from 'vitest';
import type { GraphIssue, IssueCode, Result } from './errors';
import { validateDocumentV2, type DesignDocumentV2 } from './v2';

/** Three one-cell rooms: a–b side by side with an access relationship (a door), c above a, open to it. */
export function threeRoomsRaw() {
  return {
    schemaVersion: 2,
    metadata: { name: 'Three rooms' },
    nodes: [
      { id: 'a', grid: [0, 0, 0], typeId: 'gallery', attributes: {} },
      { id: 'b', grid: [1, 0, 0], typeId: 'studio', attributes: {} },
      { id: 'c', grid: [0, 0, 1], typeId: 'gallery', attributes: {} },
    ],
    edges: [
      { id: 'ab', source: 'a', target: 'b', kind: 'access', attributes: {} },
      { id: 'ac', source: 'a', target: 'c', kind: 'open', attributes: {} },
    ],
    diagram: { positions: { a: [20, 80], b: [180, 80], c: [100, 0] } },
  } as Record<string, unknown> & {
    nodes: Record<string, unknown>[];
    edges: Record<string, unknown>[];
    diagram: { positions: Record<string, unknown> };
  };
}

export function threeRooms(): DesignDocumentV2 {
  return expectOk(validateDocumentV2(threeRoomsRaw()));
}

export function expectOk<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected ok, got issues: ${JSON.stringify(result.issues, null, 2)}`);
  return result.value;
}

/** Asserts failure and that some issue has the given code (and path, if supplied). */
export function expectIssue<T>(result: Result<T>, code: IssueCode, path?: GraphIssue['path']): GraphIssue {
  expect(result.ok, 'expected validation to fail').toBe(false);
  if (result.ok) throw new Error('unreachable');
  const found = result.issues.find((i) => i.code === code && (path === undefined || sameP(i.path, path)));
  expect(found, `expected issue ${code} at ${JSON.stringify(path)}; got ${JSON.stringify(result.issues)}`).toBeDefined();
  return found!;
}

const sameP = (a: GraphIssue['path'], b: GraphIssue['path']) =>
  a.length === b.length && a.every((s, i) => s === b[i]);
