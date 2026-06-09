import { grokError } from "./grokImageAdapter.js";
import { logEvent, logWarn } from "./logger.js";
const MAX_VIDEO_DOWNLOAD_BYTES = 100 * 1024 * 1024;
function downloadTimeoutMs(ctx) {
    const g = ctx.config.grokProvider || {};
    return g.videoDownloadTimeoutMs || 120_000;
}
function withTimeoutSignal(signal, timeoutMs) {
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutController.signal]) : timeoutController.signal;
    return { combinedSignal, timer };
}
function proxyUrlForDownload() {
    return process.env.HTTPS_PROXY
        || process.env.https_proxy
        || process.env.HTTP_PROXY
        || process.env.http_proxy
        || null;
}
async function fetchVideo(url, signal, useProxy) {
    if (!useProxy)
        return fetch(url, { signal });
    const proxyUrl = proxyUrlForDownload();
    if (!proxyUrl)
        return fetch(url, { signal });
    const { ProxyAgent } = await import("undici");
    return fetch(url, {
        signal,
        dispatcher: new ProxyAgent(proxyUrl),
    });
}
export function isMp4Container(buffer) {
    return buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
}
export async function downloadVideo(ctx, url, signal) {
    const { combinedSignal, timer } = withTimeoutSignal(signal, downloadTimeoutMs(ctx));
    let parsed = null;
    const proxyUrl = proxyUrlForDownload();
    try {
        parsed = new URL(url);
        const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
        if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
            throw grokError("Grok video download URL must be HTTPS", 502, "GROK_VIDEO_DOWNLOAD_FAILED");
        }
        logEvent("grok", "video:download:start", {
            host: parsed.hostname,
            proxy: proxyUrl ? "enabled" : "none",
        });
        const res = await fetchVideo(url, combinedSignal, !isLoopback);
        if (!res.ok)
            throw grokError(`Grok video download failed: HTTP ${res.status}`, 502, "GROK_VIDEO_DOWNLOAD_FAILED");
        const contentLength = Number(res.headers.get("content-length") || "0");
        if (contentLength > MAX_VIDEO_DOWNLOAD_BYTES) {
            throw grokError("Grok video download exceeds the 100MB limit", 502, "GROK_VIDEO_DOWNLOAD_FAILED");
        }
        const contentType = res.headers.get("content-type") || "video/mp4";
        if (!/^video\/mp4\b/i.test(contentType) && !/^application\/octet-stream\b/i.test(contentType)) {
            throw grokError("Grok video download returned a non-video response", 502, "GROK_VIDEO_DOWNLOAD_FAILED");
        }
        const buffer = Buffer.from(await res.arrayBuffer());
        clearTimeout(timer);
        if (buffer.length === 0)
            throw grokError("Grok video download was empty", 502, "GROK_VIDEO_DOWNLOAD_FAILED");
        if (buffer.length > MAX_VIDEO_DOWNLOAD_BYTES) {
            throw grokError("Grok video download exceeds the 100MB limit", 502, "GROK_VIDEO_DOWNLOAD_FAILED");
        }
        if (!isMp4Container(buffer)) {
            throw grokError("Grok video download returned an invalid MP4 container", 502, "GROK_VIDEO_DOWNLOAD_FAILED");
        }
        logEvent("grok", "video:download:done", {
            host: parsed.hostname,
            bytes: buffer.length,
            contentType,
        });
        return { buffer, contentType };
    }
    catch (e) {
        clearTimeout(timer);
        if (e.name === "AbortError") {
            if (signal?.aborted)
                throw grokError("Generation canceled", 499, "GENERATION_CANCELED");
            throw grokError("Grok video download timed out", 504, "GROK_VIDEO_TIMEOUT");
        }
        if (e.code && e.status)
            throw e;
        logWarn("grok", "video:download:failed", {
            host: parsed?.hostname || "unknown",
            proxy: proxyUrl ? "enabled" : "none",
            message: e?.message || String(e),
        });
        throw grokError(`Grok video download request failed from ${parsed?.hostname || "unknown"} with proxy ${proxyUrl ? "enabled" : "none"}: ${e.message}`, 502, "GROK_VIDEO_DOWNLOAD_FAILED");
    }
}
