import { jsonFetch } from "./api-core";

export type GrokPoolAccount = {
  name: string;
  email: string | null;
  expiresAt: number | null;
};

export type GrokPoolInfo = {
  accounts: GrokPoolAccount[];
  currentAuthExists: boolean;
  restartRequired: boolean;
  activeProxyCount: number;
};

export function getGrokAccounts(): Promise<GrokPoolInfo> {
  return jsonFetch<GrokPoolInfo>("/api/grok/accounts");
}

export function importCurrentGrokAccount(name: string): Promise<{ account: GrokPoolAccount; restartRequired: boolean }> {
  return jsonFetch("/api/grok/accounts/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function deleteGrokAccount(name: string): Promise<{ ok: boolean; restartRequired: boolean }> {
  return jsonFetch(`/api/grok/accounts/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}
