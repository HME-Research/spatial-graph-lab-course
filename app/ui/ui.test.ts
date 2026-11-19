import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GraphIssue } from '@app/document';
import type { EdgeResolution } from '@app/spatial';
import { VIEW_MODES } from '@app/views/contracts';
import { DesignerPlaceholder } from './DesignerPlaceholder';
import { Feedback, IssueFeedback } from './Feedback';
import { describeResolution, PROPERTIES_LABEL, SIDEBAR_LABELS, SIDEBAR_SECTIONS, UNRESOLVED_REASON_TEXT, VIEW_LABELS } from './labels';
import { LoadFailureNotice } from './LoadFailureNotice';
import { friendlyMessages, friendlyText, roomList } from './messages';
import { nextTabIndex } from './navigation';
import { RouteConfirm } from './RouteConfirm';
import { SidebarNav } from './SidebarNav';
import { ViewModeSelect } from './ViewModeSelect';

const issue = (code: GraphIssue['code'], message: string, path: GraphIssue['path'] = ['nodes']): GraphIssue => ({ path, code, message });

describe('beginner vocabulary', () => {
  it('calls the architecture view "Building" and labels every view', () => {
    expect(VIEW_LABELS.architecture).toBe('Building');
    for (const mode of VIEW_MODES) expect(VIEW_LABELS[mode]).toMatch(/\S/);
    expect(Object.values(VIEW_LABELS)).not.toContain('Architecture');
  });

  // Gate F deliberately supersedes the phase-04 "exactly four destinations" decision with seven
  // ordered destinations (00-DECISIONS-AND-UX: UI hierarchy); the id `designer` is kept.
  it('names exactly eight ordered left destinations (Gate F; P4 Analyse and Transform)', () => {
    expect(SIDEBAR_SECTIONS).toEqual(['project', 'attributes', 'designer', 'analyse', 'transform', 'scenarios', 'camera', 'display']);
    expect(SIDEBAR_SECTIONS.map((s) => SIDEBAR_LABELS[s])).toEqual([
      'Project',
      'Attributes',
      'Building Designer',
      'Analyse',
      'Transform',
      'Scenarios',
      'Camera',
      'Display',
    ]);
    expect(PROPERTIES_LABEL).toBe('Properties');
  });

  it('describes every spatial status; unresolved is a warning with a reason', () => {
    const base = { edgeId: 1, kind: 'access' } as const;
    const direct: EdgeResolution = { ...base, status: 'direct', contact: 'horizontal', faces: [] };
    expect(describeResolution(direct)).toMatchObject({ title: 'Direct', tone: 'ok' });
    expect(describeResolution({ ...direct, contact: 'vertical' }).detail).toContain('not a designed stair');
    expect(describeResolution({ ...direct, kind: 'open' }).detail).toContain('left out');
    const routed: EdgeResolution = {
      ...base,
      status: 'routed',
      route: {
        edgeId: 1,
        axis: 'x',
        level: 1,
        cells: [
          [1, 0, 1],
          [2, 0, 1],
        ],
        from: { nodeId: 1, cell: [0, 0, 1], direction: '+x' },
        to: { nodeId: 2, cell: [3, 0, 1], direction: '-x' },
        style: 'covered',
      },
    };
    expect(describeResolution(routed).detail).toBe('Joined by a generated covered corridor, 2 cells long, on storey 1.');
    for (const reason of Object.keys(UNRESOLVED_REASON_TEXT) as (keyof typeof UNRESOLVED_REASON_TEXT)[]) {
      const text = describeResolution({ ...base, status: 'unresolved', reason, message: 'x' });
      expect(text).toMatchObject({ title: 'Unresolved', tone: 'warning' });
      expect(text.detail).toBe(UNRESOLVED_REASON_TEXT[reason]);
    }
  });
});

