import {
  type DesignDocumentV2,
  effectiveLook,
  functionLooks,
  functionStyleSettings,
  type Look,
  readDesignJson,
  serializeDesignV2,
  styleSetupOf,
  validateDocumentV2,
} from '@app/document';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { exampleFacadeProvider, type FacadeProvider } from '@app/building';
import { expectOk } from '@app/document/test-fixtures';
import { labToolkit } from '@app/extensions/test-fixtures';
import { applyDesignCommand, proposeSpatialEdit, resolveRelationships, type DesignCommand, type DesignPort } from '@app/spatial';
import { createHistory, record, redo, undo } from '@app/session/history';
import { buildProjectViewContext, projectFacadeProvider } from '@app/views/project';
import { selectEdge, selectNode } from '@core/viewer/selection';
import { DesignerPanel } from './DesignerPanel';
import { setFacadeModeEdit as modeEdit } from './designerModel';
import {
  designerTypeRows,
  parseWindowPercent,
  resetTypeEdit,
  selectedRelationship,
  setRoofEdit,
  setWindowFractionEdit,
  setWindowLayoutEdit,
  setWallsEdit,
  type DesignerEdit,
} from './designerModel';
import { buildBuildingV2 } from '@app/building';
import { DesignerGuideContent } from './DesignerGuide';
import type { FacadeAssetV1 } from '@app/assets';
import { confirmAndRemoveFacade, FacadeLibrarySection, removeFacadeQuestion } from './FacadeLibraryPanel';
import { FacadeMaterialsDialog } from './FacadeMaterialsDialog';

/** g1, g2 (gallery), s1 (studio), k1 (kiosk: not defined by the lab project), touching g1–g2. */
function labDocV2(typeAppearance: Record<string, unknown> = {}): DesignDocumentV2 {
  return expectOk(
    validateDocumentV2({
      schemaVersion: 2,
      metadata: { name: 'Lab v2' },
      nodes: [
        { id: 1, grid: [0, 0, 0], typeId: 'gallery' },
        { id: 2, grid: [1, 0, 0], typeId: 'gallery' },
        { id: 3, grid: [0, 2, 0], typeId: 'studio' },
        { id: 4, grid: [6, 6, 0], typeId: 'kiosk' },
      ],
      edges: [
        { id: 1, source: 1, target: 2, kind: 'access' },
        { id: 2, source: 1, target: 4, kind: 'open', corridor: { roof: 'none' } },
      ],
      settings: functionStyleSettings(typeAppearance as Record<string, Look>),
    }),
  );
}

function commandOf(edit: DesignerEdit): DesignCommand {
  if (edit.kind !== 'command') throw new Error(`expected a command, got ${JSON.stringify(edit)}`);
  return edit.command;
}

const apply = (doc: DesignDocumentV2, edit: DesignerEdit) => expectOk(applyDesignCommand(doc, commandOf(edit)));

/** Window coverage per function in a design (its card → Default → the project's provider). */
const designFacadeProvider = (doc: Pick<DesignDocumentV2, 'settings'>, project: FacadeProvider) => (typeId: string) => ({
  windowFraction: effectiveLook(styleSetupOf(doc.settings, 'function'), { kind: 'value', value: typeId }, project(typeId)).windowFraction,
});
/** Roof per function in a design. */
const designRoofOf = (doc: Pick<DesignDocumentV2, 'settings'>, typeId: string) =>
  effectiveLook(styleSetupOf(doc.settings, 'function'), { kind: 'value', value: typeId }, { windowFraction: 0 }).roof;

