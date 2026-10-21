// Every way loading a user's source can fail (PLAN 3.6), as one data table: a plain-language title,
// the reason, and any command that helps. The panel always offers "Paste spec text instead" and
// "Try a sample". Codes match the Worker's (worker/errors.ts) plus the ones only the browser sees.
import { ParseError } from '../parse/text';

export type SourceErrorCode =
  | 'invalid-url' | 'blocked-host' | 'timeout' | 'too-large' | 'http-error' | 'needs-auth' | 'legacy-transport'
  | 'rate-limited' | 'proxy-unavailable' | 'html-page' | 'not-a-spec' | 'unsupported';

const INSPECTOR = 'npx @modelcontextprotocol/inspector --cli <url> --method tools/list';

const TABLE: Record<SourceErrorCode, { title: string; reason: string; command?: string }> = {
  'invalid-url': { title: 'That is not a web address spec2skill can fetch', reason: 'Use a full http:// or https:// URL, such as https://example.com/openapi.json.' },
  'blocked-host': { title: 'spec2skill can only fetch public URLs', reason: 'Paste the spec text to turn a private API into a skill. (The CLI fetches directly from your machine and has no such limit.)' },
  timeout: { title: 'The server took too long to answer', reason: 'Nothing arrived within 10 seconds. Try again later, or paste the spec text.' },
  'too-large': { title: 'The spec is too large', reason: 'spec2skill reads documents up to 5 MB.' },
  'http-error': { title: 'The server answered with an error', reason: 'Check the URL, or paste the spec text.' },
  'needs-auth': { title: 'This server needs credentials', reason: 'spec2skill never sends credentials. Record the response yourself and paste it: download the spec, or for an MCP server run:', command: INSPECTOR },
  'legacy-transport': { title: 'This MCP server uses the older HTTP+SSE transport', reason: 'spec2skill speaks Streamable HTTP. Record tools/list yourself and paste the result:', command: INSPECTOR },
  'rate-limited': { title: 'Too many requests', reason: 'Try again in a minute, or paste the spec text.' },
  'proxy-unavailable': { title: 'The fetch proxy is not running', reason: 'This page cannot fetch that URL by itself. Paste the spec text, or when running locally start the proxy:', command: 'pnpm dev:worker' },
  'html-page': { title: 'This looks like a documentation page', reason: 'Paste the spec URL instead (often ending in /openapi.json or /swagger.json).' },
  'not-a-spec': { title: 'This is not JSON or YAML', reason: 'spec2skill reads OpenAPI 3.0/3.1, Swagger 2.0 and MCP tools/list responses.' },
  unsupported: { title: 'This is not an OpenAPI, Swagger or MCP document', reason: '' },
};

export class SourceError extends Error {
  readonly code: SourceErrorCode;
  constructor(code: SourceErrorCode, detail = '') {
    super(detail);
    this.name = 'SourceError';
    this.code = code;
  }
}

export const isSourceErrorCode = (code: unknown): code is SourceErrorCode => typeof code === 'string' && Object.hasOwn(TABLE, code);

export interface Explained { code: SourceErrorCode; title: string; reason: string; command?: string }

/** The table entry for anything thrown while loading; `detail` (a status, what was detected) comes first. */
export function explain(error: unknown): Explained {
  const e = error instanceof ParseError
    ? new SourceError(error.code === 'too-large' ? 'too-large' : error.code === 'unsupported' ? 'unsupported' : 'not-a-spec', error.message)
    : error instanceof SourceError ? error : new SourceError('http-error', 'Something went wrong while reading the source.');
  const row = TABLE[e.code];
  return { code: e.code, title: row.title, reason: [e.message, row.reason].filter(Boolean).join(' '), ...(row.command && { command: row.command }) };
}