describe('plain-language messages', () => {
  const room = (id: string) => ({ a: '01', b: '02', c: '03' })[id] ?? id;

  it('names the other room in an overlap, from either side', () => {
    const overlap = issue('room-overlap', 'room "c" overlaps room "a" at cell [1, 1, 0]');
    expect(friendlyText(overlap, { roomLabel: room, subjectNodeId: 'c' })).toBe('This room overlaps room 01. Rooms cannot share cells.');
    expect(friendlyText(overlap, { roomLabel: room, subjectNodeId: 'a' })).toBe('This room overlaps room 03. Rooms cannot share cells.');
    expect(friendlyText(overlap, { roomLabel: room })).toBe('Room 03 overlaps room 01. Rooms cannot share cells.');
  });

  it('explains a broken v1 relationship and a blocked corridor', () => {
    const geometry = issue(
      'invalid-edge-geometry',
      '"door" edge "ab" requires horizontally face-adjacent cells (same z); "a" [0, 0, 0] and "b" [3, 0, 0] are not',
      ['edges', 0, 'kind'],
    );
    expect(friendlyText(geometry)).toBe(
      'The door relationship ab needs horizontally face-adjacent cells (same z), and rooms a and b would not be. Keep the rooms touching, or delete the relationship first.',
    );
    const displaced = issue('route-displacement', 'this would take cells of the connector(s) of "ab"; confirm …');
    expect(friendlyText(displaced, { relationshipLabel: () => '01 ↔ 02' })).toBe('This would block the generated corridor of relationship 01 ↔ 02.');
  });

  it('keeps technical details and falls back to the original sentence', () => {
    const [m] = friendlyMessages([issue('schema', 'metadata.name must be text', ['metadata', 'name'])]);
    expect(m).toEqual({ text: 'Metadata.name must be text.', technical: 'metadata.name · schema · metadata.name must be text' });
  });

  it('merges the same problem reported twice', () => {
    const messages = friendlyMessages([issue('self-edge', 'x', ['edges', 0]), issue('self-edge', 'y', ['edges', 1])]);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.technical.split('\n')).toHaveLength(2);
  });

  it('lists rooms readably', () => {
    expect(roomList(['01'])).toBe('room 01');
    expect(roomList(['01', '02', '03'])).toBe('rooms 01, 02 and 03');
  });
});

describe('vertical tab keyboard model', () => {
  const none = [false, false, false];
  it('moves and wraps with arrows, jumps with Home/End', () => {
    expect(nextTabIndex('ArrowDown', 0, none)).toBe(1);
    expect(nextTabIndex('ArrowDown', 2, none)).toBe(0);
    expect(nextTabIndex('ArrowUp', 0, none)).toBe(2);
    expect(nextTabIndex('Home', 2, none)).toBe(0);
    expect(nextTabIndex('End', 0, none)).toBe(2);
    expect(nextTabIndex('ArrowRight', 0, none)).toBeNull();
  });
  it('skips disabled tabs', () => {
    expect(nextTabIndex('ArrowDown', 0, [false, true, false])).toBe(2);
    expect(nextTabIndex('End', 0, [false, false, true])).toBe(1);
  });
});

