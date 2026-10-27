// The operation card (docs/DESIGN.md 5): method and path, title, then a definition list of
// inputs, output, links and the skill file. On hover or focus it previews (hidden from assistive
// tech: the row's name carries the essentials, the pinned card the rest); click or Enter pins it,
// which adds Close, the description, output fields, auth, links that move to the related operation
// and a ready-to-paste example (it replaces the detail panel, D46). Spec strings are React text only.
import { type CSSProperties, Fragment, type ReactNode, useEffect, useId, useRef } from 'react';
import { checkIcon } from '../design/icons';
import { Swap } from '../design/motion';
import type { AtlasGraph } from '../graph';
import { example, outputFields, typeLabel } from '../model/examples';
import type { ApiModel, Operation } from '../model/types';
import { useFlash } from '../result/useFlash';
import { edgesOf, relation } from './keyboard';
import { Breakable } from '../design/breaks';

/** Items separated by commas. */
const list = (items: ReactNode[]) => items.map((item, i) => <Fragment key={i}>{i > 0 && ', '}{item}</Fragment>);

/** A feed's label as the map writes it, one mapping per unbreakable piece: "id -> taskId" becomes "id → taskId". */
const arrow = (via: string) => list(via.split(', ').map((m) => <span className="nowrap" key={m}>{m.replaceAll(' -> ', ' → ')}</span>));

/**
 * The hover preview lists at most this many inputs, and of each group of related operations, then
 * "and N more" (the pinned card lists them all), so every preview fits above the skill browser (D80).
 */
const PREVIEW_MAX = 4;

export const opName = (op: Operation): string => (op.kind === 'tool' ? op.id : `${op.method!.toUpperCase()} ${op.path}`);

/** The card's link groups (DESIGN.md 5), in display order, with the relations each one lists. */
const GROUPS = [
  ['Fed by', 'Fed by'],
  ['Feeds', 'Feeds'],
  ['Shares schema', 'Shares a schema'],
  ['Sub-paths', 'Sub-paths'],
  ['Sub-path of', 'Parent path'],
] as const;

export interface OpLinks { group: (typeof GROUPS)[number][0]; items: { id: string; via?: string }[] }

/** The operation's links grouped as the card lists them; each other operation once per group. */
export function opLinks(graph: AtlasGraph, id: string): OpLinks[] {
  const related = edgesOf(graph.edges, id).map((e) => relation(e, id));
  return GROUPS.map(([group, rel]) => {
    const seen = new Set<string>();
    const items = related.filter((r) => r.group === rel && !seen.has(r.other) && seen.add(r.other)).map((r) => ({ id: r.other, ...(r.via ? { via: r.via } : {}) }));
    return { group, items };
  }).filter((g) => g.items.length > 0);
}

