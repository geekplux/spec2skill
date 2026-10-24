import { Suspense, useCallback, startTransition, use, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAnnounce } from './a11y/Announcer';
import { aiProse, applyAi } from './ai/client';
import { useAi } from './ai/useAi';
import { buildGraph } from './graph';
import { counted } from './graph/words';
import { ListView } from './list/ListView';
import { AtlasMap } from './map/Map';
import { Search } from './map/Search';
import { ShortcutHelp } from './map/ShortcutHelp';
import type { AtlasGraph } from './graph';
import type { ApiModel, SourceKind } from './model/types';
import { DEFAULT_SAMPLE_ID, type Sample, getSample, sampleModel } from './samples';
import { Layout } from './shell/Layout';
import { type TabDef, Tabs, useWide } from './shell/Tabs';
import { skillSlug } from './skillgen/slug';
import { type Explained, explain } from './source/errors';
import { type Input, loadSource } from './source/fetchSource';
import { Samples } from './source/Samples';
import { SourceInput } from './source/SourceInput';
import { EmptyChart, ErrorPanel, LoadingSteps, type Progress } from './source/Status';
import { SkillPane } from './skillpane/SkillPane';
import { opFile } from './skillpane/tree';
import { type Skill, useSkill, writeSkill } from './skillpane/useSkill';
import { type Hidden, SHOW_ALL, edgeShown, facets, matches, searchIndex } from './state/filter';
import { type UrlState, type View, canonicalUrl, readUrl, writeUrl } from './state/url';

const KIND_LABEL: Record<SourceKind, string> = { openapi3: 'OpenAPI', swagger2: 'Swagger', mcp: 'MCP' };

type Tab = View;
const TABS: TabDef<Tab>[] = [
  { id: 'skill', label: 'Skill', panel: 'panel-skill' },
  { id: 'map', label: 'Map', panel: 'panel-map' },
  { id: 'list', label: 'List', panel: 'panel-map' },
];

interface WorkspaceProps {
  /** A built-in sample's model (being read) or a loaded source's. */
  source: ApiModel | Promise<ApiModel>; tab: Tab; onTab: (tab: Tab) => void; wide: boolean; run: number;
  /** `#op=`: the operation whose details are open. */
  op?: string; onOp: (id: string | undefined, push: boolean) => void;
  q: string; onQ: (q: string) => void; hidden: Hidden; onHidden: (h: Hidden) => void;
  /** Open the keyboard shortcuts dialog (`?`, the search row's button). */
  onHelp: () => void;
}

