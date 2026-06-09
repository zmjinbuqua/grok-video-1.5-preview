import { jsonFetch } from "./api-core";

export type GrokPoolAccount = {
  name: string;
  email: string | null;
  expiresAt: number | null;
  enabled: boolean;
};

export type GrokPoolInfo = {
  accounts: GrokPoolAccount[];
  currentAuthExists: boolean;
  restartRequired: boolean;
  activeProxyCount: number;
};

export type GrokLoginSession = {
  id: string;
  status: "running" | "success" | "failed" | "cancelled";
  output: string;
  loginUrl: string | null;
  account: GrokPoolAccount | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
};

export type GrokAccountCheckResult = {
  name: string;
  ok: boolean;
  status: "ready" | "no_image_model" | "http_error" | "timeout" | "error";
  reason: string | null;
  models: string[];
};

export function getGrokAccounts(): Promise<GrokPoolInfo> {
  return jsonFetch<GrokPoolInfo>("/api/grok/accounts");
}

export function startGrokLogin(): Promise<GrokLoginSession> {
  return jsonFetch<GrokLoginSession>("/api/grok/accounts/login", {
    method: "POST",
  });
}

export function getGrokLogin(id: string): Promise<GrokLoginSession> {
  return jsonFetch<GrokLoginSession>(`/api/grok/accounts/login/${encodeURIComponent(id)}`);
}

export function cancelGrokLogin(id: string): Promise<GrokLoginSession> {
  return jsonFetch<GrokLoginSession>(`/api/grok/accounts/login/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
  });
}

export function importCurrentGrokAccount(name: string): Promise<{ account: GrokPoolAccount; restartRequired: boolean }> {
  return jsonFetch("/api/grok/accounts/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function importGrokToken(name: string, tokenJson: string): Promise<{ account: GrokPoolAccount; restartRequired: boolean }> {
  return jsonFetch("/api/grok/accounts/import-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, tokenJson }),
  });
}

export function importBulkGrokAccounts(text: string): Promise<{ imported: GrokPoolAccount[]; errors: Array<{ line: number; error: string }>; restartRequired: boolean }> {
  return jsonFetch("/api/grok/accounts/import-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export function deleteGrokAccount(name: string): Promise<{ ok: boolean; restartRequired: boolean }> {
  return jsonFetch(`/api/grok/accounts/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export function setGrokAccountEnabled(name: string, enabled: boolean): Promise<{ account: GrokPoolAccount; restartRequired: boolean }> {
  return jsonFetch(`/api/grok/accounts/${encodeURIComponent(name)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export function checkGrokAccount(name: string): Promise<GrokAccountCheckResult> {
  return jsonFetch(`/api/grok/accounts/${encodeURIComponent(name)}/check`, {
    method: "POST",
  });
}
