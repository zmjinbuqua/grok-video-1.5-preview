import type { RouteRuntimeContext } from "./runtimeContext.js";

const DEFAULT_GROK_PROXY_HOST = "127.0.0.1";
const DEFAULT_GROK_PROXY_PORT = 18645;

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/v1\/?$/, "").replace(/\/$/, "");
}

function pickPooledGrokUrl(ctx: RouteRuntimeContext, affinityKey?: string): string | null {
  const pool = (ctx as { grokProxyPool?: { urls?: string[]; next?: number; sticky?: Record<string, string> } }).grokProxyPool;
  const urls = pool?.urls?.filter(Boolean) || [];
  if (urls.length === 0) return null;
  pool!.sticky ??= {};
  pool!.next ??= 0;
  if (affinityKey) {
    const existing = pool!.sticky[affinityKey];
    if (existing && urls.includes(existing)) return existing;
    const picked = urls[pool!.next % urls.length];
    pool!.next = (pool!.next + 1) % urls.length;
    pool!.sticky[affinityKey] = picked;
    return picked;
  }
  const picked = urls[pool!.next % urls.length];
  pool!.next = (pool!.next + 1) % urls.length;
  return picked;
}

export function getGrokProxyBaseUrl(ctx: RouteRuntimeContext = {}, affinityKey?: string): string {
  const pooled = pickPooledGrokUrl(ctx, affinityKey);
  if (pooled) return normalizeBaseUrl(pooled);

  const grokCfg = (ctx.config as any)?.grokProvider || {};
  const explicitUrl = (ctx as { grokUrl?: string }).grokUrl;
  if (explicitUrl) return normalizeBaseUrl(explicitUrl);

  const host = grokCfg.proxyHost || DEFAULT_GROK_PROXY_HOST;
  const port = (ctx as { grokActualPort?: number }).grokActualPort || grokCfg.proxyPort || DEFAULT_GROK_PROXY_PORT;
  return `http://${host}:${port}`;
}

export function getGrokProxyUrl(ctx: RouteRuntimeContext = {}, path = "/v1", affinityKey?: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getGrokProxyBaseUrl(ctx, affinityKey)}${normalizedPath}`;
}

export function getGrokDirectBaseUrl(): string {
  return "https://api.x.ai";
}
