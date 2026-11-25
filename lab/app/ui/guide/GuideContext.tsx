import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { GuideLink } from '../guideContracts';
import { GuideWindow } from './GuideWindow';

export interface GuideApi {
  /** Open the Guide, optionally at a tab and section ("More in the guide"). */
  readonly open: (link?: GuideLink) => void;
  readonly close: () => void;
  readonly isOpen: boolean;
}

const NOOP: GuideApi = { open: () => undefined, close: () => undefined, isOpen: false };
const GuideContext = createContext<GuideApi>(NOOP);

/** `useGuide().open({ tab: 'views', section: 'x' })` opens the Guide window there. Outside a provider it does nothing. */
export function useGuide(): GuideApi {
  return useContext(GuideContext);
}

/** Owns the single Guide window; mount once above the app. */
export function GuideProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; link: GuideLink | null }>({ open: false, link: null });
  const open = useCallback((link?: GuideLink) => setState((s) => ({ open: true, link: link ?? s.link })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const api = useMemo<GuideApi>(() => ({ open, close, isOpen: state.open }), [open, close, state.open]);
  return (
    <GuideContext.Provider value={api}>
      {children}
      <GuideWindow open={state.open} onClose={close} link={state.link} />
    </GuideContext.Provider>
  );
}
