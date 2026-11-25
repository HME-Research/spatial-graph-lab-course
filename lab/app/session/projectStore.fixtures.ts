import { readDesign, type DesignDocumentV2 } from '@app/document';
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
      { id: 1, position: [0, 0, 0], size: [2, 1, 1], function: 'gallery' },
      { id: 2, position: [2, 0, 0], function: 'studio' },
      { id: 3, position: [6, 6, 0], function: 'studio' },
    ],
    edges: [
      { id: 1, source: 1, target: 2, relationship: 'access' },
      { id: 2, source: 1, target: 3, relationship: 'access' },
    ],
    diagram: { positions: { 1: [0, 0], 2: [100, 0], 3: [200, 0] } },
  });

let seq = 0;
export const fixtureIds = () => ({ newId: () => `project-f${++seq}`, newScenarioId: () => `scenario-f${++seq}`, now: () => '2026-11-16T10:00:00.000Z' });

export function fileOf(doc: DesignDocumentV2 = twoRooms()): ProjectFileV2 {
  const r = newProjectFromDesign(doc, { ...fixtureIds(), name: 'Test project', toolkit: { id: 'gallery' } });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}
