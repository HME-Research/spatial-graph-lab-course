import { describe, expect, it } from 'vitest';
import { historyButtonTitle, historyShortcut, isApplePlatform, isDuplicateShortcut, isEditableTarget, type ShortcutKey } from './shortcuts';

const key = (k: string, mods: Partial<ShortcutKey> = {}): ShortcutKey => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});
const body = { tagName: 'BODY' };

describe('undo/redo shortcuts', () => {
  it('Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z and Ctrl+Y redo', () => {
    expect(historyShortcut(key('z', { ctrlKey: true }), body)).toBe('undo');
    expect(historyShortcut(key('z', { metaKey: true }), body)).toBe('undo');
    expect(historyShortcut(key('Z', { ctrlKey: true, shiftKey: true }), body)).toBe('redo');
    expect(historyShortcut(key('Z', { metaKey: true, shiftKey: true }), body)).toBe('redo');
    expect(historyShortcut(key('y', { ctrlKey: true }), body)).toBe('redo');
    expect(historyShortcut(key('Y', { ctrlKey: true }), body)).toBe('redo');
  });

  it('ignores other keys, missing modifiers, Alt, IME composition and handled events', () => {
    expect(historyShortcut(key('z'), body)).toBeNull();
    expect(historyShortcut(key('x', { ctrlKey: true }), body)).toBeNull();
    expect(historyShortcut(key('y', { metaKey: true }), body)).toBeNull();
    expect(historyShortcut(key('z', { ctrlKey: true, altKey: true }), body)).toBeNull();
    expect(historyShortcut(key('z', { ctrlKey: true, isComposing: true }), body)).toBeNull();
    expect(historyShortcut(key('z', { ctrlKey: true, defaultPrevented: true }), body)).toBeNull();
  });

  it('leaves native text undo alone inside text inputs, textareas and contenteditable elements', () => {
    const undo = key('z', { ctrlKey: true });
    for (const target of [
      { tagName: 'INPUT', type: 'text' },
      { tagName: 'INPUT', type: 'number' },
      { tagName: 'input' }, // no type: text
      { tagName: 'TEXTAREA' },
      { tagName: 'DIV', isContentEditable: true },
    ]) {
      expect(isEditableTarget(target)).toBe(true);
      expect(historyShortcut(undo, target)).toBeNull();
      expect(historyShortcut(key('y', { ctrlKey: true }), target)).toBeNull();
    }
    for (const target of [{ tagName: 'BUTTON' }, { tagName: 'INPUT', type: 'checkbox' }, { tagName: 'SELECT' }, { tagName: 'DIV' }, null]) {
      expect(isEditableTarget(target)).toBe(false);
      expect(historyShortcut(undo, target)).toBe('undo');
    }
  });

  it('describes the buttons with the action label and the platform shortcut', () => {
    expect(historyButtonTitle('undo', true, 'Add node n1', false)).toBe('Undo: Add node n1 (Ctrl+Z)');
    expect(historyButtonTitle('redo', true, 'Add node n1', false)).toBe('Redo: Add node n1 (Ctrl+Y or Ctrl+Shift+Z)');
    expect(historyButtonTitle('redo', true, null, true)).toBe('Redo (⇧⌘Z)');
    expect(historyButtonTitle('undo', false, null, false)).toBe('Undo: nothing to undo');
    expect(isApplePlatform('MacIntel')).toBe(true);
    expect(isApplePlatform('Win32')).toBe(false);
  });
});

describe('Ctrl+D duplicate shortcut (app-wide)', () => {
  const none = { querySelector: () => null };
  const scope = (inside: string | null, tagName = 'DIV') => ({ tagName, closest: (s: string) => (inside && s.includes(inside) ? {} : null) });
  it('Ctrl/Cmd+D anywhere outside text fields, selects, dialogs and menus', () => {
    expect(isDuplicateShortcut(key('d', { ctrlKey: true }), scope(null), none)).toBe(true);
    expect(isDuplicateShortcut(key('D', { metaKey: true }), body, none)).toBe(true);
    expect(isDuplicateShortcut(key('d', { ctrlKey: true }), { tagName: 'INPUT', type: 'text' }, none)).toBe(false);
    expect(isDuplicateShortcut(key('d', { ctrlKey: true }), scope(null, 'SELECT'), none)).toBe(false);
    expect(isDuplicateShortcut(key('d', { ctrlKey: true }), scope('[role="dialog"]'), none)).toBe(false);
    expect(isDuplicateShortcut(key('d', { ctrlKey: true }), scope('[role="menu"]'), none)).toBe(false);
  });
  it('not while a modal dialog is open, nor with Shift/Alt or without Ctrl/Cmd', () => {
    expect(isDuplicateShortcut(key('d', { ctrlKey: true }), body, { querySelector: () => ({}) })).toBe(false);
    expect(isDuplicateShortcut(key('d', { ctrlKey: true, shiftKey: true }), body, none)).toBe(false);
    expect(isDuplicateShortcut(key('d', { ctrlKey: true, altKey: true }), body, none)).toBe(false);
    expect(isDuplicateShortcut(key('d'), body, none)).toBe(false);
  });
});
