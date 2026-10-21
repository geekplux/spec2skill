// The header's one prominent control (docs/DESIGN.md): paste a URL or spec text; the source type
// and "Open file" wait behind "More options". Enter submits, Shift+Enter adds a line.
import { type FormEvent, type KeyboardEvent, type RefObject, useState } from 'react';
import { type Input, type Mode, isUrlInput } from './fetchSource';

const MODES = [['auto', 'Auto-detect'], ['openapi', 'OpenAPI / Swagger'], ['mcp', 'MCP server']] as const;

interface SourceInputProps {
  /** The field's text; the app clears it once pasted text is loaded and shows a loaded URL. */
  value: string;
  onValue: (value: string) => void;
  onLoad: (input: Input, mode: Mode) => void;
  field: RefObject<HTMLTextAreaElement | null>;
}

export function SourceInput({ value, onValue, onLoad, field }: SourceInputProps) {
  const [mode, setMode] = useState<Mode>('auto');
  const [more, setMore] = useState(false);
  const submit = (e: FormEvent | KeyboardEvent) => {
    e.preventDefault();
    const text = value.trim();
    if (text) onLoad(isUrlInput(text) ? { url: text } : { text }, mode);
  };
  return (
    <form className="source" onSubmit={submit}>
      <div className="source-row">
        <label htmlFor="source-field" className="visually-hidden">OpenAPI or MCP URL, or spec text</label>
        <textarea id="source-field" ref={field} className="input" rows={1} value={value} spellCheck={false} autoComplete="off"
          placeholder="Paste an OpenAPI or MCP URL, or spec text" onChange={(e) => onValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && submit(e)} />
        <button type="submit" className="btn">Load</button>
        <button type="button" className="link" aria-expanded={more} aria-controls="source-more" onClick={() => setMore(!more)}>More options</button>
      </div>
      <div id="source-more" className="source-more" hidden={!more}>
        <label>Source{' '}
          <select className="field" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {MODES.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="btn file">
          Open file…
          <input type="file" className="visually-hidden" accept=".json,.yaml,.yml,application/json,application/yaml"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) onLoad({ file }, mode);
              setMore(false);
            }} />
        </label>
      </div>
    </form>
  );
}
