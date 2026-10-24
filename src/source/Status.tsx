// The loading and error states (PLAN 3.6, docs/DESIGN.md): one focal point each, shown above the
// previous skill and map, which stay in place (greyscale while loading) so nothing jumps.
import { useEffect, useRef } from 'react';
import { useAnnounce } from '../a11y/Announcer';
import type { Explained } from './errors';
import { STEPS, type StepId } from './fetchSource';

export interface Progress { at: StepId; labels: Partial<Record<StepId, string>> }

const DEFAULT: Record<StepId, string> = { fetch: 'Fetching spec', parse: 'Parsing', map: 'Mapping operations', write: 'Writing skill' };
const STATE = [['✓', 'done'], ['▸', 'in progress'], ['○', 'waiting']] as const;

/** The ordered steps with static glyphs (no moving indicator, so reduced motion needs nothing more). */
export function LoadingSteps({ progress, onCancel }: { progress: Progress; onCancel: () => void }) {
  const at = STEPS.indexOf(progress.at);
  const label = progress.labels[progress.at] ?? DEFAULT[progress.at];
  const announce = useAnnounce();
  useEffect(() => announce(`${label}…`), [announce, label]);
  return (
    <section className="source-status" aria-labelledby="status-title" data-testid="loading">
      <h2 id="status-title">Turning your API into a skill</h2>
      <ol className="steps">
        {STEPS.map((id, i) => {
          const [glyph, word] = STATE[i < at ? 0 : i === at ? 1 : 2];
          return <li key={id} data-state={word}><span className="tick" aria-hidden="true">{glyph}</span>{progress.labels[id] ?? DEFAULT[id]}<span className="visually-hidden">: {word}</span></li>;
        })}
      </ol>
      <button type="button" className="btn" onClick={() => (announce('Cancelled.'), onCancel())}>Cancel</button>
    </section>
  );
}

interface ErrorPanelProps { error: Explained; onPaste: () => void; onSample: () => void }

/**
 * Title, reason and the two ways on; focus moves to the title so the error is read first. There is no
 * "load it as" choice: a URL is already tried as a spec and then as an MCP server (D37).
 */
export function ErrorPanel({ error, onPaste, onSample }: ErrorPanelProps) {
  const title = useRef<HTMLHeadingElement>(null);
  const announce = useAnnounce();
  useEffect(() => {
    title.current?.focus();
    announce(error.reason);
  }, [announce, error]);
  return (
    <section className="source-status error" aria-labelledby="status-title" data-code={error.code}>
      <h2 id="status-title" tabIndex={-1} ref={title}>
        <span className="err-mark" aria-hidden="true">!</span>
        <span className="visually-hidden">Could not load: </span>{error.title}
      </h2>
      <p>{error.reason}</p>
      {error.command && <pre className="command"><code>{error.command}</code></pre>}
      <p className="status-actions">
        <button type="button" className="btn" onClick={onPaste}>Paste spec text instead</button>
        <button type="button" className="btn" onClick={onSample}>Try a sample</button>
      </p>
    </section>
  );
}

/** A spec without operations: a static, empty chart instead of the map. */
export function EmptyChart() {
  return (
    <div className="empty-chart" data-testid="empty-chart">
      <svg viewBox="0 0 160 96" width="160" height="96" aria-hidden="true" className="empty-ring">
        <rect x="1" y="1" width="158" height="94" rx="4" strokeDasharray="4 4" /><path d="M80 14v10M54 48h-8M106 48h8" /><circle cx="80" cy="48" r="26" />
      </svg>
      <p>This spec has no paths. Webhooks and callbacks are not mapped yet.</p>
    </div>
  );
}
