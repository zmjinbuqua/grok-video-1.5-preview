import { type ChildProcess, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isWin } from "../bin/lib/platform.js";
import { config } from "../config.js";
import { findAvailablePort } from "./runtimePorts.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROGROK_LOGIN_COMMAND = ["progrok", "login"].join(" ");

type GrokProxyReadyInfo = {
  url: string;
  port: number;
  requestedPort: number;
};

type GrokProxyPortInfo = {
  host: string;
  port: number;
  requestedPort: number;
  url: string;
};

type GrokProxyOptions = {
  host?: string;
  port?: number;
  progrokBinPath?: string;
  restartDelayMs?: number;
  env?: NodeJS.ProcessEnv;
  label?: string;
  onPortSelected?: (info: GrokProxyPortInfo) => void;
  onReady?: (info: GrokProxyReadyInfo) => void;
  onExit?: (info: { code: number | null }) => void;
};

type GrokProxyPoolOptions = GrokProxyOptions & {
  onPoolReady?: (info: { urls: string[]; proxies: Array<{ account: string; url: string; port: number }> }) => void;
};

function parseListeningUrl(line: string): { url: string; port: number } | null {
  const match = String(line || "").match(/https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)\/v1/i);
  if (!match) return null;
  const port = Number(match[1]);
  return Number.isFinite(port) ? { url: match[0], port } : null;
}

export function isGrokProxyAuthRequiredMessage(line: string): boolean {
  const normalized = String(line || "").toLowerCase();
  return normalized.includes("not logged in")
    && (normalized.includes(PROGROK_LOGIN_COMMAND) || normalized.includes("ima2 grok login"));
}

export function normalizeGrokProxyMessage(line: string): string {
  const escaped = PROGROK_LOGIN_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(line || "").replace(new RegExp(`\`?${escaped}\`?`, "gi"), "`ima2 grok login`");
}

function localBinPath(): string {
  return join(rootDir, "node_modules", ".bin");
}

export async function startGrokProxy(options: GrokProxyOptions = {}) {
  const host = options.host ?? config.grokProvider.proxyHost;
  const requestedPort = options.port ?? config.grokProvider.proxyPort;
  const restartDelayMs = options.restartDelayMs ?? config.grokProvider.restartDelayMs;
  let currentChild: ChildProcess | null = null;
  let stopping = false;
  let restartTimer: NodeJS.Timeout | null = null;
  let authRequired = false;
  const prefix = options.label ? `[grok:${options.label}]` : "[grok]";

  const scheduleRestart = () => {
    restartTimer = setTimeout(() => {
      void spawnProxy();
    }, restartDelayMs);
  };

  const spawnProxy = async () => {
    let port: number;
    try {
      port = await findAvailablePort(requestedPort, { host });
    } catch (err) {
      const e = err as Error & { message?: string };
      console.error(`[grok] failed to select progrok port: ${e.message || e}`);
      if (!stopping) {
        console.log(`[grok] retrying port selection in ${Math.round(restartDelayMs / 1000)}s...`);
        scheduleRestart();
      }
      return;
    }
    if (port !== requestedPort) {
      console.log(`[grok] requested port ${requestedPort}, actual port ${port}`);
    }
    options.onPortSelected?.({ host, port, requestedPort, url: `http://${host}:${port}/v1` });
    console.log(`Starting bundled progrok proxy for Grok images at http://${host}:${port}/v1 (managed by ima2 serve)...`);
    const progrokBin = options.progrokBinPath ?? join(localBinPath(), isWin ? "progrok.cmd" : "progrok");
    const child = spawn(progrokBin, ["proxy", "--host", host, "--port", String(port)], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: isWin,
      windowsHide: true,
      env: options.env ?? process.env,
    });
    currentChild = child;
    authRequired = false;

    child.on("error", (err) => {
      console.error(`${prefix} failed to start progrok proxy: ${err.message}`);
      if (currentChild === child) currentChild = null;
    });

    child.stdout?.on("data", (d) => {
      const msg = normalizeGrokProxyMessage(d.toString().trim());
      if (!msg) return;
      console.log(`${prefix} ${msg}`);
      for (const line of msg.split(/\r?\n/)) {
        if (isGrokProxyAuthRequiredMessage(line)) authRequired = true;
        const ready = parseListeningUrl(line);
        if (!ready) continue;
        console.log(`${prefix} ready for ima2 Grok provider at ${ready.url}`);
        options.onReady?.({ url: ready.url, port: ready.port, requestedPort });
      }
    });

    child.stderr?.on("data", (d) => {
      const msg = normalizeGrokProxyMessage(d.toString().trim());
      if (msg) console.error(`${prefix} ${msg}`);
      for (const line of msg.split(/\r?\n/)) {
        if (isGrokProxyAuthRequiredMessage(line)) authRequired = true;
      }
    });

    child.on("exit", (code) => {
      if (currentChild === child) currentChild = null;
      if (stopping) return;
      options.onExit?.({ code });
      if (authRequired && code !== 0) {
        console.error(`${prefix} Grok OAuth is not logged in. Run \`ima2 grok login\` to enable Grok images/video.`);
        console.error(`${prefix} Continuing without auto-restarting the Grok proxy. GPT OAuth/API image generation can still run.`);
        return;
      }
      console.log(`${prefix} exited with code ${code}, restarting in ${Math.round(restartDelayMs / 1000)}s...`);
      scheduleRestart();
    });
  };

  await spawnProxy();

  return {
    get child() {
      return currentChild;
    },
    kill(signal: NodeJS.Signals = "SIGTERM") {
      this.stop(signal);
    },
    stop(signal: NodeJS.Signals = "SIGTERM") {
      stopping = true;
      if (restartTimer) clearTimeout(restartTimer);
      try { currentChild?.kill(signal); } catch {}
    },
  };
}