describe('designer type rows', () => {
  it('lists project types first, then design-only types, with project defaults and node counts', async () => {
    const project = await labToolkit();
    const rows = designerTypeRows(labDocV2(), project, projectFacadeProvider(project));
    expect(rows.map((r) => r.typeId)).toEqual(['gallery', 'studio', 'kiosk']);
    const [gallery, studio, kiosk] = rows;
    expect(gallery).toMatchObject({
      name: 'Gallery (gallery)',
      nodeCount: 2,
      projectDefault: { windowFraction: 0.6, source: 'type-definition' },
      effective: { windowFraction: 0.6, roof: 'flat', source: { windowFraction: 'base', roof: 'base' } },
      hasOverride: false,
      warning: null,
    });
    // Studio declares no façade: the existing fallback is inherited.
    expect(studio!.projectDefault).toEqual({ windowFraction: exampleFacadeProvider('studio').windowFraction, source: 'fallback' });
    expect(kiosk!.status.kind).toBe('undefined-type');
    expect(kiosk!.warning).toMatch(/does not define "kiosk"/);
  });

  it('shows a new student-defined type automatically, even before any room uses it', async () => {
    const pavilionType = { id: 'pavilion', label: 'Pavilion', facade: { windowFraction: 0.9 } };
    const project = await labToolkit({ 'toolkits/lab/types/pavilion.ts': { default: pavilionType } });
    const rows = designerTypeRows(labDocV2(), project, projectFacadeProvider(project));
    const pavilion = rows.find((r) => r.typeId === 'pavilion');
    expect(pavilion).toMatchObject({ name: 'Pavilion (pavilion)', nodeCount: 0, orphanOverride: false, warning: null });
    expect(pavilion!.effective.windowFraction).toBe(0.9);
  });

  it('flags a broken type definition instead of silently using it', async () => {
    const project = await labToolkit({ 'toolkits/lab/types/studio.ts': { default: { id: 'studio', label: 42 } } });
    const studio = designerTypeRows(labDocV2(), project, projectFacadeProvider(project)).find((r) => r.typeId === 'studio')!;
    expect(studio.status.kind).toBe('broken');
    expect(studio.projectDefault.source).toBe('broken');
    expect(studio.warning).toMatch(/invalid/);
  });

  it('keeps an orphan override visible so it can be reset', () => {
    const rows = designerTypeRows(labDocV2({ ghost: { roof: 'none' } }), null, exampleFacadeProvider);
    const ghost = rows.find((r) => r.typeId === 'ghost')!;
    expect(ghost).toMatchObject({ orphanOverride: true, hasOverride: true });
    expect(ghost.warning).toMatch(/No room uses this type/);
  });

  it('works without a project (existing fallback façades)', () => {
    const rows = designerTypeRows(labDocV2(), null, exampleFacadeProvider);
    expect(rows.map((r) => [r.typeId, r.effective.windowFraction, r.warning])).toEqual([
      ['gallery', 0.7, null],
      ['kiosk', 0.15, null],
      ['studio', 0.25, null],
    ]);
  });
});

