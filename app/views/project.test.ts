import { beforeAll, describe, expect, it } from 'vitest';
import { readDesignJson } from '@app/document';
import { buildArchitecture, EXAMPLE_FACADES, exampleFacadeProvider, resolveBuildingFaces, toResolvedFace } from '@app/building';
import { resolveRelationships } from '@app/spatial';
import { expectOk } from '@app/document/test-fixtures';
import { type ActiveToolkit } from '@app/extensions';
import { galleryToolkit } from '@app/extensions/test-toolkit';
import { labDoc, labToolkit } from '@app/extensions/test-fixtures';
import builtInText from '../document/test-designs/two-storey.json?raw';
import {
  BROKEN_TYPE_FACADE,
  brokenTypeIds,
  buildProjectViewContext,
  nodeTypeStatus,
  projectFacadeProvider,
  typeDisplayName,
} from './project';

const builtIn = expectOk(readDesignJson(builtInText)).doc;
const resolveFaces = (d: typeof builtIn) => resolveBuildingFaces(d, resolveRelationships(d)).map(toResolvedFace);
let example: ActiveToolkit;

beforeAll(async () => {
  example = await galleryToolkit();
});

describe('project appearance in the views', () => {
  it('the gallery test toolkit keeps the gallery/studio/storage façades exactly, and the fallback for other types', () => {
    const facade = projectFacadeProvider(example);
    for (const id of ['gallery', 'studio', 'storage']) expect(facade(id)).toEqual(EXAMPLE_FACADES[id]);
    expect(facade('kiosk')).toEqual(exampleFacadeProvider('kiosk'));
    expect(buildArchitecture(resolveFaces(builtIn), { facade })).toEqual(buildArchitecture(resolveFaces(builtIn)));
  });

  it('without a project the architecture is exactly today’s', () => {
    const facade = projectFacadeProvider(null);
    expect(buildArchitecture(resolveFaces(builtIn), { facade })).toEqual(buildArchitecture(resolveFaces(builtIn)));
  });

  it('a project façade declaration is used', async () => {
    const lab = await labToolkit();
    expect(projectFacadeProvider(lab)('gallery')).toEqual({ windowFraction: 0.6 });
    expect(projectFacadeProvider(lab)('studio')).toEqual(EXAMPLE_FACADES['studio']); // no declaration
  });

  it('a broken type definition is visible: closed façade, broken status with its problems', async () => {
    const lab = await labToolkit({ 'toolkits/lab/functions/kiosk.ts': { default: { id: 'kiosk', label: 'Kiosk', facade: { windowFraction: 2 } } } });
    expect(projectFacadeProvider(lab)('kiosk')).toBe(BROKEN_TYPE_FACADE);
    const status = nodeTypeStatus(lab, 'kiosk');
    expect(status.kind).toBe('broken');
    expect(status.kind === 'broken' && status.problems.join(' ')).toContain('windowFraction must be between 0 and 1');
    expect(typeDisplayName(status, 'kiosk')).toBe('Kiosk (kiosk) — invalid definition');
    expect(brokenTypeIds(lab, labDoc())).toEqual(['kiosk']);
    expect(buildProjectViewContext(lab, labDoc()).conformance.map((d) => d.id)).toContain('broken-node-type|node:4');
  });

  it('type status distinguishes registered, undefined and no project', async () => {
    const lab = await labToolkit();
    expect(nodeTypeStatus(lab, 'gallery')).toEqual({ kind: 'registered', label: 'Gallery', file: 'toolkits/lab/functions/gallery.ts' });
    expect(typeDisplayName(nodeTypeStatus(lab, 'gallery'), 'gallery')).toBe('Gallery (gallery)');
    expect(nodeTypeStatus(lab, 'kiosk')).toEqual({ kind: 'undefined-type' });
    expect(nodeTypeStatus(null, 'gallery')).toEqual({ kind: 'no-project' });
    expect(brokenTypeIds(lab, labDoc())).toEqual([]);
    expect(buildProjectViewContext(null, labDoc()).conformance).toEqual([]);
  });
});
