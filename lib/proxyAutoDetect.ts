import { execFileSync } from "node:child_process";
import net from "node:net";

export type ProxyAutoDetectResult = {
  enabled: boolean;
  proxyUrl: string | null;
  source: "env" | "windows-system" | "common-port" | "disabled" | "none";
  reason: string;
};

const DEFAULT_NO_PROXY = "127.0.0.1,localhost,::1";
const COMMON_PROXY_PORTS = [7890, 7892, 10809, 10808, 20171, 20170, 8080, 8118];

function normalizeProxyUrl(raw: string | undefined | null): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\d+$/.test(value)) return `http://127.0.0.1:${value}`;
  if (/^[\w.-]+:\d+$/.test(value)) return `http://${value}`;
  return null;
}

function isLocalProxy(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function probeHttpProxy(proxyUrl: string, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };

    let parsed: URL;
    try {
      parsed = new URL(proxyUrl);
    } catch {
      resolve(false);
      return;
    }
    const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
    const socket = net.createConnection({ host: parsed.hostname, port });
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      socket.write("CONNECT accounts.x.ai:443 HTTP/1.1\r\nHost: accounts.x.ai:443\r\n\r\n");
    });
    socket.on("data", (chunk) => {
      finish(/^HTTP\/\d(?:\.\d)?\s+\d{3}/i.test(chunk.toString("utf-8")));
    });
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.on("end", () => finish(false));
  });
}

function readWindowsSystemProxy(): string | null {
  if (process.platform !== "win32") return null;
  try {
    const output = execFileSync("reg", [
      "query",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
      "/v",
      "ProxyEnable",
    ], { encoding: "utf-8", windowsHide: true });
    if (!/\bProxyEnable\b\s+REG_DWORD\s+0x1\b/i.test(output)) return null;
  } catch {
    return null;
  }
  try {
    const output = execFileSync("reg", [
      "query",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
      "/v",
      "ProxyServer",
    ], { encoding: "utf-8", windowsHide: true });
    const match = output.match(/\bProxyServer\b\s+REG_SZ\s+(.+)\s*$/im);
    const raw = match?.[1]?.trim();
    if (!raw) return null;
    const httpPart = raw.split(";").map((part) => part.trim()).find((part) => /^https?=/i.test(part));
    return normalizeProxyUrl(httpPart ? httpPart.replace(/^https?=/i, "") : raw);
  } catch {
    return null;
  }
}

function applyProxyEnv(proxyUrl: string | null) {
  process.env.NO_PROXY = process.env.NO_PROXY || DEFAULT_NO_PROXY;
  process.env.no_proxy = process.env.no_proxy || process.env.NO_PROXY;
  if (!proxyUrl) return;
  process.env.HTTP_PROXY = proxyUrl;
  process.env.HTTPS_PROXY = proxyUrl;
  process.env.http_proxy = proxyUrl;
  process.env.https_proxy = proxyUrl;
  process.env.NODE_USE_ENV_PROXY = "1";
}

export async function configureAutoProxy(): Promise<ProxyAutoDetectResult> {
  if (/^(0|false|off|no)$/i.test(process.env.IMA2_AUTO_PROXY || "")) {
    applyProxyEnv(null);
    return { enabled: false, proxyUrl: null, source: "disabled", reason: "IMA2_AUTO_PROXY disabled" };
  }

  const existing = normalizeProxyUrl(process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy);
  if (existing) {
    if (!isLocalProxy(existing) || await probeHttpProxy(existing)) {
      applyProxyEnv(existing);
      return { enabled: true, proxyUrl: existing, source: "env", reason: "Using existing proxy environment" };
    }
  }

  const systemProxy = readWindowsSystemProxy();
  if (systemProxy && await probeHttpProxy(systemProxy)) {
    applyProxyEnv(systemProxy);
    return { enabled: true, proxyUrl: systemProxy, source: "windows-system", reason: "Detected Windows system proxy" };
  }

  for (const port of COMMON_PROXY_PORTS) {
    const proxyUrl = `http://127.0.0.1:${port}`;
    if (await probeHttpProxy(proxyUrl)) {
      applyProxyEnv(proxyUrl);
      return { enabled: true, proxyUrl, source: "common-port", reason: `Detected local HTTP proxy on port ${port}` };
    }
  }

  applyProxyEnv(null);
  return { enabled: false, proxyUrl: null, source: "none", reason: "No local HTTP proxy detected" };
}

export function logProxyAutoDetect(result: ProxyAutoDetectResult) {
  if (result.enabled && result.proxyUrl) {
    console.log(`[proxy] ${result.reason}: ${result.proxyUrl}; NO_PROXY=${process.env.NO_PROXY || DEFAULT_NO_PROXY}`);
  } else {
    console.log(`[proxy] ${result.reason}; outbound requests use direct connection`);
  }
}
