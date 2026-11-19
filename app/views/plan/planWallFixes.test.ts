import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import exampleJson from '../../document/test-designs/two-storey.json';
import { expectOk } from '@app/document/test-fixtures';
import { readDesign } from '@app/document';
import { resolveRelationships, type DesignPort } from '@app/spatial';
import { NO_SELECTION } from '@core/viewer/selection';
import { PlanView } from './PlanView';
import { staleWallHover, WHEEL_DELTA_LINE, WHEEL_DELTA_PAGE, WHEEL_DELTA_PIXEL, wheelFactor, wheelPixels } from './planViewport';

/** Wave 2 (D) fixes in the Plan: wheel deltaMode, stale wall hover, the open wall highlight. */

const example = expectOk(readDesign(exampleJson)).doc;
const port: DesignPort = {
  doc: example,
  spatial: resolveRelationships(example),
  onCommand: () => ({ ok: true }),
  proposeEdit: () => ({ status: 'rejected', issues: [], collidingRooms: [] }),
};
const baseProps = { selection: NO_SELECTION, onSelect: () => {}, design: port };

describe('plan wheel zoom honours deltaMode', () => {
  it('pixel deltas are unchanged; line deltas are scaled so one notch zooms like a pixel notch', () => {
    expect(wheelPixels(100, WHEEL_DELTA_PIXEL, 600)).toBe(100);
    expect(wheelPixels(3, WHEEL_DELTA_LINE, 600)).toBeCloseTo(100);
    expect(wheelFactor(wheelPixels(3, WHEEL_DELTA_LINE, 600))).toBeCloseTo(wheelFactor(100));
    // Without the fix a 3-line notch zoomed by only ~0.5 %.
    expect(wheelFactor(3)).toBeGreaterThan(0.99);
    expect(wheelFactor(wheelPixels(-3, WHEEL_DELTA_LINE, 600))).toBeCloseTo(1.2);
  });

  it('page deltas use the panel height (clamped like any large wheel step)', () => {
    expect(wheelPixels(1, WHEEL_DELTA_PAGE, 480)).toBe(480);
    expect(wheelPixels(1, WHEEL_DELTA_PAGE, 0)).toBe(800);
    expect(wheelFactor(wheelPixels(1, WHEEL_DELTA_PAGE, 480))).toBeCloseTo(Math.pow(1.2, -4.8));
    expect(wheelFactor(wheelPixels(2, WHEEL_DELTA_PAGE, 480))).toBeCloseTo(Math.pow(1.2, -5));
    expect(wheelPixels(5, 7, 480)).toBe(5);
  });
});

describe('plan wall hover never goes stale', () => {
  const targets = [{ faceId: '3:+x' }];
  it('a storey switch always resets it; a design change only when the wall is gone', () => {
    expect(staleWallHover('3:+x', true, targets)).toBe(true);
    expect(staleWallHover('3:+x', false, targets)).toBe(false);
    expect(staleWallHover('3:+x', false, [])).toBe(true);
  });
});

describe('Plan open-wall highlight', () => {
  it('draws the shared walls as targets and highlights the open one', () => {
    const html = renderToStaticMarkup(createElement(PlanView, { ...baseProps, onWallTarget: () => {}, activeWall: '3:+x' }));
    expect(html).toMatch(/class="sgl-plan-wall-target active" data-face-id="3:\+x"/);
  });
});
