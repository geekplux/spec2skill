// One persistent polite live region for the whole app (A2). It lives in Layout, so it survives the
// map remounting per sample. Each message clears the region and is set on the next frame, so a
// repeated message ("Example copied") is announced again.
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const AnnounceContext = createContext<(text: string) => void>(() => {});

/** Announce `text` politely through the app's live region. */
export const useAnnounce = (): ((text: string) => void) => useContext(AnnounceContext);

export function Announcer({ children }: { children: ReactNode }) {
  const [say, setSay] = useState('');
  const frame = useRef(0);
  const announce = useCallback((text: string) => {
    cancelAnimationFrame(frame.current);
    setSay('');
    frame.current = requestAnimationFrame(() => setSay(text));
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <p className="visually-hidden" aria-live="polite" data-testid="announcer">{say}</p>
    </AnnounceContext.Provider>
  );
}
