import { createContext, useContext } from 'react';

/**
 * Rooms lit up on request (owner 2026-11-18: the Designer's highlight button shows which rooms a
 * card styles). Like the analysis overlay, a context and not a `ViewProps` field: it is never part
 * of the document or the selection, and without a provider every view behaves as before (null).
 * Read by the Building and the Plan.
 */
export interface RoomHighlight {
  /** Who asked (e.g. the Designer card key), so the same button can switch it off again. */
  readonly key: string;
  readonly nodeIds: ReadonlySet<number>;
}

export const RoomHighlightContext = createContext<RoomHighlight | null>(null);
export const useRoomHighlight = (): RoomHighlight | null => useContext(RoomHighlightContext);

/** Set (or clear, null) the highlighted rooms. Null without a provider: the button is not shown. */
export const SetRoomHighlightContext = createContext<((highlight: RoomHighlight | null) => void) | null>(null);
export const useSetRoomHighlight = (): ((highlight: RoomHighlight | null) => void) | null => useContext(SetRoomHighlightContext);

/** Same rooms (order does not matter). */
export const sameRooms = (a: ReadonlySet<number>, b: ReadonlySet<number>): boolean => a.size === b.size && [...a].every((id) => b.has(id));
