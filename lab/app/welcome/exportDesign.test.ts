import { describe, expect, it } from 'vitest';
import { readDesignJson } from '@app/document';
import { createMemoryKeptMarks, createMemoryProjectStore } from '@app/project';
import { twoRooms } from '@app/session/projectStore.fixtures';
import { createProjectController } from '@app/session/projectStoreController';
import { exportDesign } from './ProjectFiles';
import { openBuiltInExample, type WelcomeHost } from './welcomeFlow';
import { designFileName } from './welcomeModel';

function host(): WelcomeHost {
  const controller = createProjectController({ store: createMemoryProjectStore(), locks: null, debounceMs: 0, keptMarks: createMemoryKeptMarks() });
  return { controller, defaultToolkitId: null, startingDesign: async () => ({ ok: false, message: 'unused' }) };
}

describe('Export design file', () => {
  it('names the file after the design (slug), with design.json as fallback', () => {
    expect(designFileName('My Design')).toBe('my-design.json');
    expect(designFileName('  Small Library #2! ')).toBe('small-library-2.json');
    expect(designFileName('???')).toBe('design.json');
    expect(designFileName('')).toBe('design.json');
  });

  it('downloads the active scenario design as a valid design file and leaves the export state alone', async () => {
    const h = host();
    await openBuiltInExample(h, twoRooms(), 'two.json');
    h.controller.createScenario({ from: 'current', name: 'Option B' });
    h.controller.command({ type: 'set-node-geometry', nodeId: 2, position: [2, 1, 0] });
    let text = '';
    let name = '';
    expect(
      exportDesign(h.controller, (t, n) => {
        text = t;
        name = n;
      }),
    ).toBeNull();
    const read = readDesignJson(text);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(name).toBe(designFileName(read.value.doc.metadata.name));
    expect(read.value.doc.nodes.find((n) => n.id === 2)!.position).toEqual([2, 1, 0]);
    expect(h.controller.getState().project!.exportedSignature).toBeNull();
  });

  it('reports a failed download', async () => {
    const h = host();
    await openBuiltInExample(h, twoRooms(), 'two.json');
    const message = exportDesign(h.controller, () => {
      throw new Error('blocked by browser');
    });
    expect(message).toMatch(/blocked by browser/);
  });
});