describe('designer edits', () => {
  it('a design override beats the project default for every room of the type, and reset restores inheritance', async () => {
    const project = await labToolkit();
    const facade = projectFacadeProvider(project);
    const doc = labDocV2();
    const edited = apply(doc, setWindowFractionEdit(doc, 'gallery', 0.35, 0.6));
    expect(functionLooks(edited.settings)).toEqual({ gallery: { windowFraction: 0.35 } });

    const effective = designFacadeProvider(edited, facade);
    for (const node of edited.nodes.filter((n) => n.typeId === 'gallery')) expect(effective(node.typeId).windowFraction).toBe(0.35);
    expect(effective('studio')).toEqual(facade('studio'));

    const row = designerTypeRows(edited, project, facade).find((r) => r.typeId === 'gallery')!;
    expect(row.effective.source.windowFraction).toBe('card');
    expect(row.projectDefault.windowFraction).toBe(0.6);

    const reset = apply(edited, resetTypeEdit(edited, 'gallery'));
    expect(functionLooks(reset.settings)).toEqual({});
    expect(designFacadeProvider(reset, facade)('gallery').windowFraction).toBe(0.6);
  });

  it('never alters the toolkit definition or another design', async () => {
    const project = await labToolkit();
    const definitionBefore = JSON.stringify(project.nodeTypes.map((t) => t.definition));
    const designA = labDocV2();
    const designB = labDocV2();
    const textB = serializeDesignV2(designB);
    const editedA = apply(designA, setWindowFractionEdit(designA, 'gallery', 0.1, 0.6));
    expect(functionLooks(editedA.settings).gallery).toEqual({ windowFraction: 0.1 });
    expect(functionLooks(designA.settings)).toEqual({});
    expect(serializeDesignV2(designB)).toBe(textB);
    expect(JSON.stringify(project.nodeTypes.map((t) => t.definition))).toBe(definitionBefore);
    expect(projectFacadeProvider(project)('gallery').windowFraction).toBe(0.6);
  });

  it('sends nothing when the value would not change (no empty history step)', () => {
    const doc = labDocV2({ studio: { windowFraction: 0.5 } });
    expect(setWindowFractionEdit(doc, 'gallery', 0.6, 0.6).kind).toBe('unchanged');
    expect(setWindowFractionEdit(doc, 'studio', 0.5, 0.25).kind).toBe('unchanged');
    expect(setRoofEdit(doc, 'gallery', 'flat').kind).toBe('unchanged');
    expect(resetTypeEdit(doc, 'gallery').kind).toBe('unchanged');
    // An explicit override equal to the project default is still a real change.
    expect(setWindowFractionEdit(doc, 'studio', 0.25, 0.25).kind).toBe('command');
  });

  it('validates window coverage bounds', () => {
    const doc = labDocV2();
    for (const bad of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(setWindowFractionEdit(doc, 'gallery', bad, 0.6).kind).toBe('invalid');
    }
    expect(parseWindowPercent('35')).toEqual({ ok: true, fraction: 0.35 });
    expect(parseWindowPercent(' 12.5 % ')).toEqual({ ok: true, fraction: 0.125 });
    expect(parseWindowPercent('0')).toEqual({ ok: true, fraction: 0 });
    expect(parseWindowPercent('100%')).toEqual({ ok: true, fraction: 1 });
    for (const bad of ['', 'abc', '-1', '101', '1e3', '50 50']) expect(parseWindowPercent(bad).ok).toBe(false);
    // The frozen command validates too: an out-of-range patch is rejected, not clamped.
    expect(applyDesignCommand(doc, { type: 'set-look', by: 'function', group: { kind: 'value', value: 'gallery' }, patch: { windowFraction: 2 } }).ok).toBe(false);
  });

  it('roof override and per-field reset keep the other override', () => {
    const doc = labDocV2();
    const roofless = apply(doc, setRoofEdit(doc, 'studio', 'none'));
    expect(designRoofOf(roofless, 'studio')).toBe('none');
    expect(designRoofOf(roofless, 'gallery')).toBe('flat');
    expect(setRoofEdit(roofless, 'studio', 'pitched').kind).toBe('invalid');
    const both = apply(roofless, setWindowFractionEdit(roofless, 'studio', 0.4, 0.25));
    const windowOnly = apply(both, resetTypeEdit(both, 'studio', 'roof'));
    expect(functionLooks(windowOnly.settings)).toEqual({ studio: { windowFraction: 0.4 } });
  });
});

