import type { ReactNode } from 'react';
import { Announcer } from '../a11y/Announcer';
import { Header, type View } from './Header';

interface LayoutProps {
  /** The sample chip row (and, later, the loaded-source summary). */
  samples: ReactNode;
  children: ReactNode;
  /** Right-hand detail panel (phase 7); omitted when nothing is selected. */
  panel?: ReactNode;
  view: View;
  onView: (view: View) => void;
}

export function Layout({ samples, children, panel, view, onView }: LayoutProps) {
  return (
    <div className="shell">
      <Announcer>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header view={view} onView={onView} />
      <section className="samples" aria-label="Built-in samples">
        {samples}
      </section>
      <div className="stage" data-panel={panel ? 'open' : undefined}>
        <main id="main" className="sheet" data-view={view} tabIndex={-1}>
          {children}
        </main>
        {panel && (
          <aside className="panel" aria-label="Details">
            {panel}
          </aside>
        )}
      </div>
      </Announcer>
    </div>
  );
}
