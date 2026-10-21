import type { ReactNode } from 'react';
import { Announcer } from '../a11y/Announcer';
import { Header } from './Header';

interface LayoutProps {
  /** The sample chip row (and, later, the loaded-source summary). */
  samples: ReactNode;
  /** The skill pane and the map pane (two panes, or tabs below 1024 px). */
  children: ReactNode;
  onGenerate: () => void;
}

export function Layout({ samples, children, onGenerate }: LayoutProps) {
  return (
    <div className="shell">
      <Announcer>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header onGenerate={onGenerate} />
      <section className="samples" aria-label="Built-in samples">
        {samples}
      </section>
      <main id="main" className="stage" tabIndex={-1}>
        {children}
      </main>
      </Announcer>
    </div>
  );
}
