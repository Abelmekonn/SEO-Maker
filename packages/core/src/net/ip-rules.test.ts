import { describe, expect, it } from "vitest";
import {
  ALLOWED_PORTS,
  ALLOWED_SCHEMES,
  defaultPortFor,
  embeddedIpv4,
  isBlockedHostname,
  isBlockedIp,
  isPrivateIpv4,
  isPrivateIpv6,
} from "./ip-rules";

describe("isPrivateIpv4", () => {
  const blocked = [
    "0.0.0.0",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1", // CGNAT
    "127.0.0.1",
    "127.1.2.3",
    "169.254.1.1",
    "169.254.169.254", // cloud metadata
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.5",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
  ];
  for (const ip of blocked) {
    it(`blocks ${ip}`, () => expect(isPrivateIpv4(ip)).toBe(true));
  }

  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "100.63.255.255"];
  for (const ip of allowed) {
    it(`allows ${ip}`, () => expect(isPrivateIpv4(ip)).toBe(false));
  }

  it("treats unparseable input as unsafe", () => {
    expect(isPrivateIpv4("999.1.1.1")).toBe(true);
    expect(isPrivateIpv4("not-an-ip")).toBe(true);
  });
});

describe("isPrivateIpv6", () => {
  const blocked = [
    "::",
    "::1",
    "fc00::1",
    "fd00::1",
    "fd00:ec2::254", // AWS IMDSv6
    "fe80::1",
    "ff02::1",
    "64:ff9b::1",
  ];
  for (const ip of blocked) {
    it(`blocks ${ip}`, () => expect(isPrivateIpv6(ip)).toBe(true));
  }

  it("allows public v6", () => {
    expect(isPrivateIpv6("2606:4700:4700::1111")).toBe(false);
    expect(isPrivateIpv6("2001:4860:4860::8888")).toBe(false);
  });

  it("unwraps IPv4-mapped addresses instead of trusting them", () => {
    expect(embeddedIpv4("::ffff:127.0.0.1")).toBe("127.0.0.1");
    expect(isPrivateIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateIpv6("::ffff:8.8.8.8")).toBe(false);
  });

  it("unwraps 6to4 addresses", () => {
    expect(embeddedIpv4("2002:7f00:0001::")).toBe("127.0.0.1");
    expect(isPrivateIpv6("2002:7f00:0001::")).toBe(true);
    expect(isPrivateIpv6("2002:0808:0808::")).toBe(false);
  });
});

describe("isBlockedIp", () => {
  it("dispatches on address family", () => {
    expect(isBlockedIp("10.0.0.1")).toBe(true);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("2606:4700::1111")).toBe(false);
  });

  it("rejects anything that is not an address at all", () => {
    expect(isBlockedIp("example.com")).toBe(true);
    expect(isBlockedIp("")).toBe(true);
  });
});

describe("isBlockedHostname", () => {
  const blocked = [
    "localhost",
    "LOCALHOST",
    "app.localhost",
    "db.internal",
    "printer.local",
    "router.home.arpa",
    "metadata.google.internal",
    "intranet", // no dot
    "",
  ];
  for (const host of blocked) {
    it(`blocks ${host || "(empty)"}`, () => expect(isBlockedHostname(host)).toBe(true));
  }

  it("allows ordinary public hostnames", () => {
    expect(isBlockedHostname("example.com")).toBe(false);
    expect(isBlockedHostname("www.example.co.uk")).toBe(false);
    expect(isBlockedHostname("example.com.")).toBe(false); // trailing dot normalized
  });
});

describe("scheme and port allowlists", () => {
  it("permits only http and https", () => {
    expect(ALLOWED_SCHEMES.has("http:")).toBe(true);
    expect(ALLOWED_SCHEMES.has("https:")).toBe(true);
    for (const scheme of ["file:", "gopher:", "ftp:", "data:", "javascript:"]) {
      expect(ALLOWED_SCHEMES.has(scheme)).toBe(false);
    }
  });

  it("permits only web ports", () => {
    expect(ALLOWED_PORTS.has(443)).toBe(true);
    for (const port of [22, 25, 3306, 5432, 6379, 11211]) {
      expect(ALLOWED_PORTS.has(port)).toBe(false);
    }
  });

  it("knows the default port per scheme", () => {
    expect(defaultPortFor("https:")).toBe(443);
    expect(defaultPortFor("http:")).toBe(80);
  });
});
