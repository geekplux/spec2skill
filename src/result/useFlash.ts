// A button's done state ("Copied", "Downloaded"): on for 2 s after `flash()`, then back (DESIGN.md 7).
import { useEffect, useState } from 'react';

export const FLASH_MS = 2000;

export function useFlash(): [boolean, () => void] {
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (!at) return;
    const t = setTimeout(() => setAt(0), FLASH_MS);
    return () => clearTimeout(t);
  }, [at]);
  return [at > 0, () => setAt(performance.now() || 1)];
}
