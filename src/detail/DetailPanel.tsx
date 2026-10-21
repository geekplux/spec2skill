// The selected operation, explained (F10): inputs, output fields, auth, related operations and a
// ready-to-paste example. Spec strings are rendered as React text only (S3): never as HTML.
import { useEffect, useRef } from 'react';
import type { AtlasGraph } from '../graph';
import { RELATIONS, edgesOf, relation } from '../map/keyboard';
import { example, outputFields, typeLabel } from '../model/examples';
import type { ApiModel, Operation } from '../model/types';

interface DetailProps {
  model: ApiModel;
  graph: AtlasGraph;
  op: Operation;
  /** Move map focus to another operation (the panel follows it). */
  onGo: (id: string) => void;
  onClose: () => void;
  announce: (text: string) => void;
}

export const opName = (op: Operation): string => (op.kind === 'tool' ? op.id : `${op.method!.toUpperCase()} ${op.path}`);

export function DetailPanel({ model, graph, op, onGo, onClose, announce }: DetailProps) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = root.current!;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), onClose());
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byId = new Map(model.operations.map((o) => [o.id, o]));
  const related = edgesOf(graph.edges, op.id).map((e) => relation(e, op.id));
  const output = outputFields(model, op.output?.schema);
  const schemes = model.auth.filter((a) => op.security.some((set) => set.includes(a.id)));
  const cluster = graph.clusters.find((c) => c.operationIds.includes(op.id))?.name;
  const code = example(model, op);
  const copy = () =>
    navigator.clipboard.writeText(code).then(
      () => announce('Example copied to the clipboard.'),
      () => announce('Copy failed: select the example text and copy it.'),
    );

  return (
    <section className="detail" ref={root} aria-labelledby="detail-title" data-testid="detail">
      <div className="detail-head">
        <p className="kicker">{op.kind === 'tool' ? 'MCP tool' : 'Endpoint'} · {cluster}</p>
        <button type="button" className="btn" onClick={onClose}>Close <span className="visually-hidden">details</span></button>
      </div>
      <h2 id="detail-title"><code>{opName(op)}</code></h2>
      <p>{op.title}{op.deprecated && <span className="flag">deprecated</span>}</p>
      {op.description && op.description !== op.title && <p className="desc">{op.description}</p>}

      <h3>Inputs</h3>
      {op.inputs.length === 0 ? <p>None.</p> : (
        <table>
          <thead><tr><th scope="col">Name</th><th scope="col">In</th><th scope="col">Type</th><th scope="col">Required</th></tr></thead>
          <tbody>
            {op.inputs.map((p) => (
              <tr key={`${p.in} ${p.name}`}><td><code>{p.name}</code></td><td>{p.in}</td><td><code>{typeLabel(p.schema)}</code></td><td>{p.required ? 'yes' : 'no'}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Output{op.output && <> <code>{typeLabel(op.output.schema)}</code></>}</h3>
      {output.length === 0 ? <p>{op.output ? 'No named fields.' : 'None described.'}</p> : (
        <ul className="fields">
          {output.map((f) => <li key={f.name}><code>{f.name}</code>: <code>{typeLabel(f)}</code>{f.required && ' (required)'}</li>)}
        </ul>
      )}

      <h3>Auth</h3>
      {schemes.length === 0 ? <p>None.</p> : (
        <ul className="fields">
          {schemes.map((a) => <li key={a.id}><code>{a.id}</code>: {[a.type, a.scheme, a.bearerFormat, a.in && `in ${a.in}`, a.name].filter(Boolean).join(' ')}</li>)}
        </ul>
      )}

      <h3>Related</h3>
      {related.length === 0 && <p>No relationships.</p>}
      {RELATIONS.map((group) => {
        const items = related.filter((r) => r.group === group);
        return items.length > 0 && (
          <section key={group} aria-label={group}>
            <h4>{group}</h4>
            <ul className="related">
              {items.map((r) => (
                <li key={r.other}>
                  <button type="button" className="link" onClick={() => onGo(r.other)}>{opName(byId.get(r.other)!)}</button>
                  {r.via && <> via <code>{r.via}</code></>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <h3>Example</h3>
      <pre className="example" data-testid="example"><code>{code}</code></pre>
      <button type="button" className="btn" onClick={copy}>Copy example</button>
    </section>
  );
}
