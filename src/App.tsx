import { Suspense, useCallback, startTransition, use, useEffect, useMemo, useRef, useState } from 'react';
import { useAnnounce } from './a11y/Announcer';
import { aiProse, applyAi } from './ai/client';
import { useAi } from './ai/useAi';
import { buildGraph } from './graph';
import { counted } from './graph/words';
import { ListView } from './list/ListView';
import { drawnWorkflow } from './layout/route';
import { Legend } from './map/Legend';
import { RouteMap } from './map/RouteMap';
import { Search } from './map/Search';
import { ShortcutHelp } from './map/ShortcutHelp';
import type { AtlasGraph } from './graph';
import type { ApiModel } from './model/types';
import { ResultHead } from './result/ResultHead';
import { WorkflowCaption } from './result/WorkflowCaption';
import { DEFAULT_SAMPLE_ID, type Sample, getSample, sampleModel } from './samples';
import { Layout } from './shell/Layout';
import { type TabDef, Tabs, usePhone } from './shell/Tabs';
import { topChains } from './skillgen/graph-chains';
import { skillSlug } from './skillgen/slug';
import { type Explained, explain } from './source/errors';
import { type Input, loadSource } from './source/fetchSource';
import { Samples } from './source/Samples';
import { SourceInput } from './source/SourceInput';
import { EmptyChart, ErrorPanel, LoadingSteps, type Progress } from './source/Status';
import { SkillBrowser } from './skillpane/SkillBrowser';
import { opFile } from './skillpane/tree';
import { type Skill, useSkill, writeSkill } from './skillpane/useSkill';
import { edgeShown, matches, searchIndex } from './state/filter';
import { type UrlState, type View, canonicalUrl, readUrl, writeUrl } from './state/url';

interface WorkspaceProps {
  /** A built-in sample's model (being read) or a loaded source's. */
  source: ApiModel | Promise<ApiModel>; view: View; onView: (view: View) => void; phone: boolean; run: number;
  /** `#op=`: the operation whose card is pinned. */
  op?: string; onOp: (id: string | undefined, push: boolean) => void;
  q: string; onQ: (q: string) => void;
  /** Open the keyboard shortcuts dialog (`?`). */
  onHelp: () => void;
}

const VIEW_TABS: TabDef<View>[] = [
  { id: 'map', label: 'Map', panel: 'panel-map' },
  { id: 'list', label: 'List', panel: 'panel-map' },
];

/**
 * The result (docs/redesign/DESIGN.md 4.3 and 6): the head, the tools row, the map or the list, the
 * strongest workflow in words, then the skill browser. One scroll at every width (R5); phones open
 * on the list.
 */
