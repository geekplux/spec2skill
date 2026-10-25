import type { ReactNode } from 'react';
import { Announcer } from '../a11y/Announcer';
import { Header } from './Header';
import { CommandLine, Footer, HowItWorks, MadeBy } from './Sections';

interface LayoutProps {
  /** The source field (paste, open or drop a spec; Generate). */
  source: ReactNode;
  /** "Samples" and its segmented control, under the field. */
  samples: ReactNode;
  /** The result inside the frame: its head, the map or list, and the skill browser. */
  children: ReactNode;
  /** The loading state (above the result, greyscale while busy) or the error (in its place). */
  status?: ReactNode;
  /** A load is in progress (the result below the steps is busy). */
  busy: boolean;
  /** Open the keyboard shortcuts dialog (the footer link). */
  onShortcuts: () => void;
}

/** The page shell (docs/redesign/DESIGN.md 4): header, hero, the result frame, the sections and the footer. */
export function Layout({ source, samples, children, status, busy, onShortcuts }: LayoutProps) {
  return (
    <div className="shell">
      <Announcer>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="wrap two hero-in">
            <div>
              <h1 id="hero-title">Turn any API into an agent skill</h1>
              <p className="hero-lede">Paste an OpenAPI spec or an MCP server. Get a tested skill, and a map to check what it teaches.</p>
            </div>
            <div className="load">
              {source}
              {samples}
            </div>
          </div>
        </section>
        <div className="wrap">
          {/* While loading, the previous result below the status is greyscale; an error takes its place (app.css). */}
          <section id="result" className="frame stage" tabIndex={-1} aria-label="Result" data-status={status ? (busy ? 'loading' : 'error') : undefined}>
            {status}
            <div className="stage-content" aria-busy={busy}>
              {children}
            </div>
          </section>
        </div>
        <CommandLine />
        <HowItWorks />
        <MadeBy />
      </main>
      <Footer onShortcuts={onShortcuts} />
      </Announcer>
    </div>
  );
}