/** The skill pane beside the map (desktop) or behind Skill | Map | List tabs (below 1024 px), D21. */
function Workspace({ source, tab, onTab, wide, run, op, onOp, q, onQ, hidden, onHidden, onHelp }: WorkspaceProps) {
  const isSample = source instanceof Promise;
  const model = isSample ? use(source) : source;
  const base = useMemo(() => buildGraph(model), [model]);
  // Lean AI (D23): user-loaded specs only, whose skill was written before they were shown, so the ask
  // (an effect, after paint) follows the deterministic skill and map; the answer swaps in cluster names
  // and skill prose unless "Use deterministic text" is on.
  const ai = useAi(model, base, !isSample);
  const [plainText, setPlainText] = useState(false);
  const aiText = !plainText ? ai : undefined;
  const graph = useMemo(() => (aiText ? applyAi(base, aiText.ai, aiText.summary) : base), [base, aiText]);
  const prose = useMemo(() => (aiText ? aiProse(graph, aiText.ai) : undefined), [graph, aiText]);
  const index = useMemo(() => searchIndex(model, graph), [model, graph]);
  const match = useMemo(() => matches(index, q, hidden), [index, q, hidden]);
  const edges = useMemo(() => graph.edges.filter((e) => edgeShown(e, match, hidden)), [graph, match, hidden]);
  const choices = useMemo(() => facets(model, graph), [model, graph]);
  const selected = model.operations.some((o) => o.id === op) ? op : undefined;
  const search = useRef<HTMLInputElement>(null);
  const [opts, setOpts] = useState({ hash: '', slug: '', license: 'MIT' });
  const slug = (opts.hash === model.hash && opts.slug) || skillSlug(model);
  const { skill, error } = useSkill(model, graph, slug, opts.license, run, prose);
  const [file, setFile] = useState('SKILL.md');
  const panes = useRef<HTMLDivElement>(null);
  const title = isSample ? `${model.source.title} (sample)` : model.source.title;
  const noun = model.source.kind === 'mcp' ? 'tools' : 'operations';
  const summary = `${model.operations.length} ${noun} in ${counted(graph.clusters.length, 'cluster')}, ${counted(graph.edges.length, 'relationship')}`;
  const view = tab === 'list' ? 'list' : 'map';
  const announce = useAnnounce();

  // Each new skill is announced with its audit (A2), after the sample's summary when the sample changed;
  // not on first load, where the page itself is the news.
  const said = useRef<{ hash: string; skill?: Skill }>({ hash: model.hash });
  useEffect(() => {
    if (!skill || skill.hash !== model.hash || said.current.skill === skill) return;
    const first = !said.current.skill;
    const news = said.current.hash !== model.hash ? `${model.source.title}: ${summary}. ` : '';
    said.current = { hash: model.hash, skill };
    const passed = skill.audit.checks.filter((c) => c.ok).length;
    const what = skill.prose === 'ai' ? 'Skill updated with AI-drafted names and prose' : 'Skill written';
    if (!first || news) announce(`${news}${what}: ${skill.audit.ok ? 'audit passed' : 'audit failed'}, ${passed} of ${skill.audit.checks.length} checks.`);
  }, [announce, skill, model.hash, model.source.title, summary]);
  // A spec without operations has no skill to announce: say the load finished, once per spec.
  const emptySaid = useRef('');
  useEffect(() => {
    if (model.operations.length > 0 || emptySaid.current === model.hash) return;
    emptySaid.current = model.hash;
    announce(`${title}: no operations. This spec has no paths, so there is no skill to write.`);
  }, [announce, model.operations.length, model.hash, title]);
  // Panes fill the first view from their measured page top (app.css reads --panes-top).
  useLayoutEffect(() => {
    const el = panes.current!;
    const measure = () => el.style.setProperty('--panes-top', `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the title above changes with the sample and the tabs with `wide`
  }, [wide, model.hash]);

  // `/` focuses search (from the Skill tab it opens the Map tab first) and `?` opens the shortcut help,
  // from anywhere but a text field or the dialog itself (A1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || (e.target as Element).closest?.('input, textarea, select, [contenteditable], dialog')) return;
      if (e.key === '?') onHelp();
      else if (e.key !== '/') return;
      else if (!wide && tab === 'skill') {
        onTab('map');
        requestAnimationFrame(() => search.current?.focus());
      } else search.current?.focus();
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [wide, tab, onTab, onHelp]);

  /** "In the skill": show that file in the pane (switching to the Skill tab on small screens). */
  const openFile = (path: string) => {
    setFile(path);
    if (!wide) onTab('skill');
    requestAnimationFrame(() => document.getElementById('skill-preview')?.focus());
  };
  const skillFile = skill?.hash === model.hash ? (id: string) => opFile(skill.tree, id) : undefined;
  const tabs = (
    <Tabs label="View" tabs={wide ? TABS.slice(1) : TABS} value={wide ? view : tab} onChange={onTab} />
  );
  return (
    <>
      <div className="title">
        <h2 id="result-title">{model.source.title}{isSample && <span className="h1-note"> (sample)</span>}</h2>
        {/* Spacing separates the parts on screen; a hidden comma separates them for screen readers and copy. */}
        <p className="lede"><span>{KIND_LABEL[model.source.kind]} {model.source.specVersion}</span><span className="visually-hidden">, </span><span>{summary}.</span></p>
        {model.warnings.length > 0 && (
          <details className="warnings">
            <summary>{model.warnings.length} {model.warnings.length === 1 ? 'warning' : 'warnings'}</summary>
            <ul>{model.warnings.slice(0, 100).map((w, i) => <li key={i}>{w.message}</li>)}</ul>
          </details>
        )}
      </div>
      {!wide && tabs}
      <div className="panes" ref={panes}>
        <SkillPane skill={skill} error={error} ready={skill?.hash === model.hash} empty={model.operations.length === 0}
          options={{ key: model.hash, slug, license: opts.license }} onOptions={(o) => setOpts({ hash: model.hash, ...o })}
          file={file} onFile={setFile} run={run} tabpanel={wide ? undefined : { hidden: tab !== 'skill' }}
          plainText={ai && { on: plainText, onChange: setPlainText }} />
        <div className="map-pane">
          {wide && tabs}
          <div className="sheet" id="panel-map" role="tabpanel" aria-labelledby={`tab-${view}`} hidden={!wide && tab === 'skill'} data-view={view}>
            {model.operations.length === 0 ? <EmptyChart /> : <>
            <Search q={q} onQ={onQ} hidden={hidden} onHidden={onHidden} facets={choices} count={match && match.size}
              total={model.operations.length} noun={noun} edges={{ shown: edges.length, total: graph.edges.length }} onHelp={onHelp} input={search} />
            {view === 'map' ? (
              <AtlasMap key={model.hash} model={model} graph={graph} base={base} skillFile={skillFile} onSkillFile={openFile} selected={selected} onSelect={onOp} match={match} edges={edges} />
            ) : (
              <ListView model={model} graph={graph} match={match} edges={edges} selected={selected} onSelect={(id) => onOp(id, true)} skillFile={skillFile} onSkillFile={openFile} announce={announce} />
            )}
            </>}
          </div>
        </div>
      </div>
    </>
  );
}

const NO_FILTER = { q: '', hidden: SHOW_ALL };
/** The URL's state; a link to an operation (#op=) opens on the Map tab, otherwise the skill comes first (D21). */
const here = (): UrlState => {
  const u = readUrl(window.location.href);
  return u.op && !u.view ? { ...u, view: 'map' } : u;
};

export function App() {
  // The URL is the source of truth (F13): each change writes history; back/forward re-read it.
  const [url, setUrl] = useState(here);
  const [find, setFind] = useState({ q: url.q, hidden: SHOW_ALL });
  const sample = getSample(url.sample ?? '') ?? getSample(DEFAULT_SAMPLE_ID)!;
  const tab: Tab = url.view ?? 'skill';
  const [run, setRun] = useState(0);
  const wide = useWide();
  // A loaded source (URL, text or file) is shown while the URL names no sample and the same `?url=`.
  const [user, setUser] = useState<{ url?: string; model: ApiModel }>();
  const mine = user && !url.sample && user.url === url.url ? user.model : undefined;
  const [job, setJob] = useState<{ ctl: AbortController; progress: Progress }>();
  const [failure, setFailure] = useState<Explained>();
  const field = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState('');
  const [help, setHelp] = useState(false);
  const showHelp = useCallback(() => setHelp(true), []);
  // A link with an unknown sample or view falls back; the address then says what is shown
  // (checked after every render, as back/forward can also land on such a link).
  useEffect(() => {
    const href = canonicalUrl(window.location.href, (id) => !!getSample(id), DEFAULT_SAMPLE_ID);
    if (href !== window.location.href) window.history.replaceState(null, '', href);
  });
  useEffect(() => {
    const onPop = () => {
      const next = here();
      startTransition(() => setUrl(next));
      setFind((f) => (f.q === next.q ? f : { ...f, q: next.q }));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  /** Merge `patch` into the URL: a new history entry when `push`, else replace the current one. */
  const go = (patch: Partial<UrlState>, push = false) => {
    const next = { ...here(), ...patch };
    const href = writeUrl(window.location.href, next);
    if (href !== window.location.href) window.history[push ? 'pushState' : 'replaceState'](null, '', href);
    setUrl(next);
  };
  // The search reaches the URL once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => readUrl(window.location.href).q !== find.q && go({ q: find.q }), 400);
    return () => clearTimeout(t);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `go` reads the URL itself; only the query matters
  }, [find.q]);
  /** A loaded source's skill is written before it is shown (the "Writing skill" step). */
  const write = (model: ApiModel, graph: AtlasGraph) => writeSkill(model, graph, skillSlug(model), 'MIT', run);
  /** Load a URL, text or file: steps while it loads, then its skill and map together (or an error). */
  const load = (input: Input, opened = false) => {
    job?.ctl.abort();
    const ctl = new AbortController();
    setFailure(undefined);
    setJob({ ctl, progress: { at: 'fetch', labels: {} } });
    const step = (at: Progress['at'], label: string) => setJob((j) => j?.ctl === ctl ? { ctl, progress: { at, labels: { ...j.progress.labels, [at]: label } } } : j);
    // The kind of source is detected (D37): a URL is tried as a spec, then as an MCP server.
    loadSource(input, 'auto', { fetch: (i, init) => fetch(i, init), signal: ctl.signal, step, write }).then(({ model }) => {
      if (ctl.signal.aborted) return;
      const at = 'url' in input ? input.url.trim() : undefined;
      setUser({ url: at, model });
      setDraft(at ?? ''); // pasted text has become the skill; a URL stays to say what is shown
      setJob(undefined);
      setFind(NO_FILTER);
      if (opened) return;
      const now = here();
      if (!now.sample && !now.url && !mine) go({ sample: sample.id }); // so back returns to it
      go({ sample: undefined, url: at, op: undefined, q: '' }, true);
    }, (error: unknown) => {
      if (ctl.signal.aborted) return;
      setJob(undefined);
      setFailure(explain(error));
    });
  };
  // `?url=` on open (and back/forward to one): load it unless it is already shown.
  useEffect(() => {
    if (url.url && user?.url !== url.url) load({ url: url.url }, true);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only a new ?url= starts a load
  }, [url.url]);
  const stop = () => {
    job?.ctl.abort();
    setJob(undefined);
    setFailure(undefined);
  };
  const select = (next: Sample) => {
    stop();
    if (next.id === sample.id && !mine) return go({ sample: next.id }); // name it in the URL, no new entry
    setFind(NO_FILTER);
    // keep the current sample visible while the next one is read
    startTransition(() => go({ sample: next.id, url: undefined, q: '', op: undefined }, true));
  };
  /** Generate with an empty field: write the skill again with the pane's options and bring the pane into view. */
  const generate = () => {
    if (job) return; // a load is in progress: writing now would rewrite the previous skill
    setRun((n) => n + 1);
    if (!wide) go({ view: 'skill' });
  };

  const status = job ? <LoadingSteps progress={job.progress} onCancel={() => (stop(), field.current?.focus())} />
    // The panel unmounts under its own buttons: focus goes to the field or the result frame, never to <body>.
    : failure && <ErrorPanel error={failure}
      onSample={() => (select(getSample(DEFAULT_SAMPLE_ID)!), requestAnimationFrame(() => document.getElementById('result')?.focus()))}
      onPaste={() => (stop(), field.current?.select(), field.current?.focus())} />;
  return (
    <Layout source={<SourceInput value={draft} onValue={setDraft} onLoad={(input) => load(input)} onGenerate={generate} field={field} />}
      samples={<Samples value={mine ? undefined : sample.id} onSelect={select} />} status={status} busy={!!job} onShortcuts={showHelp}>
      <Suspense fallback={<p className="lede">Reading the sample…</p>}>
        <Workspace source={mine ?? sampleModel(sample)} tab={tab} onTab={(view) => go({ view })} wide={wide} run={run} op={url.op} onOp={(op, push) => go({ op }, push)}
          q={find.q} onQ={(q) => setFind((f) => ({ ...f, q }))} hidden={find.hidden} onHidden={(hidden) => setFind((f) => ({ ...f, hidden }))} onHelp={showHelp} />
      </Suspense>
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </Layout>
  );
}
