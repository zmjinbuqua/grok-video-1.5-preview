import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";
import { getGrokPoolAccountAuthPath } from "./grokAccountPool.js";
import { startGrokProxy } from "./grokProxyLauncher.js";

export type GrokAccountCheckResult = {
  name: string;
  ok: boolean;
  status: "ready" | "no_image_model" | "http_error" | "timeout" | "error";
  reason: string | null;
  models: string[];
};

type GrokProxyHandle = { stop: (signal?: NodeJS.Signals) => void };

export async function checkGrokPoolAccount(name: string): Promise<GrokAccountCheckResult> {
  const authFile = getGrokPoolAccountAuthPath(name);
  const home = join(config.storage.configDir, "grok-account-checks", `${name}-${Date.now().toString(36)}`);
  const progrokDir = join(home, ".progrok");
  mkdirSync(progrokDir, { recursive: true });
  copyFileSync(authFile, join(progrokDir, "auth.json"));

  const proxies: GrokProxyHandle[] = [];
  try {
    const ready = new Promise<{ url: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for Grok proxy.")), 20_000);
      void startGrokProxy({
        port: config.grokProvider.proxyPort + 1000,
        restartDelayMs: 60_000,
        label: `check:${name}`,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
        },
        onReady: (info) => {
          clearTimeout(timer);
          resolve({ url: info.url });
        },
        onExit: ({ code }) => {
          reject(new Error(`Grok proxy exited with code ${code ?? "unknown"}.`));
        },
      }).then((started) => {
        proxies.push(started);
      }).catch(reject);
    });

    const { url } = await ready;
    const res = await fetch(`${url}/models`, {
      headers: { Authorization: "Bearer dummy" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { name, ok: false, status: "http_error", reason: `HTTP ${res.status}`, models: [] };
    }
    const data = await res.json() as { data?: Array<{ id?: string }> };
    const models = data.data?.map((model) => model.id).filter((id): id is string => Boolean(id)) || [];
    const hasImageModel = models.some((model) => model.startsWith("grok-imagine"));
    return {
      name,
      ok: hasImageModel,
      status: hasImageModel ? "ready" : "no_image_model",
      reason: hasImageModel ? null : "No grok-imagine model found.",
      models,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Grok account check error.";
    return {
      name,
      ok: false,
      status: message.toLowerCase().includes("timed out") ? "timeout" : "error",
      reason: message,
      models: [],
    };
  } finally {
    for (const proxy of proxies) {
      try { proxy.stop(); } catch {}
    }
    rmSync(home, { recursive: true, force: true });
  }
}
