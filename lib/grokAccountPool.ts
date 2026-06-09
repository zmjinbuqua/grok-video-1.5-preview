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
  enabled: boolean;
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

export function toSafeGrokAccountName(name: string): string {
  return safeName(name);
}

function accountExists(name: string): boolean {
  return existsSync(accountPath(name));
}

function makeAutoAccountName(email: string | null): string {
  const localPart = email?.split("@")[0] || "grok";
  const base = localPart.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+|_+$/g, "") || "grok";
  let candidate = base;
  let suffix = 2;
  while (accountExists(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function readAccount(path: string): Pick<GrokAccountPoolItem, "email" | "expiresAt" | "enabled"> {
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as { email?: string; expiresAt?: number; disabled?: boolean };
    return {
      email: typeof data.email === "string" ? data.email : null,
      expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : null,
      enabled: data.disabled !== true,
    };
  } catch {
    return { email: null, expiresAt: null, enabled: true };
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
  return importGrokAccountFromFile(name, CURRENT_AUTH);
}

export function importGrokAccountFromFile(name: string, sourceAuthPath: string): GrokAccountPoolItem {
  ensurePoolDir();
  if (!existsSync(sourceAuthPath)) {
    throw Object.assign(new Error("No Grok OAuth login file found after login."), { status: 404 });
  }
  const target = accountPath(name);
  copyFileSync(sourceAuthPath, target);
  const item = { name: safeName(name), ...readAccount(target) };
  writeFileSync(join(POOL_DIR, "pool-note.txt"), "Grok OAuth account pool. Do not share these files.\n", { flag: "a" });
  return item;
}

export function importGrokAccountFromFileAuto(sourceAuthPath: string): GrokAccountPoolItem {
  ensurePoolDir();
  if (!existsSync(sourceAuthPath)) {
    throw Object.assign(new Error("No Grok OAuth login file found after login."), { status: 404 });
  }
  const account = readAccount(sourceAuthPath);
  return importGrokAccountFromFile(makeAutoAccountName(account.email), sourceAuthPath);
}

function normalizeTokenInput(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    return JSON.parse(raw) as Record<string, unknown>;
  }
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  throw Object.assign(new Error("Token input must be JSON."), { status: 400 });
}

function writeAccountAuth(name: string, input: Record<string, unknown>): GrokAccountPoolItem {
  const accessToken = input.accessToken ?? input.access_token;
  const refreshToken = input.refreshToken ?? input.refresh_token;
  const expiresAtRaw = input.expiresAt ?? input.expires_at;
  const expiresAt = typeof expiresAtRaw === "number" ? expiresAtRaw : Number(expiresAtRaw);
  if (typeof accessToken !== "string" || accessToken.length < 20) {
    throw Object.assign(new Error("Missing accessToken."), { status: 400 });
  }
  if (typeof refreshToken !== "string" || refreshToken.length < 20) {
    throw Object.assign(new Error("Missing refreshToken."), { status: 400 });
  }
  const auth = {
    accessToken,
    refreshToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : undefined,
    tokenEndpoint: typeof input.tokenEndpoint === "string" ? input.tokenEndpoint : "https://auth.x.ai/oauth2/token",
    email: typeof input.email === "string" ? input.email : undefined,
    idToken: typeof input.idToken === "string" ? input.idToken : undefined,
    disabled: input.disabled === true ? true : undefined,
  };
  ensurePoolDir();
  const target = accountPath(name);
  writeFileSync(target, JSON.stringify(auth, null, 2), { mode: 0o600 });
  return { name: safeName(name), ...readAccount(target) };
}

export function importRawGrokAccount(name: string, raw: unknown): GrokAccountPoolItem {
  return writeAccountAuth(name, normalizeTokenInput(raw));
}

export function importBulkGrokAccounts(rawText: string): { imported: GrokAccountPoolItem[]; errors: Array<{ line: number; error: string }> } {
  const imported: GrokAccountPoolItem[] = [];
  const errors: Array<{ line: number; error: string }> = [];
  const lines = String(rawText || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    const line = lines[index];
    try {
      if (line.startsWith("{")) {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const name = typeof obj.name === "string" ? obj.name : typeof obj.email === "string" ? obj.email.replace(/[^a-zA-Z0-9._-]/g, "_") : `account-${lineNo}`;
        imported.push(writeAccountAuth(name, obj));
        continue;
      }
      const parts = line.split("----").map((part) => part.trim());
      if (parts.length === 4 && parts[0].includes("@")) {
        throw new Error("This looks like email----password----sessionToken----date. Grok account pool cannot use a web session token or password; import progrok OAuth accessToken + refreshToken instead.");
      }
      if (parts.length < 5) {
        throw new Error("Expected: name----email----accessToken----refreshToken----expiresAt");
      }
      const [name, email, accessToken, refreshToken, expiresAt] = parts;
      imported.push(writeAccountAuth(name, { email, accessToken, refreshToken, expiresAt }));
    } catch (e: any) {
      errors.push({ line: lineNo, error: e?.message || "invalid account line" });
    }
  }
  return { imported, errors };
}

export function deleteGrokPoolAccount(name: string) {
  const target = accountPath(name);
  if (!existsSync(target)) {
    throw Object.assign(new Error("Account not found."), { status: 404 });
  }
  rmSync(target, { force: true });
}

export function setGrokPoolAccountEnabled(name: string, enabled: boolean): GrokAccountPoolItem {
  const target = accountPath(name);
  if (!existsSync(target)) {
    throw Object.assign(new Error("Account not found."), { status: 404 });
  }
  const data = JSON.parse(readFileSync(target, "utf-8")) as Record<string, unknown>;
  if (enabled) delete data.disabled;
  else data.disabled = true;
  writeFileSync(target, JSON.stringify(data, null, 2), { mode: 0o600 });
  return { name: safeName(name), ...readAccount(target) };
}

export function getGrokPoolAccountAuthPath(name: string): string {
  const target = accountPath(name);
  if (!existsSync(target)) {
    throw Object.assign(new Error("Account not found."), { status: 404 });
  }
  return target;
}

export function grokPoolInfo() {
  return {
    accounts: listGrokPoolAccounts(),
    currentAuthExists: existsSync(CURRENT_AUTH),
    restartRequired: true,
  };
}