interface OpCardProps {
  model: ApiModel;
  graph: AtlasGraph;
  op: Operation;
  /** Pinned: a non-modal dialog with Close; otherwise a preview hidden from assistive tech. */
  pinned: boolean;
  /** The skill file that documents `op`, opened in the skill preview by `onInSkill`. */
  inSkill?: string;
  onInSkill: (path: string) => void;
  /** Pinned only: move to a related operation. */
  onGo?: (id: string) => void;
  onClose?: () => void;
  announce?: (text: string) => void;
  className?: string;
  style?: CSSProperties;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

export function OpCard({ model, graph, op, pinned, inSkill, onInSkill, onGo, onClose, announce, className, style, onPointerEnter, onPointerLeave }: OpCardProps) {
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [copied, flashCopied] = useFlash();
  // Escape anywhere in the pinned card closes it (focus goes back to the row, the caller's job).
  useEffect(() => {
    const el = root.current;
    if (!el || !pinned || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), onClose());
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [pinned, onClose]);

  const links = opLinks(graph, op.id);
  const output = pinned ? outputFields(model, op.output?.schema) : [];
  const schemes = pinned ? model.auth.filter((a) => op.security.some((set) => set.includes(a.id))) : [];
  const code = pinned ? example(model, op) : '';
  const copy = () =>
    navigator.clipboard.writeText(code).then(
      () => {
        flashCopied();
        announce?.('Example copied to the clipboard.');
      },
      () => announce?.('Copy failed: select the example text and copy it.'),
    );
  // In the preview a long list of related operations stops at PREVIEW_MAX: "a, b, c, d, and 3 more".
  const few = (items: ReactNode[]): ReactNode[] => (pinned || items.length <= PREVIEW_MAX ? items
    : [...items.slice(0, PREVIEW_MAX), <span className="muted" key="more">and {items.length - PREVIEW_MAX} more</span>]);
  // A related operation: a button in the pinned card, plain text in the preview (nothing in it takes focus).
  const other = (id: string): ReactNode => (pinned && onGo ? <button type="button" className="oc-link mono" onClick={() => onGo(id)}><Breakable text={id} /></button> : <span className="mono"><Breakable text={id} /></span>);

  return (
    <div ref={root} className={`op-card${className ? ` ${className}` : ''}`} style={style} data-testid={pinned ? 'op-card' : 'op-preview'}
      role={pinned ? 'dialog' : undefined} aria-labelledby={pinned ? titleId : undefined} aria-hidden={pinned ? undefined : true}
      onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <div className="oc-head">
        <p className="oc-path mono"><Breakable text={opName(op)} /></p>
        {pinned && onClose && <button type="button" className="oc-close" onClick={onClose}>Close<span className="visually-hidden"> details</span></button>}
      </div>
      <h3 className="oc-title" id={titleId}><span className="visually-hidden">{opName(op)}, </span>{op.title}{op.deprecated && <span className="oc-flag">deprecated</span>}</h3>
      {pinned && op.description && op.description !== op.title && <p className="oc-desc">{op.description}</p>}
      <dl>
        <dt>Input</dt>
        <dd>
          {op.inputs.length === 0 ? 'None' : (pinned ? op.inputs : op.inputs.slice(0, PREVIEW_MAX)).map((p, i) => (
            <span className="oc-input" key={`${p.in} ${p.name}`}>{i > 0 && <br />}<span className="mono"><Breakable text={p.name} /></span> <span className="muted">{[p.in, typeLabel(p.schema), p.required && 'required'].filter(Boolean).join(', ')}</span></span>
          ))}
          {!pinned && op.inputs.length > PREVIEW_MAX && <span className="oc-more muted"><br />and {op.inputs.length - PREVIEW_MAX} more</span>}
        </dd>
        <dt>Output</dt>
        <dd>
          {op.output ? <span className="mono"><Breakable text={typeLabel(op.output.schema)} /></span> : 'None described'}
          {output.length > 0 && <span className="oc-fields muted"> with {list(output.map((f) => <span className="mono" key={f.name}><Breakable text={f.name} /></span>))}</span>}
        </dd>
        {schemes.length > 0 && <>
          <dt>Auth</dt>
          <dd>{list(schemes.map((a) => <span key={a.id}><span className="mono"><Breakable text={a.id} /></span> <span className="muted">{[a.type, a.scheme, a.bearerFormat, a.in && `in ${a.in}`, a.name].filter(Boolean).join(' ')}</span></span>))}</dd>
        </>}
        {links.map(({ group, items }) => (
          <Fragment key={group}>
            <dt>{group}</dt>
            <dd>
              {group === 'Shares schema'
                ? list([...new Set(items.map((x) => x.via ?? ''))].map((schema) => <span key={schema}><span className="mono"><Breakable text={schema} /></span> <span className="muted">with</span> {list(few(items.filter((x) => (x.via ?? '') === schema).map((x) => other(x.id))))}</span>))
                : pinned && (group === 'Fed by' || group === 'Feeds')
                  // Pinned, a feed says which field fills which parameter, under the operation: "listTasks" / "id → taskId".
                  ? items.map((x) => <span className="oc-feed" key={x.id}>{other(x.id)}{x.via && <span className="oc-via">{arrow(x.via)}</span>}</span>)
                  : list(few(items.map((x) => other(x.id))))}
            </dd>
          </Fragment>
        ))}
        {inSkill && <>
          <dt>In skill</dt>
          {/* In the preview the link is for the pointer only (tabIndex -1): the preview is hidden from assistive tech. */}
          <dd><button type="button" className="oc-ref mono" tabIndex={pinned ? undefined : -1} onClick={() => onInSkill(inSkill)} aria-label={`Show ${inSkill} in the skill`}><Breakable text={inSkill} /></button></dd>
        </>}
      </dl>
      {pinned && <>
        {/* One line per command line, scrolled sideways: wrapping would strand the trailing \.
            The scroller is a Tab stop so keyboard users can scroll it (axe scrollable-region-focusable). */}
        {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <pre className="oc-example" data-testid="example" aria-label="Example request" tabIndex={0}><code>{code}</code></pre>
        {/* Copied: the label swaps to a check and "Copied" for 2 s, as the head's buttons (DESIGN.md 7). */}
        <p className="oc-actions"><button type="button" className="oc-copy" onClick={copy}><Swap id={String(copied)}>{copied && checkIcon(16)}{copied ? 'Copied' : 'Copy example'}</Swap></button></p>
      </>}
    </div>
  );
}
