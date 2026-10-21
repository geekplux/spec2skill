// WAI-ARIA tabs with automatic activation: one Tab stop; arrows, Home and End move and select.
import { type KeyboardEvent, useRef, useSyncExternalStore } from 'react';

export interface TabDef<T extends string> { id: T; label: string; panel: string }

/** The tab index `key` moves to from `i` of `n` (wrapping), or undefined for other keys. */
export const nextTab = (key: string, i: number, n: number): number | undefined =>
  ({ ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 })[key];

/** True while the viewport is at least 1024 px wide: two panes instead of tabs (PLAN 3.3). */
export function useWide(): boolean {
  const query = '(min-width: 1024px)';
  return useSyncExternalStore((change) => {
    const media = window.matchMedia(query);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, () => window.matchMedia(query).matches);
}

interface TabsProps<T extends string> { label: string; tabs: TabDef<T>[]; value: T; onChange: (id: T) => void }

export function Tabs<T extends string>({ label, tabs, value, onChange }: TabsProps<T>) {
  const box = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    const i = nextTab(e.key, tabs.findIndex((t) => t.id === value), tabs.length);
    if (i === undefined) return;
    e.preventDefault();
    onChange(tabs[i]!.id);
    box.current?.querySelector<HTMLElement>(`#tab-${tabs[i]!.id}`)?.focus();
  };
  return (
    // oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- roving tabindex: the selected tab is the Tab stop
    <div role="tablist" aria-label={label} className="tabs" ref={box} onKeyDown={onKeyDown}>
      {tabs.map((t) => (
        <button type="button" role="tab" key={t.id} id={`tab-${t.id}`} aria-selected={t.id === value} aria-controls={t.panel}
          tabIndex={t.id === value ? 0 : -1} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
