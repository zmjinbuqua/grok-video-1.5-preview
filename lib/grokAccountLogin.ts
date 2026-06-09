import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { importGrokAccountFromFileAuto, type GrokAccountPoolItem } from "./grokAccountPool.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const loginRoot = join(rootDir, ".ima2", "grok-login-sessions");
const LOGIN_MAX_AGE_MS = 8 * 60 * 1000;

export type GrokLoginStatus = "running" | "success" | "failed" | "cancelled";

export type GrokLoginSessionSnapshot = {
  id: string;
  status: GrokLoginStatus;
  output: string;
  loginUrl: string | null;
  account: GrokAccountPoolItem | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
};

type GrokLoginSession = GrokLoginSessionSnapshot & {
  proc: ChildProcessWithoutNullStreams | null;
  homeDir: string;
};

const sessions = new Map<string, GrokLoginSession>();

function progrokBinPath(): string {
  const isWin = process.platform === "win32";
  const binPath = join(rootDir, "node_modules", ".bin", isWin ? "progrok.cmd" : "progrok");
  if (existsSync(binPath)) return binPath;

  const pkgPath = join(rootDir, "node_modules", "progrok", "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { bin?: string | Record<string, string> };
      const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.progrok;
      if (bin) {
        const resolved = join(rootDir, "node_modules", "progrok", bin);
        if (existsSync(resolved)) return resolved;
      }
    } catch {}
  }

  const legacy = join(rootDir, "node_modules", "progrok", "dist", "index.js");
  if (existsSync(legacy)) return legacy;

  throw new Error(
    "progrok is not installed. Run install-ima2.bat / install-ima2.ps1 in this project, or run npm install before Grok login.",
  );
}

function progrokPatchPath(): string | null {
  const pkgPath = join(rootDir, "node_modules", "progrok", "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { bin?: string | Record<string, string> };
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.progrok;
    if (!bin) return null;
    const resolved = join(rootDir, "node_modules", "progrok", bin);
    return existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function ensureProgrokForcesAccountSelection() {
  try {
    const patchPath = progrokPatchPath();
    if (!patchPath) return;
    const source = readFileSync(patchPath, "utf-8");
    if (source.includes('searchParams.set("prompt", "login")')) return;
    const marker = 'authorizeUrl.searchParams.set("code_challenge_method", "S256");';
    if (!source.includes(marker)) return;
    writeFileSync(
      patchPath,
      source.replace(
        marker,
        `${marker}\n  authorizeUrl.searchParams.set("prompt", "login");\n  authorizeUrl.searchParams.set("max_age", "0");`,
      ),
    );
  } catch {}
}

function finishSession(session: GrokLoginSession, status: GrokLoginStatus, error: string | null = null) {
  session.status = status;
  session.error = error;
  session.finishedAt = Date.now();
  try { session.proc?.kill(); } catch {}
}

function expireIfStale(session: GrokLoginSession): boolean {
  if (session.status !== "running") return false;
  if (Date.now() - session.startedAt <= LOGIN_MAX_AGE_MS) return false;
  finishSession(session, "failed", "登录验证码已过期，请重新点击登录按钮。");
  return true;
}

function snapshot(session: GrokLoginSession): GrokLoginSessionSnapshot {
  return {
    id: session.id,
    status: session.status,
    output: session.output,
    loginUrl: session.loginUrl,
    account: session.account,
    error: session.error,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
  };
}

function appendOutput(session: GrokLoginSession, chunk: Buffer | string) {
  const clean = chunk.toString().replace(/\u001b\[[0-9;]*m/g, "");
  const match = clean.match(/https:\/\/(?:accounts|auth)\.x\.ai\/[^\s]+/i);
  if (match?.[0] && !session.loginUrl) {
    try {
      const url = new URL(match[0]);
      session.loginUrl = url.toString();
    } catch {
      session.loginUrl = match[0];
    }
  }
  session.output = `${session.output}${clean}`.slice(-8000);
}

export function startGrokAccountLogin(): GrokLoginSessionSnapshot {
  mkdirSync(loginRoot, { recursive: true });
  let progrokCli: string;
  try {
    progrokCli = progrokBinPath();
    ensureProgrokForcesAccountSelection();
  } catch (error) {
    const message = error instanceof Error ? error.message : "progrok is not installed.";
    throw Object.assign(new Error(message), { status: 500 });
  }
  const running = Array.from(sessions.values()).find((session) => session.status === "running");
  if (running) {
    if (expireIfStale(running)) {
      sessions.delete(running.id);
    } else {
      return snapshot(running);
    }
  }

  const id = `login-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const homeDir = join(loginRoot, id);
  mkdirSync(homeDir, { recursive: true });

  const session: GrokLoginSession = {
    id,
    status: "running",
    output: "",
    loginUrl: null,
    account: null,
    error: null,
    startedAt: Date.now(),
    finishedAt: null,
    proc: null,
    homeDir,
  };
  sessions.set(id, session);

  const env = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    IMA2_CONFIG_DIR: process.env.IMA2_CONFIG_DIR || join(rootDir, ".ima2"),
    IMA2_GENERATED_DIR: process.env.IMA2_GENERATED_DIR || join(rootDir, ".ima2", "generated"),
    NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY || "1",
  };

  const proc = spawn(process.execPath, [progrokCli, "login", "--browser"], {
    cwd: rootDir,
    env,
    shell: false,
  });
  session.proc = proc;

  proc.stdout.on("data", (chunk) => appendOutput(session, chunk));
  proc.stderr.on("data", (chunk) => appendOutput(session, chunk));
  proc.on("error", (error) => {
    finishSession(session, "failed", error.message);
  });
  proc.on("exit", (code) => {
    if (session.status === "cancelled") return;
    session.finishedAt = Date.now();
    if (code === 0) {
      try {
        const authPath = join(homeDir, ".progrok", "auth.json");
        if (!existsSync(authPath)) {
          throw new Error("Login finished, but auth.json was not created.");
        }
        session.account = importGrokAccountFromFileAuto(authPath);
        session.status = "success";
      } catch (error) {
        session.status = "failed";
        session.error = error instanceof Error ? error.message : "failed to import Grok login";
      }
    } else {
      session.status = "failed";
      session.error = `progrok login exited with code ${code ?? "unknown"}`;
    }
  });

  return snapshot(session);
}

export function getGrokAccountLogin(id: string): GrokLoginSessionSnapshot {
  const session = sessions.get(id);
  if (!session) {
    throw Object.assign(new Error("Grok login session not found."), { status: 404 });
  }
  expireIfStale(session);
  return snapshot(session);
}

export function cancelGrokAccountLogin(id: string): GrokLoginSessionSnapshot {
  const session = sessions.get(id);
  if (!session) {
    throw Object.assign(new Error("Grok login session not found."), { status: 404 });
  }
  if (session.status === "running") {
    finishSession(session, "cancelled");
  }
  return snapshot(session);
}

export function cleanupFinishedGrokLogins(maxAgeMs = 60 * 60 * 1000) {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (session.status === "running" || !session.finishedAt || now - session.finishedAt < maxAgeMs) continue;
    sessions.delete(session.id);
    rmSync(session.homeDir, { recursive: true, force: true });
  }
}