describe('window layout per function', () => {
  it('Stretch is stored per type, reset restores Repeat, and unchanged choices send nothing', () => {
    const doc = labDocV2();
    expect(setWindowLayoutEdit(doc, 'gallery', 'repeat').kind).toBe('unchanged');
    expect(setWindowLayoutEdit(doc, 'gallery', 'scatter').kind).toBe('invalid');
    const edit = setWindowLayoutEdit(doc, 'gallery', 'stretch');
    expect(edit.kind === 'command' && edit.label).toBe('Set gallery windows to Stretch');
    const stretched = apply(doc, edit);
    expect(functionLooks(stretched.settings)).toEqual({ gallery: { windowLayout: 'stretch' } });
    expect(setWindowLayoutEdit(stretched, 'gallery', 'stretch').kind).toBe('unchanged');
    const both = apply(stretched, setWindowFractionEdit(stretched, 'gallery', 0.4, 0.6));
    expect(functionLooks(apply(both, resetTypeEdit(both, 'gallery', 'windowLayout')).settings)).toEqual({ gallery: { windowFraction: 0.4 } });
    expect(functionLooks(apply(both, resetTypeEdit(both, 'gallery')).settings)).toEqual({});
  });

  it('Open walls and Pergola roofs are per function: stored, reset and drawn', () => {
    const doc = labDocV2();
    expect(setWallsEdit(doc, 'kiosk', 'enclosed').kind).toBe('unchanged');
    expect(setWallsEdit(doc, 'kiosk', 'half').kind).toBe('invalid');
    const open = apply(doc, setWallsEdit(doc, 'kiosk', 'open'));
    expect(functionLooks(open.settings)).toEqual({ kiosk: { walls: 'open' } });
    const text = serializeDesignV2(apply(open, setRoofEdit(open, 'kiosk', 'pergola')));
    expect(functionLooks(expectOk(readDesignJson(text)).doc.settings)).toEqual({ kiosk: { walls: 'open', roof: 'pergola' } });
    expect(functionLooks(apply(open, resetTypeEdit(open, 'kiosk', 'walls')).settings)).toEqual({});

    const parts = (typeAppearance: Record<string, unknown>, owner: number) =>
      buildBuildingV2(labDocV2(typeAppearance), { facade: exampleFacadeProvider }).elements.filter((e) => e.ownerNodeId === owner);
    const P = 0.15 + 1e-9;
    // Open + flat roof: no glazing; the only exterior wall parts are slim posts; the roof stays.
    const pavilion = parts({ kiosk: { walls: 'open' } }, 4);
    expect(pavilion.some((e) => e.part === 'glazing')).toBe(false);
    const posts = pavilion.filter((e) => e.part === 'wall' && e.condition === 'exterior');
    expect(posts.length).toBe(8); // two per side, four sides
    expect(posts.every((e) => [e.size[0], e.size[2]].filter((d) => d <= P).length === 2)).toBe(true);
    expect(pavilion.filter((e) => e.part === 'roof')).toHaveLength(1);
    // Open + no roof: a floor only.
    const terrace = parts({ kiosk: { walls: 'open', roof: 'none' } }, 4);
    expect(terrace.map((e) => e.part).sort()).toEqual(['slab']);
    // Pergola roof on an enclosed room: open slats instead of one roof plate; walls unchanged.
    const pergola = parts({ studio: { roof: 'pergola' } }, 3);
    expect(pergola.filter((e) => e.part === 'roof')).toHaveLength(6);
    expect(parts({}, 3).filter((e) => e.part === 'wall').length).toBe(pergola.filter((e) => e.part === 'wall').length);
    // A wall shared with another room stays even when the room is open-sided.
    const g1 = parts({ gallery: { walls: 'open' } }, 1);
    expect(g1.some((e) => e.part === 'wall' && e.condition === 'door')).toBe(true);
  });

  it('the Building changes the windows of the Stretch function only', () => {
    const glass = (typeAppearance: Record<string, unknown>, typeId: string) =>
      buildBuildingV2(labDocV2(typeAppearance), { facade: exampleFacadeProvider })
        .elements.filter((e) => e.part === 'glazing' && e.ownerTypeId === typeId)
        .map((e) => `${e.position.join(',')}|${e.size.join(',')}`)
        .sort();
    const base = { gallery: { windowFraction: 0.5 }, studio: { windowFraction: 0.5 } };
    const stretched = { gallery: { windowFraction: 0.5, windowLayout: 'stretch' }, studio: { windowFraction: 0.5 } };
    expect(glass(stretched, 'gallery').length).toBeGreaterThan(0);
    expect(glass(stretched, 'studio')).toEqual(glass(base, 'studio'));
  });
});

