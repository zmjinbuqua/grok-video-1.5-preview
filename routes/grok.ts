import type { Express } from "express";
import type { RouteRuntimeContext } from "../lib/runtimeContext.js";
import { getGrokProxyUrl } from "../lib/grokRuntime.js";
import { checkGrokPoolAccount } from "../lib/grokAccountCheck.js";
import { deleteGrokPoolAccount, grokPoolInfo, importBulkGrokAccounts, importCurrentGrokAccount, importRawGrokAccount, setGrokPoolAccountEnabled } from "../lib/grokAccountPool.js";
import { cancelGrokAccountLogin, cleanupFinishedGrokLogins, getGrokAccountLogin, startGrokAccountLogin } from "../lib/grokAccountLogin.js";

export function registerGrokRoutes(app: Express, ctx: RouteRuntimeContext) {
  const reloadedLoginSessions = new Set<string>();
  const activeProxyCount = () => (ctx as { grokProxyPool?: { urls?: string[] } }).grokProxyPool?.urls?.length || 0;
  const reloadGrokProxyPool = async () => {
    const reload = (ctx as { grokProxyReload?: () => Promise<{ activeProxyCount: number }> }).grokProxyReload;
    if (!reload) return { activeProxyCount: activeProxyCount(), restartRequired: true };
    const result = await reload();
    return { activeProxyCount: result.activeProxyCount, restartRequired: false };
  };

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
      restartRequired: !ctx.grokProxyReload,
      activeProxyCount: activeProxyCount(),
    });
  });

  app.post("/api/grok/accounts/import", async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const account = importCurrentGrokAccount(name);
      res.json({ account, ...(await reloadGrokProxyPool()) });
    } catch (e: any) {
      res.status(e?.status || 500).json({ error: e?.message || "failed to import Grok account" });
    }
  });

  app.post("/api/grok/accounts/import-token", async (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const account = importRawGrokAccount(name, req.body?.tokenJson ?? req.body?.token);
      res.json({ account, ...(await reloadGrokProxyPool()) });
    } catch (e: any) {
      res.status(e?.status || 500).json({ error: e?.message || "failed to import Grok token" });
    }
  });

  app.post("/api/grok/accounts/import-bulk", async (req, res) => {
    try {
      const result = importBulkGrokAccounts(String(req.body?.text || ""));
      res.json({ ...result, ...(await reloadGrokProxyPool()) });
    } catch (e: any) {
      res.status(e?.status || 500).json({ error: e?.message || "failed to import Grok accounts" });
    }
  });

  app.post("/api/grok/accounts/login", (_req, res) => {
    try {
      cleanupFinishedGrokLogins();
      res.json(startGrokAccountLogin());
    } catch (e: any) {
      res.status(e?.status || 500).json({ error: e?.message || "failed to start Grok login" });
    }
  });

  app.get("/api/grok/accounts/login/:id", async (req, res) => {
    try {
      const session = getGrokAccountLogin(req.params.id);
      if (session.status === "success" && !reloadedLoginSessions.has(session.id)) {
        reloadedLoginSessions.add(session.id);
        res.json({ ...session, ...(await reloadGrokProxyPool()) });
        return;
      }
      res.json(session);
    } catch (e: any) {
      res.status(e?.status || 500).json({ error: e?.message || "failed to read Grok login" });
    }
  });

  app.post("/api/grok/accounts/login/:id/cancel", (req, res) => {
    try {
      res.json(cancelGrokAccountLogin(req.params.id));
    } catch (e: any) {
      res.status(e?.status || 500).json({ error: e?.message || "failed to cancel Grok login" });
    }
  });

  app.patch("/api/grok/accounts/:name", async (req, res) => {
    try {
      const enabled = req.body?.enabled !== false;
      const account = setGrokPoolAccountEnabled(req.params.name, enabled);
      res.json({ account, ...(await reloadGrokProxyPool()) });
    } catch (e: any) {
      res.status(e?.status || 500).json({ error: e?.message || "failed to update Grok account" });
    }
  });

  app.post("/api/grok/accounts/:name/check", async (req, res) => {
    try {
      res.json(await checkGrokPoolAccount(req.params.name));
    } catch (e: any) {
      res.status(e?.status || 500).json({ error: e?.message || "failed to check Grok account" });
    }
  });

  app.delete("/api/grok/accounts/:name", async (req, res) => {
    try {
      deleteGrokPoolAccount(req.params.name);
      res.json({ ok: true, ...(await reloadGrokProxyPool()) });
    } catch (e: any) {
      res.status(e?.status || 500).json({ error: e?.message || "failed to delete Grok account" });
    }
  });
}