function accountPoolDir(): string {
  return join(rootDir, ".grok-accounts");
}

function safeAccountName(file: string): string {
  return basename(file, ".json").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function listAccountFiles(): Array<{ account: string; authFile: string }> {
  const dir = accountPoolDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => ({ account: safeAccountName(file), authFile: join(dir, file) }))
    .sort((a, b) => a.account.localeCompare(b.account));
}

function prepareAccountHome(account: string, authFile: string): string {
  const home = join(config.storage.configDir, "grok-account-homes", account);
  const progrokDir = join(home, ".progrok");
  mkdirSync(progrokDir, { recursive: true });
  copyFileSync(authFile, join(progrokDir, "auth.json"));
  return home;
}

export async function startGrokProxyPool(options: GrokProxyPoolOptions = {}) {
  const accounts = listAccountFiles();
  if (accounts.length === 0) return startGrokProxy(options);

  const children: Array<Awaited<ReturnType<typeof startGrokProxy>>> = [];
  const ready = new Map<string, { account: string; url: string; port: number }>();
  const basePort = options.port ?? config.grokProvider.proxyPort;

  console.log(`[grok] account pool enabled: ${accounts.length} saved account(s)`);
  for (let index = 0; index < accounts.length; index += 1) {
    const account = accounts[index];
    const home = prepareAccountHome(account.account, account.authFile);
    const env = {
      ...process.env,
      ...(options.env ?? {}),
      HOME: home,
      USERPROFILE: home,
    };
    const child = await startGrokProxy({
      ...options,
      port: basePort + index,
      env,
      label: account.account,
      onReady: (info) => {
        ready.set(account.account, { account: account.account, url: info.url, port: info.port });
        options.onReady?.(info);
        const proxies = Array.from(ready.values()).sort((a, b) => a.account.localeCompare(b.account));
        options.onPoolReady?.({ urls: proxies.map((p) => p.url), proxies });
      },
    });
    children.push(child);
  }

  return {
    get child() {
      return children[0]?.child ?? null;
    },
    kill(signal: NodeJS.Signals = "SIGTERM") {
      for (const child of children) child.kill(signal);
    },
    stop(signal: NodeJS.Signals = "SIGTERM") {
      for (const child of children) child.stop(signal);
    },
  };
}
