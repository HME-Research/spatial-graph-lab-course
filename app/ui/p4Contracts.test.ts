import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_SECTION_IDS,
  ATTRIBUTE_SECTIONS,
  EDGE_BUILT_IN_ATTRIBUTES,
  NODE_BUILT_IN_ATTRIBUTES,
} from '@app/attributes/sections';
import { ANALYSE_SECTION_IDS, ANALYSE_SECTIONS, BUILT_IN_ANALYSES, analyseSectionFor, sourceTag } from './analysisSections';
import { GUIDE_TAB_IDS, GUIDE_TAB_LABELS } from './guideContracts';

describe('P4 shared definitions', () => {
  it('orders attribute sections identity → required → geometry → custom → calculated', () => {
    expect(ATTRIBUTE_SECTION_IDS).toEqual(['identity', 'required', 'geometry', 'custom', 'calculated']);
    expect(ATTRIBUTE_SECTIONS.identity.editable).toBe(false);
    expect(ATTRIBUTE_SECTIONS.calculated.editable).toBe(false);
  });

  it('lists built-in attributes in section order with unique ids', () => {
    for (const list of [NODE_BUILT_IN_ATTRIBUTES, EDGE_BUILT_IN_ATTRIBUTES]) {
      expect(new Set(list.map((a) => a.id)).size).toBe(list.length);
      const ranks = list.map((a) => ATTRIBUTE_SECTION_IDS.indexOf(a.section));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
    expect(EDGE_BUILT_IN_ATTRIBUTES.filter((a) => a.section === 'identity').map((a) => a.id)).toEqual(['id', 'source', 'target']);
    expect(NODE_BUILT_IN_ATTRIBUTES.filter((a) => a.section === 'geometry').map((a) => a.id)).toEqual([
      'position-x', 'position-y', 'level', 'size-x', 'size-y', 'floors',
    ]);
  });

  it('places analyses by their input declaration', () => {
    expect(analyseSectionFor('node')).toBe('node');
    expect(analyseSectionFor('edge')).toBe('edge');
    expect(analyseSectionFor('none')).toBe('network');
    expect(analyseSectionFor({ query: [{ kind: 'node', label: 'From' }, { kind: 'node', label: 'To' }] })).toBe('queries');
  });

  it('opens Node and Edge by default and collapses Network and Queries', () => {
    expect(ANALYSE_SECTION_IDS.map((id) => ANALYSE_SECTIONS[id].openByDefault)).toEqual([true, true, false, false]);
  });

  it('has unique built-in analyses, at least one shown at start in every section', () => {
    expect(new Set(BUILT_IN_ANALYSES.map((a) => a.id)).size).toBe(BUILT_IN_ANALYSES.length);
    for (const section of ANALYSE_SECTION_IDS) {
      expect(BUILT_IN_ANALYSES.some((a) => a.section === section && a.shownAtStart), section).toBe(true);
    }
  });

  it('labels sources as tags', () => {
    expect(sourceTag({ kind: 'built-in' })).toBe('Built-in');
    expect(sourceTag({ kind: 'toolkit', toolkitName: 'house' })).toBe('Toolkit: house');
    expect(sourceTag({ kind: 'yours' })).toBe('Yours');
  });

  it('has a label for every guide tab', () => {
    for (const id of GUIDE_TAB_IDS) expect(GUIDE_TAB_LABELS[id].length).toBeGreaterThan(0);
  });
});