describe('designer persistence and history', () => {
  it('v2 export/import preserves overrides and does not materialise defaults', () => {
    let doc = labDocV2();
    doc = apply(doc, setWindowFractionEdit(doc, 'gallery', 0.35, 0.6));
    doc = apply(doc, setRoofEdit(doc, 'kiosk', 'none'));
    const text = serializeDesignV2(doc);
    expect(text).not.toMatch(/"studio":/); // inherited types are not written
    const read = expectOk(readDesignJson(text));
    expect(functionLooks(read.doc.settings)).toEqual({ gallery: { windowFraction: 0.35 }, kiosk: { roof: 'none' } });
    expect(serializeDesignV2(read.doc)).toBe(text);
  });

  it('one committed change is one undoable history step', () => {
    const doc = labDocV2();
    let history = createHistory(doc);
    const edit = setWindowFractionEdit(doc, 'gallery', 0.2, 0.6);
    history = record(history, apply(doc, edit), edit.kind === 'command' ? edit.label : null);
    expect(history.past).toHaveLength(1);
    expect(history.past[0]!.label).toBe('Set gallery window coverage to 20 %');
    history = undo(history);
    expect(functionLooks(history.present.settings)).toEqual({});
    history = redo(history);
    expect(functionLooks(history.present.settings)).toEqual({ gallery: { windowFraction: 0.2 } });
  });
});

describe('selected relationship summary', () => {
  it('summarises the selected relationship corridor look for Properties', () => {
    const doc = labDocV2();
    const spatial = resolveRelationships(doc);
    expect(selectedRelationship(doc, selectEdge(2), spatial)).toMatchObject({
      edgeId: 2,
      label: '1 → 4',
      corridor: { walls: 'open', roof: 'none' },
      corridorIsDefault: false,
    });
    expect(selectedRelationship(doc, selectEdge(1), spatial)).toMatchObject({ corridor: { walls: 'open', roof: 'flat' }, corridorIsDefault: true, status: 'direct' });
    expect(selectedRelationship(doc, selectNode(1), spatial)).toBeNull();
    expect(selectedRelationship(doc, selectEdge(999), spatial)).toBeNull();
  });
});