describe('shell components (static markup)', () => {
  const tabs = SIDEBAR_SECTIONS.map((id) => ({
    id,
    label: SIDEBAR_LABELS[id],
    description: id,
    icon: null,
    content: createElement('p', null, `content of ${id}`),
  }));
  const nav = (collapsed: boolean, side: 'left' | 'right' = 'left') =>
    renderToStaticMarkup(createElement(SidebarNav, { tabs, active: 'analyse', onActive: () => {}, collapsed, onCollapsedChange: () => {}, label: 'project tools', side }));

  it('renders a vertical tab list with every panel mounted', () => {
    const html = nav(false);
    expect(html).toContain('role="tablist" aria-orientation="vertical"');
    for (const id of SIDEBAR_SECTIONS) expect(html).toContain(`>${SIDEBAR_LABELS[id]}</span>`);
    // Every panel is in the DOM (drafts and algorithm results survive switching); only one is visible.
    for (const id of SIDEBAR_SECTIONS) expect(html).toContain(`content of ${id}`);
    expect(html.match(/role="tabpanel"[^>]*hidden=""/g)).toHaveLength(SIDEBAR_SECTIONS.length - 1);
    expect(html).toMatch(/id="sidebar-tab-analyse"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="sidebar-tab-analyse"[^>]*tabindex="0"/);
    expect(html).toMatch(/id="sidebar-tab-project"[^>]*tabindex="-1"/);
    // Left rail: the strip comes first (outer edge), then the content.
    expect(html.indexOf('sgl-sidenav-strip')).toBeLessThan(html.indexOf('sgl-sidenav-panels'));
    expect(html).toContain('sgl-sidenav side-left');
    const right = nav(false, 'right');
    expect(right.indexOf('sgl-sidenav-panels')).toBeLessThan(right.indexOf('sgl-sidenav-strip'));
  });

  it('keeps an accessible name and tooltip for each icon when collapsed', () => {
    const html = nav(true);
    expect(html).toContain('aria-label="Project (opens the panel)"');
    expect(html).toContain('title="project"');
    expect(html.match(/role="tabpanel"[^>]*hidden=""/g)).toHaveLength(SIDEBAR_SECTIONS.length);
  });

  // Wave 1 (A): the left pane is collapsed by Workspace's centred chevron only; the rail no longer
  // has a second Show/Hide toggle. A right-hand rail keeps its own toggle unless told otherwise.
  it('has no duplicate Show/Hide toggle on the left rail', () => {
    for (const collapsed of [false, true]) {
      const html = nav(collapsed);
      expect(html).not.toContain('sgl-sidenav-toggle');
      expect(html).not.toMatch(/aria-label="(Show|Hide) project tools"/);
    }
    expect(nav(true, 'right')).toContain('aria-label="Show project tools"');
  });

  it('shows "Building" in the view selector', () => {
    const html = renderToStaticMarkup(createElement(ViewModeSelect, { mode: 'architecture', onMode: () => {}, panel: 2 }));
    expect(html).toContain('>Building</option>');
    expect(html).not.toContain('Architecture');
    expect(html).toContain('aria-label="View shown in panel 2"');
  });

  it('puts the message first and technical details behind a disclosure', () => {
    const html = renderToStaticMarkup(
      createElement(IssueFeedback, { issues: [issue('room-overlap', 'room "c" overlaps room "a" at cell [1, 1, 0]', ['nodes', 2, 'grid'])], context: { subjectNodeId: 'c' } }),
    );
    expect(html).toContain('role="alert"');
    expect(html.indexOf('This room overlaps room a.')).toBeLessThan(html.indexOf('Technical details'));
    expect(html).toContain('<details class="sgl-feedback-details"><summary>Technical details</summary>');
    expect(html).toContain('nodes[2].grid · room-overlap');
  });

  it('uses a polite status, not an alert, for warnings', () => {
    const html = renderToStaticMarkup(createElement(Feedback, { tone: 'warning', messages: [{ text: 'Not built.', technical: '' }] }));
    expect(html).toContain('role="status"');
    expect(html).not.toContain('Technical details');
  });

  it('offers Cancel and "Move anyway and recalculate", naming the relationship', () => {
    const html = renderToStaticMarkup(createElement(RouteConfirm, { relationships: ['01 ↔ 02'], onCancel: () => {}, onConfirm: () => {} }));
    expect(html).toContain('Moving this room would block the generated corridor of relationship 01 ↔ 02.');
    expect(html).toContain('>Cancel</button>');
    expect(html).toContain('>Move anyway and recalculate</button>');
  });

  it('is honest that the Designer is not available yet', () => {
    expect(renderToStaticMarkup(createElement(DesignerPlaceholder))).toContain('Not available yet.');
  });

  it('describes a failed load and whether the design was kept', () => {
    const html = renderToStaticMarkup(
      createElement(LoadFailureNotice, { source: 'x.json', issues: [issue('invalid-json', 'Unexpected token')], kept: true, onDismiss: () => {} }),
    );
    expect(html).toContain('Could not open x.json. Your current design is unchanged.');
    expect(html).toContain('Unexpected token.');
  });
});
