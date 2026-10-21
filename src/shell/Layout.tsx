import type { ReactNode } from 'react';
import { Announcer } from '../a11y/Announcer';
import { Header } from './Header';

interface LayoutProps {
  /** The sample chip row (and, later, the loaded-source summary). */
  samples: ReactNode;
  /** The skill pane and the map pane (two panes, or tabs below 1024 px). */
  children: ReactNode;
  onGenerate: () => void;
  source: ReactNode;
  /** The loading or error state, above the (greyscale while busy) skill and map. */
  status?: ReactNode;
  /** A load is in progress (the content below the steps is busy; Generate skill waits). */
  busy: boolean;
}

export function Layout({ samples, children, onGenerate, source, status, busy }: LayoutProps) {
  return (
    <div className="shell">
      <Announcer>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header onGenerate={onGenerate} source={source} quiet={!!status} disabled={busy} />
      <section className="samples" aria-label="Built-in samples">
        {samples}
      </section>
      {/* While a status is shown, the previous skill and map below it are greyscale (app.css). */}
      <main id="main" className="stage" tabIndex={-1} data-status={status ? (busy ? 'loading' : 'error') : undefined}>
        {status}
        <div className="stage-content" aria-busy={busy}>
          {children}
        </div>
      </main>
      </Announcer>
    </div>
  );
}
