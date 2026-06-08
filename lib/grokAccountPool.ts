import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const POOL_DIR = join(rootDir, ".grok-accounts");
const CURRENT_AUTH = join(homedir(), ".progrok", "auth.json");

export type GrokAccountPoolItem = {
  name: string;
  email: string | null;
  expiresAt: number | null;
};

function ensurePoolDir() {
  mkdirSync(POOL_DIR, { recursive: true });
}

function safeName(name: string): string {
  const trimmed = String(name || "").trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw Object.assign(new Error("Account name can only contain letters, numbers, dot, underscore, and dash."), { status: 400 });
  }
  return trimmed;
}

function accountPath(name: string): string {
  return join(POOL_DIR, `${safeName(name)}.json`);
}

function readAccount(path: string): Pick<GrokAccountPoolItem, "email" | "expiresAt"> {
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as { email?: string; expiresAt?: number };
    return {
      email: typeof data.email === "string" ? data.email : null,
      expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : null,
    };
  } catch {
    return { email: null, expiresAt: null };
  }
}

export function listGrokPoolAccounts(): GrokAccountPoolItem[] {
  ensurePoolDir();
  return readdirSync(POOL_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const name = basename(file, ".json");
      return { name, ...readAccount(join(POOL_DIR, file)) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function importCurrentGrokAccount(name: string): GrokAccountPoolItem {
  ensurePoolDir();
  if (!existsSync(CURRENT_AUTH)) {
    throw Object.assign(new Error("No current Grok OAuth login found. Log in first, then import."), { status: 404 });
  }
  const target = accountPath(name);
  copyFileSync(CURRENT_AUTH, target);
  const item = { name: safeName(name), ...readAccount(target) };
  writeFileSync(join(POOL_DIR, "pool-note.txt"), "Grok OAuth account pool. Do not share these files.\n", { flag: "a" });
  return item;
}

export function deleteGrokPoolAccount(name: string) {
  const target = accountPath(name);
  if (!existsSync(target)) {
    throw Object.assign(new Error("Account not found."), { status: 404 });
  }
  rmSync(target, { force: true });
}

export function grokPoolInfo() {
  return {
    accounts: listGrokPoolAccounts(),
    currentAuthExists: existsSync(CURRENT_AUTH),
    restartRequired: true,
  };
}
