import { Suspense, startTransition, use, useState } from 'react';
import type { Operation, SourceKind } from './model/types';
import { DEFAULT_SAMPLE_ID, SAMPLES, type Sample, getSample, sampleModel } from './samples';

const KIND_LABEL: Record<SourceKind, string> = { openapi3: 'OpenAPI', swagger2: 'Swagger', mcp: 'MCP' };

function initialSample(): Sample {
  const id = new URLSearchParams(window.location.search).get('sample');
  return getSample(id ?? '') ?? getSample(DEFAULT_SAMPLE_ID)!;
}

/** Text flags, so state never relies on colour. */
function flags(op: Operation): string[] {
  const out: string[] = [];
  if (op.deprecated) out.push('deprecated');
  if (op.kind === 'tool' && op.hints.readOnly) out.push('read-only');
  if (op.kind === 'tool' && op.hints.destructive) out.push('destructive');
  return out;
}

function OperationList({ sample }: { sample: Sample }) {
  const model = use(sampleModel(sample));
  const title = `${model.source.title} (sample)`;
  const noun = model.source.kind === 'mcp' ? 'tools' : 'operations';
  return (
    <>
      <h1>{title}</h1>
      <p className="lede">
        {model.operations.length} {noun}, read from {KIND_LABEL[model.source.kind]} {model.source.specVersion}. The
        interactive atlas arrives in a later phase.
      </p>
      <ul className="ops" data-testid="sample-list" aria-label={`${noun} in ${title}`}>
        {model.operations.map((op) => (
          <li key={op.id}>
            <span className="method">{op.method?.toUpperCase() ?? 'TOOL'}</span> <code>{op.path ?? op.id}</code>
            {op.title !== op.id && <span className="summary"> {op.title}</span>}
            {flags(op).map((flag) => (
              <span className="flag" key={flag}>
                {flag}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}

export function App() {
  const [sample, setSample] = useState(initialSample);
  const select = (next: Sample) => {
    const url = new URL(window.location.href);
    url.searchParams.set('sample', next.id);
    window.history.replaceState(null, '', url);
    startTransition(() => setSample(next)); // keep the current list visible while the next one is read
  };

  return (
    <main className="app">
      <p className="wordmark">tool-atlas</p>
      <fieldset className="chips">
        <legend>Built-in samples</legend>
        {SAMPLES.map((s) => (
          <button type="button" className="chip" key={s.id} aria-pressed={s.id === sample.id} onClick={() => select(s)}>
            {s.label} <span className="chip-kind">{KIND_LABEL[s.kind]}</span>
          </button>
        ))}
      </fieldset>
      <Suspense fallback={<p className="lede">Reading the sample…</p>}>
        <OperationList sample={sample} />
      </Suspense>
    </main>
  );
}
