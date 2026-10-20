import { describe, expect, it } from 'vitest';
import { MAX_SPEC_BYTES, ParseError, parseText } from './text';

function errorOf(fn: () => unknown): ParseError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ParseError) return error;
    throw error;
  }
  throw new Error('expected a ParseError');
}

describe('parseText', () => {
  it('parses JSON, YAML and YAML flow mappings', () => {
    expect(parseText('{"openapi":"3.1.0"}')).toEqual({ format: 'json', value: { openapi: '3.1.0' } });
    expect(parseText('﻿openapi: 3.1.0\npaths: {}\n')).toEqual({ format: 'yaml', value: { openapi: '3.1.0', paths: {} } });
    expect(parseText('{openapi: 3.0.3}')).toEqual({ format: 'yaml', value: { openapi: '3.0.3' } });
  });

  it('builds plain data only: dates stay strings, custom tags are rejected', () => {
    expect(parseText('version: 2026-10-19').value).toEqual({ version: '2026-10-19' });
    expect(errorOf(() => parseText('x: !!js/function "function () {}"')).code).toBe('syntax');
  });

  it('rejects oversized input with a typed error (default cap 5 MB, counted in UTF-8 bytes)', () => {
    expect(MAX_SPEC_BYTES).toBe(5 * 1024 * 1024);
    expect(errorOf(() => parseText(`a: "${'x'.repeat(MAX_SPEC_BYTES)}"`)).code).toBe('too-large');
    expect(errorOf(() => parseText('a: ééé', { maxBytes: 8 })).code).toBe('too-large');
    expect(parseText('a: é', { maxBytes: 8 }).value).toEqual({ a: 'é' });
  });

  it('gives typed errors for text that is not a JSON or YAML document', () => {
    expect(errorOf(() => parseText('  \n')).code).toBe('empty');
    expect(errorOf(() => parseText('{"openapi": ')).code).toBe('syntax');
    expect(errorOf(() => parseText('a: [1, 2\nb: }')).code).toBe('syntax');
    const prose = errorOf(() => parseText('This is just a sentence about an API.'));
    expect(prose.code).toBe('not-a-document');
    expect(prose).toBeInstanceOf(Error);
    expect(errorOf(() => parseText('42')).code).toBe('not-a-document');
  });
});
