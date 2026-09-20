/**
 * Pure SSRF rules. No I/O, so every branch is testable.
 *
 * Competitor analysis fetches domains supplied by users, which is the one place
 * this product reaches arbitrary hosts. Everything here is deny-by-default.
 */

export const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
export const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

export type UrlRejection =
  | "scheme"
  | "credentials"
  | "port"
  | "hostname"
  | "private-ip"
  | "dns"
  | "redirect-limit"
  | "content-type"
  | "size"
  | "timeout"
  | "invalid";

export function defaultPortFor(protocol: string) {
  return protocol === "https:" ? 443 : 80;
}

function ipv4ToLong(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
}

/** [network, maskBits] pairs that must never be reachable. */
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. 169.254.169.254 cloud metadata
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. 255.255.255.255
];

export function isIpv4(value: string) {
  return ipv4ToLong(value) != null;
}

export function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToLong(ip);
  if (value == null) return true; // unparseable is not provably public
  return BLOCKED_V4.some(([network, bits]) => {
    const base = ipv4ToLong(network)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (base & mask) >>> 0;
  });
}

function expandIpv6(ip: string): number[] | null {
  let address = ip.trim().toLowerCase();
  if (address.startsWith("[") && address.endsWith("]")) address = address.slice(1, -1);
  const zone = address.indexOf("%");
  if (zone !== -1) address = address.slice(0, zone);
  if (!address.includes(":")) return null;

  // A trailing IPv4 literal (::ffff:127.0.0.1, 2002::1.2.3.4) becomes two groups.
  let tail = "";
  const lastColon = address.lastIndexOf(":");
  const suffix = address.slice(lastColon + 1);
  if (suffix.includes(".")) {
    const long = ipv4ToLong(suffix);
    if (long == null) return null;
    tail = `${((long >>> 16) & 0xffff).toString(16)}:${(long & 0xffff).toString(16)}`;
    address = address.slice(0, lastColon + 1) + tail;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;

  const parse = (part: string) => (part === "" ? [] : part.split(":").map((g) => parseInt(g, 16)));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if (head.some(Number.isNaN) || rest.some(Number.isNaN)) return null;

  let groups: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 0) return null;
    groups = [...head, ...Array(fill).fill(0), ...rest];
  } else {
    groups = head;
  }
  return groups.length === 8 ? groups : null;
}

/** Pulls the embedded IPv4 out of ::ffff:0:0/96 and 2002::/16, the classic bypasses. */
export function embeddedIpv4(ip: string): string | null {
  const groups = expandIpv6(ip);
  if (!groups) return null;
  const toIp = (hi: number, lo: number) =>
    `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;

  // IPv4-mapped / IPv4-compatible: ::ffff:a.b.c.d
  if (groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    if (groups[6] === 0 && groups[7] === 0) return null; // plain ::
    return toIp(groups[6], groups[7]);
  }
  // 6to4: 2002:a.b.c.d::/48
  if (groups[0] === 0x2002) return toIp(groups[1], groups[2]);
  return null;
}

export function isPrivateIpv6(ip: string): boolean {
  const groups = expandIpv6(ip);
  if (!groups) return true;

  const mapped = embeddedIpv4(ip);
  if (mapped) return isPrivateIpv4(mapped);

  const [g0, g1] = groups;
  if (groups.every((g) => g === 0)) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g0 === 0x0064 && g1 === 0xff9b) return true; // 64:ff9b::/96 NAT64
  if (g0 === 0xfd00) return true; // covered by fc00::/7, incl. AWS IMDSv6
  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (isIpv4(ip)) return isPrivateIpv4(ip);
  if (ip.includes(":")) return isPrivateIpv6(ip);
  return true;
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".internal", ".local", ".home.arpa"];
const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal", "metadata"]);

export function isBlockedHostname(host: string): boolean {
  const name = host.trim().toLowerCase().replace(/\.$/, "");
  if (!name) return true;
  if (BLOCKED_HOSTS.has(name)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;
  // A bare label with no dot cannot be a public domain.
  if (!name.includes(".") && !name.includes(":")) return true;
  return false;
}
