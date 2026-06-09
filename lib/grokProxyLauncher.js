import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isWin } from "../bin/lib/platform.js";
import { config } from "../config.js";
import { findAvailablePort } from "./runtimePorts.js";
const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROGROK_LOGIN_COMMAND = ["progrok", "login"].join(" ");
function parseListeningUrl(line) {
    const match = String(line || "").match(/https?:\/\/(?:127\.0\.0\.1|localhost):(\d+)\/v1/i);
    if (!match)
        return null;
    const port = Number(match[1]);
    return Number.isFinite(port) ? { url: match[0], port } : null;
}
export function isGrokProxyAuthRequiredMessage(line) {
    const normalized = String(line || "").toLowerCase();
    return normalized.includes("not logged in")
        && (normalized.includes(PROGROK_LOGIN_COMMAND) || normalized.includes("ima2 grok login"));
}
export function normalizeGrokProxyMessage(line) {
    const escaped = PROGROK_LOGIN_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return String(line || "").replace(new RegExp(`\`?${escaped}\`?`, "gi"), "`ima2 grok login`");
}
function localBinPath() {
    return join(rootDir, "node_modules", ".bin");
}
export async function startGrokProxy(options = {}) {
    const host = options.host ?? config.grokProvider.proxyHost;
    const requestedPort = options.port ?? config.grokProvider.proxyPort;
    const restartDelayMs = options.restartDelayMs ?? config.grokProvider.restartDelayMs;
    let currentChild = null;
    let stopping = false;
    let restartTimer = null;
    let authRequired = false;
    const prefix = options.label ? `[grok:${options.label}]` : "[grok]";
    const scheduleRestart = () => {
        restartTimer = setTimeout(() => {
            void spawnProxy();
        }, restartDelayMs);
    };
    const spawnProxy = async () => {
        let port;
        try {
            port = await findAvailablePort(requestedPort, { host });
        }
        catch (err) {
            const e = err;
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
            if (currentChild === child)
                currentChild = null;
        });
        child.stdout?.on("data", (d) => {
            const msg = normalizeGrokProxyMessage(d.toString().trim());
            if (!msg)
                return;
            console.log(`${prefix} ${msg}`);
            for (const line of msg.split(/\r?\n/)) {
                if (isGrokProxyAuthRequiredMessage(line))
                    authRequired = true;
                const ready = parseListeningUrl(line);
                if (!ready)
                    continue;
                console.log(`${prefix} ready for ima2 Grok provider at ${ready.url}`);
                options.onReady?.({ url: ready.url, port: ready.port, requestedPort });
            }
        });
        child.stderr?.on("data", (d) => {
            const msg = normalizeGrokProxyMessage(d.toString().trim());
            if (msg)
                console.error(`${prefix} ${msg}`);
            for (const line of msg.split(/\r?\n/)) {
                if (isGrokProxyAuthRequiredMessage(line))
                    authRequired = true;
            }
        });
        child.on("exit", (code) => {
            if (currentChild === child)
                currentChild = null;
            if (stopping)
                return;
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
        kill(signal = "SIGTERM") {
            this.stop(signal);
        },
        stop(signal = "SIGTERM") {
            stopping = true;
            if (restartTimer)
                clearTimeout(restartTimer);
            try {
                currentChild?.kill(signal);
            }
            catch { }
        },
    };
}
function accountPoolDir() {
    return join(rootDir, ".grok-accounts");
}
function safeAccountName(file) {
    return basename(file, ".json").replace(/[^a-zA-Z0-9._-]/g, "_");
}
function listAccountFiles() {
    const dir = accountPoolDir();
    if (!existsSync(dir))
        return [];
    return readdirSync(dir)
        .filter((file) => file.endsWith(".json"))
        .filter((file) => {
        try {
            const data = JSON.parse(readFileSync(join(dir, file), "utf-8"));
            return data.disabled !== true;
        }
        catch {
            return true;
        }
    })
        .map((file) => ({ account: safeAccountName(file), authFile: join(dir, file) }))
        .sort((a, b) => a.account.localeCompare(b.account));
}
function prepareAccountHome(account, authFile) {
    const home = join(config.storage.configDir, "grok-account-homes", account);
    const progrokDir = join(home, ".progrok");
    mkdirSync(progrokDir, { recursive: true });
    copyFileSync(authFile, join(progrokDir, "auth.json"));
    return home;
}
export async function startGrokProxyPool(options = {}) {
    const accounts = listAccountFiles();
    if (accounts.length === 0)
        return startGrokProxy(options);
    const children = [];
    const ready = new Map();
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
        kill(signal = "SIGTERM") {
            for (const child of children)
                child.kill(signal);
        },
        stop(signal = "SIGTERM") {
            for (const child of children)
                child.stop(signal);
        },
    };
}
