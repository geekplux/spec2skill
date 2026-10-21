import { describe, expect, it } from 'vitest';
import { ProxyError } from './errors';
import { checkUrl } from './ssrf';

function outcome(raw: string): string {
  try {
    checkUrl(raw);
    return 'ok';
  } catch (error) {
    if (error instanceof ProxyError) return error.code;
    throw error;
  }
}

const BLOCKED: [string, string][] = [
  // loopback, including the numeric forms the URL parser normalises
  ['http://127.0.0.1/', 'loopback'],
  ['http://127.1.2.3:8080/', 'loopback /8'],
  ['http://2130706433/', 'decimal loopback'],
  ['http://0x7f.1/', 'hex short loopback'],
  ['http://0x7f000001/', 'hex loopback'],
  ['http://0177.0.0.1/', 'octal loopback'],
  ['http://127.1/', 'short loopback'],
  ['http://127.0.0.1./', 'trailing dot'],
  // RFC 1918, CGNAT, this-network, link-local, metadata
  ['http://10.0.0.1/', '10/8'],
  ['http://10.255.255.255/', '10/8 top'],
  ['http://172.16.0.1/', '172.16/12'],
  ['http://172.31.255.254/', '172.16/12 top'],
  ['http://192.168.1.1/', '192.168/16'],
  ['http://100.64.0.1/', 'CGNAT'],
  ['http://100.127.255.255/', 'CGNAT top'],
  ['http://0.0.0.0/', '0/8'],
  ['http://0/', 'zero'],
  ['http://169.254.169.254/latest/meta-data/', 'metadata'],
  ['http://169.254.1.1/', 'link-local'],
  ['http://224.0.0.1/', 'multicast'],
  ['http://239.255.255.250/', 'multicast top'],
  ['http://255.255.255.255/', 'broadcast'],
  ['http://198.18.0.1/', 'benchmarking'],
  ['http://192.0.2.10/', 'TEST-NET-1'],
  // IPv6
  ['http://[::1]/', 'v6 loopback'],
  ['http://[::]/', 'v6 unspecified'],
  ['http://[::ffff:127.0.0.1]/', 'v4-mapped loopback'],
  ['http://[::ffff:8.8.8.8]/', 'v4-mapped public is still blocked'],
  ['http://[::127.0.0.1]/', 'v4-compatible'],
  ['http://[64:ff9b::a00:1]/', 'NAT64'],
  ['http://[fc00::1]/', 'ULA fc'],
  ['http://[fd12:3456::1]/', 'ULA fd'],
  ['http://[fe80::1]/', 'link-local'],
  ['http://[ff02::1]/', 'multicast'],
  ['http://[2001:db8::1]/', 'documentation'],
  ['http://[2002:7f00:1::1]/', '6to4 embedding loopback'],
  ['http://[2001:0:4136:e378::1]/', 'Teredo'],
  // hostnames
  ['http://localhost/', 'localhost'],
  ['http://LOCALHOST./', 'localhost upper with dot'],
  ['http://api.localhost/', '*.localhost'],
  ['http://printer.local/', '*.local'],
  ['https://foo.internal/', '*.internal'],
  ['http://metadata.google.internal/computeMetadata/v1/', 'GCP metadata'],
  ['http://router.home.arpa/', 'home.arpa'],
  ['http://intranet/', 'single label'],
  // ports
  ['http://example.com:22/', 'ssh port'],
  ['https://example.com:6379/', 'redis port'],
  ['http://8.8.8.8:3000/', 'dev port'],
];

const INVALID = [
  'not a url',
  'ftp://example.com/spec.json',
  'file:///etc/passwd',
  'javascript:alert(1)',
  'data:text/plain,hi',
  'http://user:secret@example.com/',
  'http://[::1/',
  'gopher://example.com/',
];

const ALLOWED = [
  'https://petstore3.swagger.io/api/v3/openapi.json',
  'https://raw.githubusercontent.com/OAI/OpenAPI-Specification/main/examples/v3.0/petstore.yaml',
  'http://example.com/openapi.yaml',
  'https://example.com:8443/spec',
  'http://example.com:8080/spec',
  'https://example.com:443/spec',
  'http://8.8.8.8/',
  'http://172.32.0.1/',
  'http://100.128.0.1/',
  'http://[2606:4700:4700::1111]/',
  'https://mcp.example.org/mcp',
];

describe('checkUrl', () => {
  it('has at least 40 blocked or invalid cases', () => {
    expect(BLOCKED.length + INVALID.length).toBeGreaterThanOrEqual(40);
  });

  it.each(BLOCKED)('blocks %s (%s)', (raw) => {
    expect(outcome(raw)).toBe('blocked-host');
  });

  it.each(INVALID)('rejects %s as invalid', (raw) => {
    expect(outcome(raw)).toBe('invalid-url');
  });

  it.each(ALLOWED)('allows %s', (raw) => {
    expect(outcome(raw)).toBe('ok');
  });

  it('normalises and drops the fragment', () => {
    expect(checkUrl('HTTPS://Example.COM/a#frag').href).toBe('https://example.com/a');
  });

  it('resolves a relative location against a base', () => {
    expect(checkUrl('/v2/spec.json', new URL('https://example.com/v1/')).href).toBe('https://example.com/v2/spec.json');
    expect(() => checkUrl('http://10.0.0.1/', new URL('https://example.com/'))).toThrow(ProxyError);
  });
});
