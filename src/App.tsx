import { type CSSProperties, type FocusEvent, Suspense, startTransition, use, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnounce } from './a11y/Announcer';
import { WASH } from './design/tokens';
import { type AtlasGraph, type EdgeKind, buildGraph } from './graph';
import { AtlasMap } from './map/Map';
import type { Operation, SourceKind } from './model/types';
import { DEFAULT_SAMPLE_ID, SAMPLES, type Sample, getSample, sampleModel } from './samples';
import type { View } from './shell/Header';
import { Layout } from './shell/Layout';

const KIND_LABEL: Record<SourceKind, string> = { openapi3: 'OpenAPI', swagger2: 'Swagger', mcp: 'MCP' };

/** Keep a chip fully visible inside the horizontally scrolling mobile chip row. */
const NEAREST: ScrollIntoViewOptions = { block: 'nearest', inline: 'nearest' };
const revealChip = (e: FocusEvent<HTMLButtonElement>) => e.currentTarget.scrollIntoView?.(NEAREST);

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

/** Plain-text view of the graph (phase 4): the list view until phase 8, and the map's text alternative. */
function GraphSummary({ graph }: { graph: AtlasGraph }) {
  const count = (kind: EdgeKind) => graph.edges.filter((e) => e.kind === kind).length;
  const inferred = graph.edges.filter((e) => e.confidence === 'inferred').length;
  return (
    <section className="graph" data-testid="graph-summary" aria-labelledby="graph-heading">
      <h2 id="graph-heading">Clusters and relationships</h2>
      <ul className="territories">
        {graph.clusters.map((c, i) => (
          <li key={c.id} style={{ '--wash': `var(--${WASH[i % WASH.length]})` } as CSSProperties}>
            <strong className="territory">{c.name}</strong>
            <span>{c.description}</span>
          </li>
        ))}
      </ul>
      <p>
        {count('feeds')} feeds edges ({inferred} inferred), {count('sub-path')} sub-path edges, {count('shared-schema')}{' '}
        shared-schema edges.
        {graph.hubSchemas.length > 0 &&
          ` Hub schemas (shown as badges, not edges): ${graph.hubSchemas.map((h) => `${h.name} on ${h.usedBy} operations`).join(', ')}.`}
      </p>
    </section>
  );
}

function OperationList({ sample, view }: { sample: Sample; view: View }) {
  const model = use(sampleModel(sample));
  const graph = useMemo(() => buildGraph(model), [model]);
  const title = `${model.source.title} (sample)`;
  const noun = model.source.kind === 'mcp' ? 'tools' : 'operations';
  const summary = `${model.operations.length} ${noun} in ${graph.clusters.length} clusters, ${graph.edges.length} relationships`;
  // Announce the newly loaded sample (A2); not on first load, where the page itself is the news.
  const announce = useAnnounce();
  const shown = useRef(model.hash);
  useEffect(() => {
    if (shown.current === model.hash) return;
    shown.current = model.hash;
    announce(`${model.source.title}: ${summary}.`);
  }, [announce, model.hash, model.source.title, summary]);
  return (
    <>
      <p className="kicker">
        Surveyed from {KIND_LABEL[model.source.kind]} {model.source.specVersion}
      </p>
      <h1>{title}</h1>
      <p className="lede">
        {summary}.{' '}
        <span className="banner">You are looking at a sample. Paste an OpenAPI or MCP URL above, or try another sample.</span>
      </p>
      {view === 'map' && <AtlasMap key={model.hash} model={model} graph={graph} />}
      <GraphSummary graph={graph} />
      <ul className="ops" data-testid="sample-list" aria-label={`${noun} in ${title}`}>
        {model.operations.map((op) => (
          <li key={op.id}>
            <span className="method" data-method={op.method ?? 'tool'}>
              {op.method?.toUpperCase() ?? 'TOOL'}
            </span> <code>{op.path ?? op.id}</code>
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
  const [view, setView] = useState<View>('map');
  const chipRow = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    chipRow.current?.querySelector<HTMLElement>(`[data-sample="${sample.id}"]`)?.scrollIntoView?.(NEAREST);
  }, [sample.id]);
  const select = (next: Sample) => {
    const url = new URL(window.location.href);
    url.searchParams.set('sample', next.id);
    window.history.replaceState(null, '', url);
    startTransition(() => setSample(next)); // keep the current list visible while the next one is read
  };

  const chips = (
    <fieldset className="chips" ref={chipRow}>
      <legend>Built-in samples</legend>
      {SAMPLES.map((s) => (
        <button
          type="button"
          className="chip"
          key={s.id}
          data-sample={s.id}
          aria-pressed={s.id === sample.id}
          onClick={() => select(s)}
          onFocus={revealChip}
        >
          {s.label} <span className="chip-kind">{KIND_LABEL[s.kind]}</span>
        </button>
      ))}
    </fieldset>
  );
  return (
    <Layout samples={chips} view={view} onView={setView}>
      <Suspense fallback={<p className="lede">Reading the sample…</p>}>
        <OperationList sample={sample} view={view} />
      </Suspense>
    </Layout>
  );
}
