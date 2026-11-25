import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { functionLooks, functionStyleSettings } from '@app/document';
import { functionClashes, withProjectFunctions } from '@app/extensions';
import { labToolkit } from '@app/extensions/test-fixtures';
import { readProjectFile, serializeProjectFile } from '@app/project';
import { suffixedFunctionName } from '@app/attributes/attributeList';
import { FunctionClashNotice } from '@app/attributes/FunctionClashNotice';
import { currentDocument } from './documentSession';
import { canUndo, undoLabel } from './history';
import { fileOf, twoRooms } from './projectStore.fixtures';
import { activeSession, openProject, projectFileOf, resolveFunctionClash, setFunctionColour, setProjectFunctions } from './projectStore';

/**
 * A project function whose id a toolkit function now also has (2026-11-22, owner decision): the
 * student's function is kept under a suffixed name; they choose which function their rooms use.
 */
const clashing = () => {
  const doc = { ...twoRooms(), settings: functionStyleSettings({ gallery: { windowFraction: 0.5 } }) };
  let p = openProject(fileOf(doc), { kind: 'created', label: 'test' });
  p = setProjectFunctions(p, [{ id: 'gallery', label: 'Gallery' }], []);
  return setFunctionColour(p, 'gallery', '#123456');
};
const rename = { id: 'gallery-2', label: 'Gallery 2' };
const design = (p: ReturnType<typeof clashing>) => currentDocument(activeSession(p)).design;

describe('function id clashes between the toolkit and the project', () => {
  it('are found for any toolkit function (removed from the project or not), never for project-only ids', async () => {
    const lab = await labToolkit();
    expect(functionClashes(lab, [{ id: 'gallery', label: 'My gallery' }, { id: 'kiosk', label: 'Kiosk' }])).toEqual([{ id: 'gallery', label: 'My gallery', toolkitLabel: 'Gallery' }]);
    // The merged toolkit (with project functions) never reports a project function against itself.
    expect(functionClashes(withProjectFunctions(lab, [{ id: 'kiosk', label: 'Kiosk' }]), [{ id: 'kiosk', label: 'Kiosk' }])).toEqual([]);
    expect(functionClashes(null, [{ id: 'gallery', label: 'G' }])).toEqual([]);
  });

  it('the kept function gets the first free numbered name', () => {
    expect(suffixedFunctionName('Gallery', ['Gallery'])).toBe('Gallery 2');
    expect(suffixedFunctionName('Gallery', ['Gallery', 'gallery 2'])).toBe('Gallery 3');
    expect(suffixedFunctionName('x'.repeat(60), []).length).toBeLessThanOrEqual(60);
  });

  it('"Keep mine" moves rooms, Designer cards and the own colour to the renamed function in every scenario, as one undo step', () => {
    const r = resolveFunctionClash(clashing(), 'gallery', 'keep-mine', rename);
    if (!r.ok) throw new Error(r.message);
    const d = design(r.value);
    expect(d.nodes.find((n) => n.id === 1)!.function).toBe('gallery-2');
    expect(d.nodes.filter((n) => n.function === 'studio')).toHaveLength(2);
    expect(Object.keys(functionLooks(d.settings))).toEqual(['gallery-2']);
    expect(r.value.meta.settings.functions).toEqual([rename]);
    expect(r.value.meta.settings.functionColours).toEqual({ 'gallery-2': '#123456' });
    expect(canUndo(activeSession(r.value).history)).toBe(true);
    expect(undoLabel(activeSession(r.value).history)).toContain('Keep your “Gallery” as “Gallery 2”');
    // The saved project is valid.
    const file = projectFileOf(r.value);
    expect(file.ok && readProjectFile(serializeProjectFile(file.value)).ok).toBe(true);
  });

  it('"Use the toolkit’s" keeps the student’s function under the new name but does not change designs', () => {
    const before = clashing();
    const r = resolveFunctionClash(before, 'gallery', 'use-toolkit', rename);
    if (!r.ok) throw new Error(r.message);
    expect(design(r.value)).toBe(design(before));
    expect(r.value.meta.settings.functions).toEqual([rename]);
    expect(r.value.meta.settings.functionColours).toEqual({ 'gallery-2': '#123456' });
  });

  it('refuses an unknown function or a taken new id', () => {
    expect(resolveFunctionClash(clashing(), 'kiosk', 'keep-mine', rename).ok).toBe(false);
    expect(resolveFunctionClash(clashing(), 'gallery', 'keep-mine', { id: 'gallery', label: 'Gallery 2' }).ok).toBe(false);
  });

  it('the notice asks which function the rooms use, or only offers the rename when no room uses it', () => {
    const item = { id: 'gallery', label: 'Gallery', toolkitLabel: 'Gallery', rename, rooms: 3 };
    const html = renderToStaticMarkup(createElement(FunctionClashNotice, { clashes: [item], onChoose: () => null }));
    expect(html).toContain('Your function will be kept as “Gallery 2”');
    expect(html).toContain('Which should your 3 nodes use?');
    expect(html).toContain('Keep mine (“Gallery 2”)');
    expect(html).toContain('Use the toolkit’s “Gallery”');
    const unused = renderToStaticMarkup(createElement(FunctionClashNotice, { clashes: [{ ...item, rooms: 0 }], onChoose: () => null }));
    expect(unused).toContain('No nodes use it.');
    expect(unused).toContain('Rename mine to “Gallery 2”');
    expect(unused).not.toContain('Keep mine');
    expect(renderToStaticMarkup(createElement(FunctionClashNotice, { clashes: [], onChoose: () => null }))).toBe('');
  });
});
