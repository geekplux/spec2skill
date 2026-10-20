import type { ReactNode } from 'react';
import { Header } from './Header';

interface LayoutProps {
  /** The sample chip row (and, later, the loaded-source summary). */
  samples: ReactNode;
  children: ReactNode;
  /** Right-hand detail panel (phase 7); omitted when nothing is selected. */
  panel?: ReactNode;
}

export function Layout({ samples, children, panel }: LayoutProps) {
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header />
      <div className="samples">{samples}</div>
      <div className="stage" data-panel={panel ? 'open' : undefined}>
        <main id="main" className="sheet" tabIndex={-1}>
          {children}
        </main>
        {panel && (
          <aside className="panel" aria-label="Details">
            {panel}
          </aside>
        )}
      </div>
    </div>
  );
}
