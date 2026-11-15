import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { relationshipLegend } from '@app/views/presentation';
import { VIEW_MODES } from '@app/views/contracts';
import { HELP_CLOSED, HELP_DETAILS, HELP_TOPIC_IDS, HELP_TOPICS, helpReducer, helpTopic, hintVisible, HelpTip, type HelpEvent } from './index';

describe('help topics', () => {
  it('covers the required beginner topics with one short sentence each', () => {
    for (const id of ['graph-vs-grid', 'access-open', 'relationship-status', 'unresolved', 'room-size', 'gizmo-snap', 'designer-windows', 'analysis-results']) {
      expect(HELP_TOPIC_IDS).toContain(id);
    }
    for (const t of Object.values(HELP_TOPICS)) {
      expect(t.summary.length, t.id).toBeLessThanOrEqual(140);
      expect(t.summary.trim().endsWith('.'), t.id).toBe(true);
      expect(t.summary.split(/\.\s/).length, `${t.id}: one sentence`).toBe(1);
      expect(t.details.length).toBeGreaterThan(t.summary.length);
    }
  });

  it('resolves unknown ids to undefined, including prototype keys', () => {
    expect(helpTopic('unresolved')?.title).toBe('Unresolved relationship');
    expect(helpTopic('nope')).toBeUndefined();
    expect(helpTopic('toString')).toBeUndefined();
  });

  it('has a topic for every help link used by the view legends', () => {
    for (const v of VIEW_MODES) {
      for (const s of relationshipLegend(v).sections) {
        for (const i of s.items) if (i.helpTopic) expect(HELP_DETAILS[i.helpTopic], i.helpTopic).toBeTruthy();
      }
    }
  });

  it('uses the shared status vocabulary', () => {
    const t = HELP_TOPICS['relationship-status'];
    for (const word of ['Direct', 'Connected via route', 'Unresolved']) expect(t.title + t.details).toContain(word);
    expect(HELP_TOPICS.unresolved.summary).toMatch(/red dashed/);
  });
});

describe('help tooltip state', () => {
  const run = (...events: HelpEvent[]) => events.reduce(helpReducer, HELP_CLOSED);

  it('shows the hint equally for hover and keyboard focus', () => {
    expect(hintVisible(run('pointer-enter'))).toBe(true);
    expect(hintVisible(run('focus'))).toBe(true);
    expect(hintVisible(run('focus', 'blur'))).toBe(false);
    expect(hintVisible(run('pointer-enter', 'focus', 'pointer-leave'))).toBe(true);
  });

  it('pins the panel on toggle, hides the hint while pinned, and closes on Escape or outside click', () => {
    const open = run('focus', 'toggle');
    expect(open.open).toBe(true);
    expect(hintVisible(open)).toBe(false);
    expect(run('focus', 'toggle', 'blur').open).toBe(true); // tabbing into "More details" keeps it
    expect(run('focus', 'toggle', 'escape')).toEqual(HELP_CLOSED);
    expect(run('toggle', 'outside').open).toBe(false);
    expect(run('toggle', 'toggle').open).toBe(false);
  });
});

describe('HelpTip markup', () => {
  it('renders a labelled button described by a tooltip, with a hidden details panel', () => {
    const html = renderToStaticMarkup(createElement(HelpTip, { topicId: 'access-open' }));
    expect(html).toContain('data-help-topic="access-open"');
    expect(html).toContain('aria-label="Help: Access or Open"');
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toContain(`role="tooltip" id="${describedBy}"`);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('More details');
    expect(html).toContain(HELP_TOPICS['access-open'].summary);
  });

  it('renders nothing for an unknown topic', () => {
    expect(renderToStaticMarkup(createElement(HelpTip, { topicId: 'nope' }))).toBe('');
  });
});
