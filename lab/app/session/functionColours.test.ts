import { describe, expect, it } from 'vitest';
import { typeColor } from '@core/viewer/appearance';
import { activate, defaultFunctionColour, functionColourResolver, functionDefinitionSchema, typeAppearance, withProjectFunctions } from '@app/extensions';
import { fakeGlobs, LAB_FILES, labToolkit } from '@app/extensions/test-fixtures';
import { readProjectFile, serializeProjectFile } from '@app/project';
import { resolveColoring } from '@app/views/three/colorBy';
import { fileOf } from './projectStore.fixtures';
import { openProject, setFunctionColour, setProjectFunctions } from './projectStore';

/** Function colours (20 November 2026): own colour → toolkit colour → automatic, everywhere. */
const coloured = { 'toolkits/lab/functions/gallery.ts': { default: { id: 'gallery', label: 'Gallery', colour: '#AA3311' } } };
const open = () => openProject(fileOf(), { kind: 'created', label: 'test' });

describe('function colours', () => {
  it('resolve the project colour, then the toolkit colour, then the automatic colour', async () => {
    const toolkit = await labToolkit(coloured);
    const plain = functionColourResolver(toolkit);
    expect(plain('gallery')).toBe('#aa3311'); // toolkit colour, in lowercase
    expect(plain('studio')).toBe(typeColor('studio')); // no colour declared
    expect(plain('kiosk')).toBe(typeColor('kiosk')); // not a function of the toolkit
    const own = functionColourResolver(toolkit, { gallery: '#00ff00', studio: '#0000ff' });
    expect(own('gallery')).toBe('#00ff00');
    expect(own('studio')).toBe('#0000ff');
    expect(functionColourResolver(null)('gallery')).toBe(typeColor('gallery'));
    // A malformed stored colour is never used.
    expect(functionColourResolver(toolkit, { gallery: 'red' })('gallery')).toBe('#aa3311');
    expect(defaultFunctionColour(toolkit, 'gallery')).toBe('#aa3311');
    expect(typeAppearance(toolkit, 'gallery').color).toBe('#aa3311');
  });

  it('a project function takes its own colour or the automatic one', async () => {
    const toolkit = withProjectFunctions(await labToolkit(), [{ id: 'kiosk', label: 'Kiosk' }]);
    expect(functionColourResolver(toolkit)('kiosk')).toBe(typeColor('kiosk'));
    expect(functionColourResolver(toolkit, { kiosk: '#123abc' })('kiosk')).toBe('#123abc');
  });

  it('a toolkit colour must be "#rrggbb": anything else disables the definition', async () => {
    expect(functionDefinitionSchema.safeParse({ id: 'a', label: 'A', colour: '#12ab9F' }).success).toBe(true);
    for (const colour of ['red', '#fff', '#12345g', '12ab9f', 7]) expect(functionDefinitionSchema.safeParse({ id: 'a', label: 'A', colour }).success).toBe(false);
    const bad = { 'toolkits/lab/functions/gallery.ts': { default: { id: 'gallery', label: 'Gallery', colour: 'red' } } };
    const { activation } = await activate(fakeGlobs({ ...LAB_FILES, ...bad }), { query: 'lab' });
    expect(activation.status === 'active' && activation.toolkit.functions.find((f) => f.id === 'gallery')?.status.ok).toBe(false);
    if (activation.status === 'active') expect(defaultFunctionColour(activation.toolkit, 'gallery')).toBe(typeColor('gallery'));
  });

  it('are stored in the project file in sorted order, validated, and absent when none is set', () => {
    const plain = serializeProjectFile(fileOf());
    expect(plain).not.toContain('functionColours');
    const file = fileOf();
    const text = serializeProjectFile({ ...file, settings: { ...file.settings, functionColours: { studio: '#0000ff', gallery: '#00ff00' } } });
    expect(text.indexOf('"gallery": "#00ff00"')).toBeLessThan(text.indexOf('"studio": "#0000ff"'));
    const read = readProjectFile(text);
    expect(read.ok && read.value.settings.functionColours).toEqual({ gallery: '#00ff00', studio: '#0000ff' });
    expect(read.ok && serializeProjectFile(read.value)).toBe(text);
    for (const bad of [{ gallery: 'green' }, { gallery: '#00FF00' }, { 'Bad Id': '#00ff00' }]) {
      const broken = JSON.parse(plain);
      broken.settings.functionColours = bad;
      expect(readProjectFile(JSON.stringify(broken)).ok).toBe(false);
    }
  });

  it('are set and reset in the open project (lowercase; reset removes the entry; same colour = no change)', () => {
    const p0 = open();
    const p1 = setFunctionColour(p0, 'gallery', '#ABCDEF');
    expect(p1.meta.settings.functionColours).toEqual({ gallery: '#abcdef' });
    expect(setFunctionColour(p1, 'gallery', '#abcdef')).toBe(p1);
    expect(setFunctionColour(p1, 'gallery', 'blue')).toBe(p1);
    const p2 = setFunctionColour(p1, 'gallery', null);
    expect(p2.meta.settings.functionColours).toBeUndefined();
    expect(setFunctionColour(p2, 'gallery', null)).toBe(p2);
  });

  it('removing a project function removes its colour; hiding a toolkit function keeps it', () => {
    let p = setProjectFunctions(open(), [{ id: 'kiosk', label: 'Kiosk' }]);
    p = setFunctionColour(setFunctionColour(p, 'kiosk', '#111111'), 'gallery', '#222222');
    const hidden = setProjectFunctions(p, [{ id: 'kiosk', label: 'Kiosk' }], ['gallery']);
    expect(hidden.meta.settings.functionColours).toEqual({ gallery: '#222222', kiosk: '#111111' });
    const removed = setProjectFunctions(hidden, [], ['gallery']);
    expect(removed.meta.settings.functionColours).toEqual({ gallery: '#222222' });
  });

  it('colour the 3D views and their legend with the same resolver', async () => {
    const colourOf = functionColourResolver(await labToolkit(coloured), { studio: '#0000ff' });
    const nodes = [
      { id: 1, function: 'gallery', custom: {} },
      { id: 2, function: 'studio', custom: {} },
    ];
    const c = resolveColoring(nodes, [], { kind: 'type' }, undefined, colourOf);
    expect(c.colorOf.get(1)).toBe('#aa3311');
    expect(c.colorOf.get(2)).toBe('#0000ff');
    expect(c.legend.map((l) => l.color)).toEqual(['#aa3311', '#0000ff']);
  });
});
