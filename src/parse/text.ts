// JSON or YAML text -> a plain document, with a size cap. Spec text is untrusted:
// js-yaml's CORE_SCHEMA builds only plain data (no functions, dates or custom tags),
// and nothing is ever evaluated.
import { CORE_SCHEMA, load } from 'js-yaml';

export const MAX_SPEC_BYTES = 5 * 1024 * 1024;

export type ParseErrorCode = 'too-large' | 'empty' | 'syntax' | 'not-a-document' | 'unsupported';

export class ParseError extends Error {
  readonly code: ParseErrorCode;
  constructor(code: ParseErrorCode, message: string) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

export interface ParsedText {
  format: 'json' | 'yaml';
  value: Record<string, unknown> | unknown[];
}

function byteLength(text: string, maxBytes: number): number {
  // Every UTF-16 unit is at least one UTF-8 byte and at most three, so only encode when needed.
  if (text.length > maxBytes || text.length * 3 <= maxBytes) return text.length;
  return new TextEncoder().encode(text).length;
}

function firstLine(message: string): string {
  return (message.split('\n')[0] ?? message).slice(0, 300);
}

export function parseText(text: string, { maxBytes = MAX_SPEC_BYTES }: { maxBytes?: number } = {}): ParsedText {
  const bytes = byteLength(text, maxBytes);
  if (bytes > maxBytes) {
    throw new ParseError('too-large', `The document is larger than ${Math.round(maxBytes / 1024)} KB.`);
  }
  const trimmed = text.replace(/^﻿/, '').trim();
  if (trimmed === '') throw new ParseError('empty', 'The document is empty.');

  let format: ParsedText['format'] = 'yaml';
  let value: unknown;
  let jsonError: unknown;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      value = JSON.parse(trimmed);
      format = 'json';
    } catch (error) {
      jsonError = error; // may still be a YAML flow mapping such as `{openapi: 3.1.0}`
    }
  }
  if (format === 'yaml') {
    try {
      // `json: true`: duplicate keys keep the last value instead of failing (as JSON.parse does).
      value = load(trimmed, { schema: CORE_SCHEMA, json: true });
    } catch (error) {
      const shown = jsonError ?? error;
      const reason = shown instanceof Error ? firstLine(shown.message) : 'unknown error';
      throw new ParseError('syntax', `Not valid ${jsonError ? 'JSON' : 'JSON or YAML'}: ${reason}`);
    }
  }
  if (typeof value !== 'object' || value === null) {
    throw new ParseError('not-a-document', 'The text is neither a JSON nor a YAML object.');
  }
  return { format, value: value as ParsedText['value'] };
}
