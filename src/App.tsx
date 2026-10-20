import { DEFAULT_SAMPLE_ID, getSample } from './samples';
import { quickList, quickTitle } from './samples/quick-list';

export function App() {
  const spec = getSample(DEFAULT_SAMPLE_ID)?.load();
  const title = `${quickTitle(spec)} (sample)`;
  const ops = quickList(spec);

  return (
    <main className="app">
      <p className="wordmark">tool-atlas</p>
      <h1>{title}</h1>
      <p className="lede">
        {ops.length} operations. The interactive atlas arrives in a later phase; this is the
        built-in sample, rendered offline.
      </p>
      <ul className="ops" data-testid="sample-list" aria-label={`Operations in ${title}`}>
        {ops.map((op) => (
          <li key={`${op.method} ${op.path}`}>
            <span className="method">{op.method}</span> <code>{op.path}</code>
            {op.summary && <span className="summary"> {op.summary}</span>}
          </li>
        ))}
      </ul>
    </main>
  );
}
