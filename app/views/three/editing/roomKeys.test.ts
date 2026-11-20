import { describe, expect, it } from 'vitest';
import { applyAxisSteps } from './roomGeometry';
import { cameraFrame, keepsOwnKeys, PLAN_FRAME, roomKeyStep, type RoomKey } from './roomKeys';

const key = (k: string, mods: Partial<RoomKey> = {}): RoomKey => ({ key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...mods });
const room = { position: [2, 2, 0] as [number, number, number], size: [2, 2, 1] as [number, number, number] };
const after = (k: RoomKey, frame = PLAN_FRAME, storeys = true) => {
  const s = roomKeyStep(k, frame, storeys);
  return s && applyAxisSteps(room, s.mode, s.axis, s.steps, s.side);
};

describe('room keys: Plan (grid +y up, +x right)', () => {
  it('arrows move one cell in the screen direction', () => {
    expect(after(key('ArrowUp'))).toEqual({ position: [2, 3, 0], size: [2, 2, 1] });
    expect(after(key('ArrowDown'))).toEqual({ position: [2, 1, 0], size: [2, 2, 1] });
    expect(after(key('ArrowRight'))).toEqual({ position: [3, 2, 0], size: [2, 2, 1] });
    expect(after(key('ArrowLeft'))).toEqual({ position: [1, 2, 0], size: [2, 2, 1] });
  });

  it('Shift+arrow grows towards the arrow; Shift+Alt+arrow shrinks from that side', () => {
    expect(after(key('ArrowRight', { shiftKey: true }))).toEqual({ position: [2, 2, 0], size: [3, 2, 1] });
    expect(after(key('ArrowLeft', { shiftKey: true }))).toEqual({ position: [1, 2, 0], size: [3, 2, 1] });
    expect(after(key('ArrowUp', { shiftKey: true }))).toEqual({ position: [2, 2, 0], size: [2, 3, 1] });
    expect(after(key('ArrowDown', { shiftKey: true }))).toEqual({ position: [2, 1, 0], size: [2, 3, 1] });
    expect(after(key('ArrowRight', { shiftKey: true, altKey: true }))).toEqual({ position: [2, 2, 0], size: [1, 2, 1] });
    expect(after(key('ArrowLeft', { shiftKey: true, altKey: true }))).toEqual({ position: [3, 2, 0], size: [1, 2, 1] });
  });

  it('PageUp/PageDown move a storey only where storeys are allowed (3D, not the Plan)', () => {
    expect(after(key('PageUp'))).toEqual({ position: [2, 2, 1], size: [2, 2, 1] });
    expect(after(key('PageDown'))).toEqual({ position: [2, 2, -1], size: [2, 2, 1] });
    expect(roomKeyStep(key('PageUp'), PLAN_FRAME, false)).toBeNull();
  });

  it('never takes Ctrl/Cmd, a lone Alt (Alt+Left = Back) or other keys', () => {
    expect(roomKeyStep(key('ArrowLeft', { altKey: true }), PLAN_FRAME, true)).toBeNull();
    expect(roomKeyStep(key('ArrowLeft', { ctrlKey: true }), PLAN_FRAME, true)).toBeNull();
    expect(roomKeyStep(key('ArrowUp', { metaKey: true }), PLAN_FRAME, true)).toBeNull();
    expect(roomKeyStep(key('a'), PLAN_FRAME, true)).toBeNull();
    expect(roomKeyStep(key('PageUp', { shiftKey: true }), PLAN_FRAME, true)).toBeNull();
  });
});

describe('room keys: 3D camera frame', () => {
  it('maps up to the grid axis nearest to where the camera looks on the ground', () => {
    // World: grid x = X, grid y = −Z. Looking along −Z (default camera) = grid +y.
    expect(cameraFrame([0, -0.5, -1])).toEqual({ up: { axis: 'y', sign: 1 }, right: { axis: 'x', sign: 1 } });
    // Looking along +X = grid +x; the screen's right is then grid −y.
    expect(cameraFrame([1, -0.3, 0.2])).toEqual({ up: { axis: 'x', sign: 1 }, right: { axis: 'y', sign: -1 } });
    // Looking along +Z = grid −y; right = grid −x.
    expect(cameraFrame([0.1, -0.3, 1])).toEqual({ up: { axis: 'y', sign: -1 }, right: { axis: 'x', sign: -1 } });
    expect(cameraFrame([-1, 0, 0])).toEqual({ up: { axis: 'x', sign: -1 }, right: { axis: 'y', sign: 1 } });
  });

  it('a camera looking straight down uses the heading of the screen top', () => {
    expect(cameraFrame([0, -1, 0], [1, 0, 0])).toEqual({ up: { axis: 'x', sign: 1 }, right: { axis: 'y', sign: -1 } });
  });
});

describe('room keys: where they apply', () => {
  const at = (matches: string | null, editable = false) => ({ closest: (s: string) => (matches && s.includes(matches) ? {} : null), isContentEditable: editable });
  it('text fields, selects, menus and dialogs keep their own keys', () => {
    expect(keepsOwnKeys(at('input'))).toBe(true);
    expect(keepsOwnKeys(at('select'))).toBe(true);
    expect(keepsOwnKeys(at('[role="menu"]'))).toBe(true);
    expect(keepsOwnKeys(at('[role="dialog"]'))).toBe(true);
    expect(keepsOwnKeys(at(null, true))).toBe(true);
    expect(keepsOwnKeys(at(null))).toBe(false);
    expect(keepsOwnKeys(null)).toBe(false);
  });
});
