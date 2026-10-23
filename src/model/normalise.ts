// One entry point for every source kind: detect the document, then normalise it.
import { detect } from '../parse/detect';
import { ParseError } from '../parse/text';
import { type McpOptions, normaliseMcp } from './mcp';
import { normaliseOpenApi3 } from './openapi3';
import { normaliseSwagger2 } from './swagger2';
import type { ApiModel } from './types';

/** `serverInfo`/`protocolVersion` only apply to MCP documents. Throws ParseError('unsupported'). */
export function normalise(doc: unknown, options: McpOptions = {}): Promise<ApiModel> {
  const found = detect(doc);
  switch (found.kind) {
    case 'openapi3':
      return normaliseOpenApi3(doc, { url: options.url });
    case 'swagger2':
      return normaliseSwagger2(doc, { url: options.url });
    case 'mcp':
      return normaliseMcp(doc, options);
    case 'unsupported':
      return Promise.reject(new ParseError('unsupported', found.message));
  }
}
