import type { Express } from "express";
import type { RouteRuntimeContext } from "../lib/runtimeContext.js";
import { getGrokProxyUrl } from "../lib/grokRuntime.js";
import { deleteGrokPoolAccount, grokPoolInfo, importCurrentGrokAccount } from "../lib/grokAccountPool.js";

export function registerGrokRoutes(app: Express, ctx: RouteRuntimeContext) {
  app.get("/api/grok/status", async (_req, res) => {
    const grokCfg = (ctx.config as any).grokProvider || {};
    const timeoutMs = grokCfg.statusTimeoutMs || 10_000;
    try {
      const r = await fetch(getGrokProxyUrl(ctx, "/v1/models"), {
        headers: { Authorization: "Bearer dummy" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (r.ok) {
        const data: any = await r.json();
        const models: string[] = data?.data?.map((m: any) => m.id).filter(Boolean) || [];
        const hasImageModel = models.some((m: string) => m.startsWith("grok-imagine"));
        return res.json({ status: hasImageModel ? "ready" : "no_image_model", models });
      }
      return res.json({ status: "error", reason: `HTTP ${r.status}` });
    } catch {
      return res.json({ status: "offline" });
    }
  });

  app.get("/api/grok/accounts", (_req, res) => {
    res.json({
      ...grokPoolInfo(),
      activeProxyCount: (ctx as { grokProxyPool?: { urls?: string[] } }).grokProxyPool?.urls?.length || 0,
    });
  });

  app.post("/api/grok/accounts/import", (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const account = importCurrentGrokAccount(name);
      res.json({ account, restartRequired: true });
    } catch (e: any) {
      res.status(e?.status || 500).json({ error: e?.message || "failed to import Grok account" });
    }
  });

  app.delete("/api/grok/accounts/:name", (req, res) => {
    try {
      deleteGrokPoolAccount(req.params.name);
      res.json({ ok: true, restartRequired: true });
    } catch (e: any) {
      res.status(e?.status || 500).json({ error: e?.message || "failed to delete Grok account" });
    }
  });
}
