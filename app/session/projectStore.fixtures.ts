import { readDesign, type DesignDocumentV2 } from '@app/document/v2';
import type { ProjectFileV2 } from '@app/project';
import { newProjectFromDesign } from './projectStore';

/** Test fixtures for the project controller (not a test file, so importing it registers no tests). */

export function design(raw: unknown): DesignDocumentV2 {
  const r = readDesign(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value.doc;
}

/** Rooms a–b side by side (access edge ab, shared wall) and a far room c (edge ac unresolved). */
export const twoRooms = (): DesignDocumentV2 =>
  design({
    schemaVersion: 2,
    metadata: { name: 'Two rooms' },
    nodes: [
      { id: 'a', grid: [0, 0, 0], size: [2, 1, 1], typeId: 'gallery' },
      { id: 'b', grid: [2, 0, 0], typeId: 'studio' },
      { id: 'c', grid: [6, 6, 0], typeId: 'studio' },
    ],
    edges: [
      { id: 'ab', source: 'a', target: 'b', kind: 'access' },
      { id: 'ac', source: 'a', target: 'c', kind: 'access' },
    ],
    diagram: { positions: { a: [0, 0], b: [100, 0], c: [200, 0] } },
  });

let seq = 0;
export const fixtureIds = () => ({ newId: () => `project-f${++seq}`, newScenarioId: () => `scenario-f${++seq}`, now: () => '2026-11-16T10:00:00.000Z' });

export function fileOf(doc: DesignDocumentV2 = twoRooms()): ProjectFileV2 {
  const r = newProjectFromDesign(doc, { ...fixtureIds(), name: 'Test project', toolkit: { id: 'example-gallery' } });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
