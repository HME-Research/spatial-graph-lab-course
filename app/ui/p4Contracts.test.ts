import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTE_SECTION_IDS,
  ATTRIBUTE_SECTIONS,
  EDGE_BUILT_IN_ATTRIBUTES,
  NODE_BUILT_IN_ATTRIBUTES,
  canDeleteCustomAttribute,
  customAttributeTag,
} from '@app/attributes/sections';
import {
  ANALYSE_SECTION_IDS,
  ANALYSE_SECTIONS,
  BUILT_IN_ANALYSES,
  analyseSectionFor,
  inputPrompts,
  pickMismatch,
  sourceTag,
} from './analysisSections';
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
    // Position and Size: ONE attribute each, three values x | y | z (owner 2026-11-19).
    expect(NODE_BUILT_IN_ATTRIBUTES.filter((a) => a.section === 'geometry').map((a) => [a.id, a.axes])).toEqual([
      ['position', ['x', 'y', 'z (Level)']],
      ['size', ['x', 'y', 'z (Floors)']],
    ]);
  });

  it('derives the Analyse section from the exact list of inputs', () => {
    expect(analyseSectionFor([])).toBe('network');
    expect(analyseSectionFor([{ kind: 'node', label: 'Room' }])).toBe('node');
    expect(analyseSectionFor([{ kind: 'edge', label: 'Connection' }])).toBe('edge');
    expect(analyseSectionFor([{ kind: 'node', label: 'From' }, { kind: 'node', label: 'To' }])).toBe('queries');
    expect(analyseSectionFor([{ kind: 'node', label: 'Room' }, { kind: 'edge', label: 'Connection' }])).toBe('queries');
    expect(analyseSectionFor([{ kind: 'number', label: 'Steps' }])).toBe('queries');
    for (const a of BUILT_IN_ANALYSES) expect(ANALYSE_SECTION_IDS).toContain(analyseSectionFor(a.inputs));
  });

  it('derives how inputs are collected: selection for Node/Edge, step-by-step prompts for Queries', () => {
    expect(inputPrompts([{ kind: 'node', label: 'Room' }])).toEqual({ useSelection: true, prompts: [] });
    expect(inputPrompts([])).toEqual({ useSelection: false, prompts: [] });
    const q = inputPrompts([{ kind: 'node', label: 'Room' }, { kind: 'edge', label: 'Connection' }, { kind: 'number', label: 'Steps' }]);
    expect(q.useSelection).toBe(false);
    expect(q.prompts.map((p) => p.text)).toEqual(['Pick Room (a node) in any view', 'Pick Connection (an edge) in any view', 'Steps']);
  });

  it('refuses a picked item of the wrong kind with a readable reason', () => {
    expect(pickMismatch({ kind: 'node', label: 'From' }, 'node')).toBeNull();
    expect(pickMismatch({ kind: 'node', label: 'From' }, 'edge')).toBe('From needs a node, not an edge.');
  });

  it('tags custom attributes by source; only yours can be deleted', () => {
    expect(customAttributeTag({ kind: 'toolkit', toolkitName: 'house' })).toBe('Toolkit: house');
    expect(customAttributeTag({ kind: 'yours' })).toBe('Yours');
    expect(canDeleteCustomAttribute({ kind: 'toolkit', toolkitName: 'house' })).toBe(false);
    expect(canDeleteCustomAttribute({ kind: 'yours' })).toBe(true);
  });

  it('opens Node and Edge by default and collapses Network and Queries', () => {
    expect(ANALYSE_SECTION_IDS.map((id) => ANALYSE_SECTIONS[id].openByDefault)).toEqual([true, true, false, false]);
  });

  it('has unique built-in analyses, at least one shown at start in every section', () => {
    expect(new Set(BUILT_IN_ANALYSES.map((a) => a.id)).size).toBe(BUILT_IN_ANALYSES.length);
    for (const section of ANALYSE_SECTION_IDS) {
      expect(BUILT_IN_ANALYSES.some((a) => analyseSectionFor(a.inputs) === section && a.shownAtStart), section).toBe(true);
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
