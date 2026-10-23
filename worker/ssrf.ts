// URL validation for everything the Worker fetches (S1). Pure: no DNS. The WHATWG URL parser
// normalises decimal, octal, hex and short IPv4 forms (`2130706433`, `0x7f.1`) and IPv6 text
// before these checks run. DNS rebinding is out of reach without resolving names; Workers' own
// `fetch` cannot reach private networks, and these literal and hostname checks cover the rest.
import { ProxyError } from './errors';

const PORTS = new Set(['', '80', '443', '8080', '8443']);
const LOCAL_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

/** IPv4 ranges that are never public: [network, prefix length]. */
const V4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3], // multicast, reserved, broadcast
];

const v4 = (ip: string): number => ip.split('.').reduce((n, part) => n * 256 + Number(part), 0);

export function isBlockedIPv4(ip: string): boolean {
  const n = v4(ip);
  return V4_BLOCKED.some(([net, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(v4(net) / 2 ** (32 - bits)));
}

const groups = (s: string) => (s ? s.split(':').map((h) => (/^[\da-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN)) : []);

function hextets(ip: string): number[] | null {
  const [head = '', tail, extra] = ip.split('::');
  if (extra !== undefined) return null;
  const a = groups(head);
  const b = groups(tail ?? '');
  const all = tail === undefined ? a : [...a, ...Array<number>(Math.max(0, 8 - a.length - b.length)).fill(0), ...b];
  return all.length === 8 && all.every((h) => !Number.isNaN(h)) ? all : null;
}

/**
 * Only global unicast (2000::/3) is public, minus 2001::/23 (Teredo, benchmarking), 2001:db8::/32
 * (documentation) and 2002::/16 (6to4, which can embed private IPv4). This blocks ::, ::1,
 * IPv4-mapped and -compatible addresses, NAT64, ULA fc00::/7, link-local fe80::/10 and multicast.
 */
export function isBlockedIPv6(ip: string): boolean {
  const h = hextets(ip);
  if (!h) return true;
  const [h0 = 0, h1 = 0] = h;
  return (h0 & 0xe000) !== 0x2000 || h0 === 0x2002 || (h0 === 0x2001 && (h1 < 0x200 || h1 === 0xdb8));
}

export function isBlockedHost(host: string): boolean {
  if (host.startsWith('[')) return isBlockedIPv6(host.slice(1, -1));
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isBlockedIPv4(host);
  return host === 'localhost' || !host.includes('.') || LOCAL_SUFFIXES.some((s) => host.endsWith(s));
}

/** Returns the normalised URL (no fragment) or throws `invalid-url` / `blocked-host`. */
export function checkUrl(raw: string, base?: URL): URL {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    throw new ProxyError('invalid-url', 'That is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ProxyError('invalid-url', 'Only http and https URLs can be fetched.');
  }
  if (url.username || url.password) throw new ProxyError('invalid-url', 'URLs with a user name or password are not fetched.');
  if (!PORTS.has(url.port)) throw new ProxyError('blocked-host', `Port ${url.port} is not allowed; use 80, 443, 8080 or 8443.`);
  // Strip every trailing dot (`localhost..` must not dodge the suffix list), then refuse empty labels.
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (!host.startsWith('[') && host.split('.').some((label) => label === '')) {
    throw new ProxyError('blocked-host', `${host || url.hostname} has an empty label.`);
  }
  if (isBlockedHost(host)) throw new ProxyError('blocked-host', `${host} is a private or local address.`);
  url.hash = '';
  return url;
}