function Workspace({ source, view, onView, phone, run, op, onOp, q, onQ, onHelp }: WorkspaceProps) {
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
  const index = useMemo(() => searchIndex(model), [model]);
  const match = useMemo(() => matches(index, q), [index, q]);
  const edges = useMemo(() => graph.edges.filter((e) => edgeShown(e, match)), [graph, match]);
  // The strongest workflow, once per model: topChains takes 100-190 ms on a 1000-operation spec.
  const chain = useMemo(() => topChains(model, base, 1)[0] ?? null, [model, base]);
  // ... and as the map draws it (forward only), for the caption and the list's stop discs.
  const workflow = useMemo(() => drawnWorkflow(base, chain), [base, chain]);
  const required = useMemo(() => new Map(model.operations.map((o) => [o.id, new Set(o.inputs.filter((p) => p.required).map((p) => p.name))])), [model]);
  const selected = model.operations.some((o) => o.id === op) ? op : undefined;
  const search = useRef<HTMLInputElement>(null);
  const [opts, setOpts] = useState({ hash: '', slug: '', license: 'MIT' });
  const slug = (opts.hash === model.hash && opts.slug) || skillSlug(model);
  const { skill, error } = useSkill(model, graph, slug, opts.license, run, prose);
  const ready = skill?.hash === model.hash;
  // The file shown in the skill browser; on phones whether its full-width preview is open.
  const [file, setFile] = useState({ path: 'SKILL.md', open: false });
  const noun = model.source.kind === 'mcp' ? 'tools' : 'operations';
  const summary = `${model.operations.length} ${noun} in ${counted(graph.clusters.length, 'resource')}, ${counted(graph.edges.length, 'link')}`;
  const announce = useAnnounce();
  const empty = model.operations.length === 0;

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
    if (!empty || emptySaid.current === model.hash) return;
    emptySaid.current = model.hash;
    announce(`${model.source.title}: no operations. This spec has no paths, so there is no skill to write.`);
  }, [announce, empty, model.hash, model.source.title]);
  // `/` focuses search and `?` opens the shortcut help, from anywhere but a text field or the dialog itself (A1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || (e.target as Element).closest?.('input, textarea, select, [contenteditable], dialog')) return;
      if (e.key === '?') onHelp();
      else if (e.key !== '/') return;
      else search.current?.focus();
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onHelp]);

  /** "In skill": show that file in the skill browser's preview (opened full width on phones). */
  const openFile = (path: string) => {
    setFile({ path, open: true });
    requestAnimationFrame(() => {
      const el = document.getElementById('skill-preview');
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: 'nearest' });
    });
  };
  const skillFile = ready ? (id: string) => opFile(skill.tree, id) : undefined;
  const caption = workflow && <WorkflowCaption chain={workflow} required={(id) => required.get(id) ?? new Set()} compact={phone && view === 'list'} />;
  return (
    <>
      <ResultHead key={model.hash} model={model} sample={isSample} resources={graph.clusters.length} links={graph.edges.length}
        skill={ready ? skill : undefined} ready={ready} slug={slug} phone={phone} />
      {!empty && (
        <div className="tools">
          <div className="tools-l">
            <Tabs label="View" tabs={VIEW_TABS} value={view} onChange={onView} />
            <Search q={q} onQ={onQ} count={match && match.size} total={model.operations.length} noun={noun} input={search} />
          </div>
          {view === 'map' && <Legend workflow={!!workflow} />}
        </div>
      )}
      {view === 'list' && caption}
      <div className="sheet" id="panel-map" role="tabpanel" aria-labelledby={`tab-${view}`} data-view={view}>
        {empty ? <EmptyChart /> : view === 'map' ? (
          <RouteMap key={model.hash} model={model} graph={graph} base={base} chain={chain} skillFile={skillFile} onSkillFile={openFile} selected={selected} onSelect={onOp} match={match} edges={edges} />
        ) : (
          <ListView key={model.hash} model={model} graph={graph} match={match} edges={edges} workflow={workflow} selected={selected} onSelect={(id) => onOp(id, true)}
            skillFile={skillFile} onSkillFile={openFile} announce={announce} phone={phone} />
        )}
      </div>
      {view === 'map' && caption}
      <SkillBrowser skill={skill} error={error} ready={ready} empty={empty}
        options={{ key: model.hash, slug, license: opts.license }} onOptions={(o) => setOpts({ hash: model.hash, ...o })}
        file={file.path} open={file.open} onFile={(path) => setFile({ path, open: true })} onClose={() => setFile((f) => ({ ...f, open: false }))}
        run={run} phone={phone} plainText={ai && { on: plainText, onChange: setPlainText }} />
    </>
  );
}

const here = (): UrlState => readUrl(window.location.href);

export function App() {
  // The URL is the source of truth (F13): each change writes history; back/forward re-read it.
  const [url, setUrl] = useState(here);
  const [find, setFind] = useState(url.q);
  const sample = getSample(url.sample ?? '') ?? getSample(DEFAULT_SAMPLE_ID)!;
  const [run, setRun] = useState(0);
  const phone = usePhone();
  // Without `?view=`, the map on desktop and the list on phones (DESIGN.md 6).
  const view: View = url.view ?? (phone ? 'list' : 'map');
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
      setFind(next.q);
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
    const t = setTimeout(() => readUrl(window.location.href).q !== find && go({ q: find }), 400);
    return () => clearTimeout(t);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- `go` reads the URL itself; only the query matters
  }, [find]);
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
      setFind('');
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
    setFind('');
    // keep the current sample visible while the next one is read
    startTransition(() => go({ sample: next.id, url: undefined, q: '', op: undefined }, true));
  };
  /** Generate with an empty field: write the skill again with the browser's options and bring its files heading into view. */
  const generate = () => {
    if (job) return; // a load is in progress: writing now would rewrite the previous skill
    setRun((n) => n + 1);
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
        <Workspace source={mine ?? sampleModel(sample)} view={view} onView={(v) => go({ view: v })} phone={phone} run={run} op={url.op} onOp={(op, push) => go({ op }, push)}
          q={find} onQ={setFind} onHelp={showHelp} />
      </Suspense>
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </Layout>
  );
}
