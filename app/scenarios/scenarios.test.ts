import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createMemoryProjectStore } from '@app/project';
import { fileOf } from '@app/session/projectStore.fixtures';
import { openProject } from '@app/session/projectStore';
import { createProjectController, type ProjectController } from '@app/session/projectStoreController';
import { ProjectControllerContext } from '@app/session/projectStoreContext';
import { SaveStatus } from './SaveStatus';
import { ScenarioList, ScenariosPanel } from './ScenariosPanel';
import { saveStatusView, scenarioRows, scenarioSummary } from './scenariosModel';

async function opened(): Promise<ProjectController> {
  const c = createProjectController({ store: createMemoryProjectStore(), locks: null, debounceMs: 0 });
  await c.open(fileOf(), { kind: 'created', label: 't' });
  await c.flush();
  return c;
}

const withController = (c: ProjectController | null, element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(ProjectControllerContext.Provider, { value: c }, element));

describe('scenario rows', () => {
  it('describes each scenario and marks the active one', async () => {
    const c = await opened();
    c.createScenario({ from: 'blank', name: 'Empty' });
    const rows = scenarioRows(c.getState().project!);
    expect(rows.map((r) => [r.name, r.active, r.rooms])).toEqual([
      ['Scenario 1', false, 3],
      ['Empty', true, 0],
    ]);
    expect(scenarioSummary(rows[0]!)).toBe('3 nodes · 2 edges');
    expect(scenarioSummary(rows[1]!)).toBe('0 nodes · 0 edges');
  });
});

describe('Scenarios panel', () => {
  it('says no project is open without a controller or project', () => {
    expect(withController(null, createElement(ScenariosPanel))).toContain('no project is open');
  });

  it('lists scenarios with switch, rename, duplicate and delete; delete is disabled for the last one', async () => {
    const c = await opened();
    const html = withController(c, createElement(ScenariosPanel));
    expect(html).toContain('Scenario 1');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('aria-label="Rename Scenario 1"');
    expect(html).toContain('aria-label="Duplicate Scenario 1"');
    expect(html).toMatch(/<button type="button" class="sgl-icon-action" disabled="" aria-label="Delete Scenario 1"/);
    expect(html).toContain('New scenario');
    // No scenario dropdown: switching is by the list only.
    expect(html).not.toContain('<select');
  });

  it('asks for confirmation before deleting', async () => {
    const c = await opened();
    c.createScenario({ from: 'current', name: 'Option B' });
    const p = c.getState().project!;
    const html = withController(
      c,
      createElement(ScenarioList, { controller: c, rows: scenarioRows(p), defaultName: 'Scenario 3', initialEditing: { kind: 'delete', id: p.activeScenarioId } }),
    );
    expect(html).toContain('<dialog class="sgl-dialog"');
    expect(html).toContain('Delete scenario “Option B”?');
    expect(html).toContain('>Delete scenario<');
    // Cancel is focused first: deleting needs a deliberate second choice.
    expect(html).toMatch(/<button type="button" data-autofocus="true">Cancel<\/button>/);
  });

  it('offers copy-of-active or empty when creating', async () => {
    const c = await opened();
    const p = c.getState().project!;
    const html = withController(c, createElement(ScenarioList, { controller: c, rows: scenarioRows(p), defaultName: 'Scenario 2', initialEditing: { kind: 'create' } }));
    expect(html).toContain('A copy of the active scenario');
    expect(html).toContain('An empty scenario');
    expect(html).toContain('value="Scenario 2"');
  });
});

describe('save status', () => {
  const project = openProject(fileOf(), { kind: 'created', label: 't' });

  it('never reports a blocked save as saved, and offers actions to resolve it', () => {
    const quota = saveStatusView({ project, save: { local: 'blocked', reason: 'quota', message: 'not saved: quota' } })!;
    expect(quota).toMatchObject({ tone: 'error', text: 'Save failed', actions: ['retry', 'save-as'] });
    const conflict = saveStatusView({ project, save: { local: 'blocked', reason: 'conflict', message: 'x' } })!;
    expect(conflict.actions).toEqual(['save-as', 'overwrite']);
    const unreadable = saveStatusView({ project, save: { local: 'blocked', reason: 'refused-unreadable', message: 'x' } })!;
    expect(unreadable.actions).toEqual(['save-as']);
  });

  it('keeps "not exported" a neutral note on a saved project', () => {
    const v = saveStatusView({ project, save: { local: 'saved', at: 'x' } })!;
    expect(v.tone).toBe('ok');
    expect(v.text).toBe('Saved locally');
    expect(v.detail).toMatch(/Export the project/);
    expect(saveStatusView({ project, save: { local: 'pending' } })!.text).toBe('Saving…');
    expect(saveStatusView({ project: null, save: { local: 'pending' } })).toBeNull();
  });

  it('renders the compact indicator with the state as data', async () => {
    const c = await opened();
    const html = renderToStaticMarkup(createElement(SaveStatus, { controller: c, compact: true }));
    expect(html).toContain('data-save-state="saved"');
    expect(html).toContain('role="status"');
  });
});