describe('DesignerPanel (static render)', () => {
  function fakePort(doc: DesignDocumentV2, sent: DesignCommand[] = []): DesignPort {
    return {
      doc,
      spatial: resolveRelationships(doc),
      onCommand: (command) => {
        sent.push(command);
        const result = applyDesignCommand(doc, command);
        return result.ok ? { ok: true } : { ok: false, issues: result.issues };
      },
      proposeEdit: (request) => proposeSpatialEdit(doc, request),
    };
  }

  it('each function card has a Repeat | Stretch layout choice, and the guide opens from "How it works"', () => {
    const doc = labDocV2({ studio: { windowLayout: 'stretch' } });
    const html = renderToStaticMarkup(createElement(DesignerPanel, { design: fakePort(doc) }));
    expect(html).toMatch(/role="radiogroup" aria-labelledby="sgl-designer--default-layout"/);
    const studioStretch = html.match(/<input[^>]*name="sgl-designer-studio-layout"[^>]*value="stretch"[^>]*>/)?.[0] ?? '';
    const defaultStretch = html.match(/<input[^>]*name="sgl-designer--default-layout"[^>]*value="stretch"[^>]*>/)?.[0] ?? '';
    expect(studioStretch).toContain('checked');
    expect(defaultStretch).not.toBe('');
    expect(defaultStretch).not.toContain('checked');
    // Gallery has no card of its own: it is offered in "+ Style another function".
    expect(html).not.toContain('name="sgl-designer-gallery-layout"');
    expect(html).toMatch(/<option value="gallery">gallery · 2 rooms<\/option>/);
    expect(html).toMatch(/aria-haspopup="dialog"[^>]*>How it works<\/button>/);
    expect(html).not.toContain('data-help-topic="designer-windows"');
  });

  it('every function card is collapsed by default, with a one-line summary in its header', () => {
    const doc = labDocV2({ studio: { windowLayout: 'stretch', windowFraction: 0.4 } });
    const html = renderToStaticMarkup(createElement(DesignerPanel, { design: fakePort(doc) }));
    const heads = html.match(/<button type="button" class="sgl-designer-type-head"[^>]*>/g) ?? [];
    expect(heads.length).toBe(3); // Default + the studio card + Corridors
    for (const head of heads) expect(head).toContain('aria-expanded="false"');
    expect(html).toMatch(/id="sgl-designer-studio-body" class="sgl-designer-type-body" hidden=""/);
    expect(html).toMatch(/40 % · Stretch · Flat roof · 1 room · changed/);
  });

  it('the guide has a clear order: title, lead, numbered Façade geometry / Windows / Layout / Roof, then defaults', () => {
    const html = renderToStaticMarkup(createElement(DesignerGuideContent, { titleId: 't', descriptionId: 'd' }));
    const order = ['<h2 id="t"', '<p id="d"', '>1</span> Façade geometry', '>2</span> Windows', '>3</span> Layout: Repeat or Stretch', '>4</span> Roof', 'Defaults and reset'].map((x) => html.indexOf(x));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('data-diagram="repeat-stretch"');
  });

  it('explains that it is unavailable without an open design', () => {
    const html = renderToStaticMarkup(createElement(DesignerPanel, {}));
    expect(html).toMatch(/Open a project to style its rooms/);
    expect(html).not.toMatch(/<input/);
  });

  it('renders one row per type with window coverage, roof, reset and warnings', async () => {
    const project = await labToolkit();
    const noRooms = { nodes: [] };
    const context = buildProjectViewContext(project, noRooms);
    const doc = labDocV2({ gallery: { windowFraction: 0.35 }, kiosk: {} });
    const html = renderToStaticMarkup(
      createElement(DesignerPanel, { design: fakePort(doc), project: context, selection: selectEdge(2), onShowRelationship: () => {} }),
    );
    expect(html).toMatch(/<label for="sgl-designer-style-by"[^>]*>Style rooms by<\/label>/);
    expect(html).toMatch(/Gallery \(gallery\)/);
    // Studio has no card: offered in the add menu with its room count.
    expect(html).toMatch(/<option value="studio">Studio \(studio\) · 1 room<\/option>/);
    expect(html).toMatch(/does not define &quot;kiosk&quot;/);
    expect(html).toMatch(/exterior walls/);
    expect(html).toMatch(/value="35"/);
    expect(html).toContain('Set here (otherwise project default, 60 %)');
    expect(html).toMatch(/Reset Default/);
    expect(html).toMatch(/Clear this card/);
    expect((html.match(/>Remove card</g) ?? []).length).toBe(2); // gallery and kiosk; Default cannot be removed
    // No highlight button without a view that can show it (no provider).
    expect(html).not.toContain('sgl-designer-highlight');
    expect(html).toMatch(/None \(open top\)/);
    expect(html).not.toMatch(/Edit in Properties/);
    // Without a façade library there is no 3DM import.
    expect(html).not.toMatch(/Import \.3dm/);
  });

  it('each function card has Façade and Roof subsections; façade geometry Open / Automatic / Import (Automatic by default)', async () => {
    const project = await labToolkit();
    const noRooms = { nodes: [] };
    const context = buildProjectViewContext(project, noRooms);
    const facades = { assets: [], add: () => ({ ok: true as const }), remove: () => ({ ok: true as const }), rename: () => ({ ok: true as const }), setMaterials: () => ({ ok: true as const }) };
    const full = renderToStaticMarkup(createElement(DesignerPanel, { design: fakePort(labDocV2({ studio: { walls: 'open' } })), project: context, facades }));
    // Room cards only: the Corridors card (last in the list) has its own Walls and Roof (corridors.test.ts).
    const html = full.slice(0, full.indexOf('<article class="sgl-designer-type sgl-designer-corridors"'));
    const cards = html.split('<article').length - 1;
    expect(cards).toBe(2);
    // Two collapsible subsections per card (open by default): Façade (geometry: Open / Automatic / Import) and Roof.
    expect(html.split('>Façade</button></h5>').length - 1).toBe(cards);
    expect(html.split('>Roof</button></h5>').length - 1).toBe(cards);
    expect(html.split('class="sgl-designer-subsection-toggle" aria-expanded="true"').length - 1).toBe(2 * cards);
    expect(html.split('>Geometry<').length - 1).toBe(cards);
    expect(html).not.toMatch(/>Walls</);
    for (const m of ['open', 'automatic', 'import']) expect(html.split(`value="${m}"`).length - 1).toBe(cards);
    // Automatic shows the window controls; Open does not; Import controls only in Import mode.
    expect(html).toMatch(/checked="" value="automatic"/);
    expect(html).toMatch(/checked="" value="open"/);
    expect(html).not.toMatch(/Import \.3dm/);
    expect(modeEdit(labDocV2({}), 'gallery', 'open')).toMatchObject({ kind: 'command', command: { patch: { walls: 'open', facade: null } } });
    expect(modeEdit(labDocV2({}), 'gallery', 'automatic').kind).toBe('unchanged');
    expect(modeEdit(labDocV2({}), 'gallery', 'import').kind).toBe('invalid');
    const module = { assetId: 'facade-0123456789abcdef', placement: 'stretch' as const, flip: true as const };
    expect(modeEdit(labDocV2({ gallery: { walls: 'open' } }), 'gallery', 'import', module)).toMatchObject({ command: { patch: { walls: null, facade: module } } });
    // Door / open bay variants are part of the module: adding one is a change, the same module is not.
    const withDoor = { ...module, door: { assetId: 'facade-00000000000000aa' } };
    expect(modeEdit(labDocV2({ gallery: { facade: module } }), 'gallery', 'import', module).kind).toBe('unchanged');
    expect(modeEdit(labDocV2({ gallery: { facade: module } }), 'gallery', 'import', withDoor)).toMatchObject({ command: { patch: { facade: withDoor } } });
    expect(modeEdit(labDocV2({ gallery: { facade: withDoor } }), 'gallery', 'import', module)).toMatchObject({ command: { patch: { facade: module } } });
  });

  it('Import layout: façade menu and Import .3dm… on one row; Outside and Placement on one row; optional Door / Open bays', async () => {
    const project = await labToolkit();
    const noRooms = { nodes: [] };
    const context = buildProjectViewContext(project, noRooms);
    const A = 'facade-0123456789abcdef';
    const D = 'facade-00000000000000aa';
    const asset = (id: string, name: string) =>
      ({ id, name, size: [3, 3, 0.2], mesh: { triangles: 12 }, source: { fileName: `${name}.3dm`, unit: 'm', unitAssumed: false }, warnings: [], groups: [] }) as unknown as FacadeAssetV1;
    const ok = () => ({ ok: true as const });
    const facades = { assets: [asset(A, 'Bay'), asset(D, 'Door bay module')], add: ok, remove: ok, rename: ok, setMaterials: ok };
    const doc = labDocV2({ gallery: { facade: { assetId: A, placement: 'repeat', door: { assetId: D } } } });
    const html = renderToStaticMarkup(createElement(DesignerPanel, { design: fakePort(doc), project: context, facades }));
    const gallery = html.slice(html.indexOf('id="sgl-designer-gallery-facade"') - 400);
    // One import row per module slot (wall, door, open): the menu sits before its Import button in the same row.
    const rows = gallery.split('<div class="sgl-designer-import">').slice(1, 4);
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.indexOf('<select')).toBeLessThan(row.indexOf('Import .3dm'));
    // Materials… sits between the menu and Import (façade and the set Door bay; not the Automatic Open bay).
    for (const row of rows.slice(0, 2)) {
      const at = row.indexOf('>Materials…<');
      expect(at).toBeGreaterThan(row.indexOf('<select'));
      expect(at).toBeLessThan(row.indexOf('Import .3dm'));
    }
    expect(rows[2]!.slice(0, rows[2]!.indexOf('Import .3dm'))).not.toContain('Materials…');
    // Outside and Placement together in one row.
    const pair = gallery.slice(gallery.indexOf('class="sgl-designer-pair"'));
    expect(pair.indexOf('>Outside<')).toBeLessThan(pair.indexOf('>Placement<'));
    expect(pair.indexOf('>Placement<')).toBeLessThan(pair.indexOf('One module per 3 m bay'));
    // Door bay set (with its own Outside), Open bay left Automatic; the summary mentions the door.
    expect(gallery).toContain('Door bay <small>(optional)</small>');
    expect(gallery).toContain('Open bay <small>(optional)</small>');
    expect(gallery.split('>Outside<').length - 1).toBe(2);
    expect(html).toMatch(/Bay \(Repeat\) \+ door/);
    // The Door bay (set) has its own Materials…; Open bay (Automatic) has none.
    expect(gallery.split('>Materials…<').length - 1).toBe(2);

    // Project → Imported façades: collapsible, lists every façade with Materials… and Remove, and imports.
    const library = renderToStaticMarkup(createElement(FacadeLibrarySection, { facades }));
    expect(library).toContain('data-section="project-facades"');
    expect(library).toContain('aria-expanded="false"');
    expect(library).toContain('Import .3dm');
    expect(library.split('>Remove<').length - 1).toBe(4); // a Remove button per façade, and Remove beside Rename in its details
    expect(library.split('>Materials…<').length - 1).toBe(2);
  });

});

describe('removing a used façade (confirmation) and the Materials dialog', () => {
  const asset = { id: 'facade-0123456789abcdef', name: 'Bay' } as unknown as FacadeAssetV1;
  const library = (uses: { scenario: string; cards: string[] }[]) => {
    const calls: unknown[] = [];
    const facades = {
      assets: [asset],
      add: () => ({ ok: true as const }),
      remove: (id: string, options?: { replaceUses?: boolean }) => (calls.push([id, options]), { ok: true as const }),
      rename: () => ({ ok: true as const }),
      setMaterials: () => ({ ok: true as const }),
      uses: () => uses,
    };
    return { facades, calls };
  };

  it('an unused façade is removed without asking', () => {
    const { facades, calls } = library([]);
    let asked = false;
    expect(confirmAndRemoveFacade(facades, asset, () => ((asked = true), true))).toBe('Removed “Bay”.');
    expect(asked).toBe(false);
    expect(calls).toEqual([[asset.id, { replaceUses: false }]]);
  });

  it('a used façade asks first, names where it is used; Cancel keeps it, OK replaces its uses with Automatic', () => {
    const uses = [{ scenario: 'Scenario 1', cards: ['gallery', 'studio'] }, { scenario: 'Option B', cards: ['gallery'] }];
    const question = removeFacadeQuestion(asset, uses);
    expect(question).toContain('Scenario 1: gallery, studio');
    expect(question).toContain('Option B: gallery');
    expect(question).toMatch(/go back to Automatic/);
    const cancelled = library(uses);
    expect(confirmAndRemoveFacade(cancelled.facades, asset, () => false)).toBeNull();
    expect(cancelled.calls).toEqual([]);
    const confirmed = library(uses);
    expect(confirmAndRemoveFacade(confirmed.facades, asset, () => true)).toBe('Removed “Bay”; 3 styles are Automatic again.');
    expect(confirmed.calls).toEqual([[asset.id, { replaceUses: true }]]);
  });

  it('the Materials dialog shows a 3D preview, use tabs and Solid / Glass / Open per part (names select the part)', () => {
    const groups = [
      { name: 'Frame', color: '#333333', glass: false, start: 0, count: 1 },
      { name: 'Pane', color: '#88aacc', glass: true, start: 1, count: 1 },
    ];
    // No valid mesh: the preview frame says so instead of failing; the list stays usable.
    const withGroups = { ...asset, size: [3, 3, 0.2], groups } as unknown as FacadeAssetV1;
    const { facades } = library([]);
    const html = renderToStaticMarkup(createElement(FacadeMaterialsDialog, { asset: withGroups, facades, onClose: () => {}, role: 'door' }));
    expect(html).toContain('class="sgl-designer-materials-preview"');
    expect(html).toContain('The 3D preview is not available');
    for (const tab of ['>Façade<', '>Door bay<', '>Open bay<']) expect(html).toContain(tab);
    expect(html).toContain('Same as Façade');
    expect(html.split('>Open</label>').length - 1).toBe(2);
    expect(html.split('class="sgl-link sgl-designer-materials-name"').length - 1).toBe(2);
  });
});
