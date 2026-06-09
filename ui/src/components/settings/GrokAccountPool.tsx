import { useEffect, useRef, useState } from "react";
import {
  cancelGrokLogin,
  checkGrokAccount,
  deleteGrokAccount,
  getGrokAccounts,
  getGrokLogin,
  setGrokAccountEnabled,
  startGrokLogin,
  type GrokAccountCheckResult,
  type GrokLoginSession,
  type GrokPoolInfo,
} from "../../lib/api-grok-accounts";

function formatExpiry(expiresAt: number | null): string {
  if (!expiresAt) return "未知有效期";
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60000));
  if (minutes <= 0) return "可能已过期";
  if (minutes < 60) return `${minutes} 分钟后过期`;
  return `${Math.round(minutes / 60)} 小时后过期`;
}

function loginStatusText(session: GrokLoginSession | null): string {
  if (!session) return "";
  if (session.status === "running") return "登录进行中，请按下方提示完成 Grok 授权。";
  if (session.status === "success") return `登录成功，已加入账号池：${session.account?.name || "新账号"}。Grok 账号池已自动重新加载。`;
  if (session.status === "cancelled") return "已取消登录。";
  return session.error || "登录失败。";
}

function checkText(result: GrokAccountCheckResult | undefined): string {
  if (!result) return "";
  if (result.ok) return `可用，模型 ${result.models.length} 个`;
  return result.reason || result.status;
}

export function GrokAccountPool() {
  const [info, setInfo] = useState<GrokPoolInfo | null>(null);
  const [session, setSession] = useState<GrokLoginSession | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, GrokAccountCheckResult>>({});
  const popupRef = useRef<Window | null>(null);

  const openLoginUrl = (url: string | null) => {
    if (!url) return;
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.location.href = url;
      popupRef.current.focus();
      return;
    }
    popupRef.current = window.open(url, "_blank");
  };

  const refresh = async () => {
    setInfo(await getGrokAccounts());
  };

  useEffect(() => {
    refresh().catch((e) => setMessage(e instanceof Error ? e.message : "账号池读取失败"));
  }, []);

  useEffect(() => {
    if (!session || session.status !== "running") return;
    const timer = window.setInterval(() => {
      getGrokLogin(session.id)
        .then(async (next) => {
          setSession(next);
          if (next.loginUrl && next.loginUrl !== session.loginUrl) openLoginUrl(next.loginUrl);
          setMessage(loginStatusText(next));
          if (next.status !== "running") {
            await refresh();
          }
        })
        .catch((e) => setMessage(e instanceof Error ? e.message : "登录状态读取失败"));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [session]);

  const onStartLogin = async () => {
    setBusy(true);
    setMessage("");
    try {
      const next = await startGrokLogin();
      setSession(next);
      openLoginUrl(next.loginUrl);
      setMessage(loginStatusText(next));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "启动 Grok 登录失败");
    } finally {
      setBusy(false);
    }
  };

  const onCancelLogin = async () => {
    if (!session || session.status !== "running") return;
    setBusy(true);
    try {
      const next = await cancelGrokLogin(session.id);
      setSession(next);
      setMessage(loginStatusText(next));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "取消 Grok 登录失败");
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async (account: string, enabled: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      await setGrokAccountEnabled(account, enabled);
      await refresh();
      setMessage(enabled ? "账号已启用，Grok 账号池已自动重新加载。" : "账号已停用，Grok 账号池已自动重新加载。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "更新账号失败");
    } finally {
      setBusy(false);
    }
  };

  const onCheck = async (account: string) => {
    setChecking(account);
    setMessage("");
    try {
      const result = await checkGrokAccount(account);
      setChecks((prev) => ({ ...prev, [account]: result }));
      setMessage(result.ok ? `${account} 检测可用。` : `${account} 检测失败：${result.reason || result.status}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "检测账号失败");
    } finally {
      setChecking(null);
    }
  };

  const onDelete = async (account: string) => {
    setBusy(true);
    setMessage("");
    try {
      await deleteGrokAccount(account);
      await refresh();
      setChecks((prev) => {
        const next = { ...prev };
        delete next[account];
        return next;
      });
      setMessage("已从账号池删除，Grok 账号池已自动重新加载。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  const isLoggingIn = session?.status === "running";
  const enabledCount = info?.accounts.filter((account) => account.enabled).length || 0;

  return (
    <article className="settings-row settings-accordion">
      <div className="settings-row__copy">
        <p className="settings-eyebrow">Grok OAuth</p>
        <h4>Grok 账号池</h4>
        <p>在页面里完成 Grok 登录，成功后自动加入账号池并自动重新加载轮询代理。检测可用于排查 OAuth 是否失效。</p>
        {info ? (
          <p className="settings-row__microcopy">
            池内 {info.accounts.length} 个账号，启用 {enabledCount} 个，当前运行中的代理 {info.activeProxyCount} 个。
          </p>
        ) : null}
      </div>
      <div className="settings-accordion__body" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="settings-action-btn" onClick={onStartLogin} disabled={busy || isLoggingIn}>
            登录 Grok 账号并加入池
          </button>
          {session?.loginUrl ? (
            <button type="button" className="settings-action-btn" onClick={() => window.open(session.loginUrl || "", "_blank", "noopener,noreferrer")}>
              打开登录页面
            </button>
          ) : null}
          {isLoggingIn ? (
            <button type="button" className="settings-action-btn" onClick={onCancelLogin} disabled={busy}>
              取消登录
            </button>
          ) : null}
        </div>

        {session?.output ? (
          <pre
            className="settings-row__microcopy"
            style={{
              maxHeight: 180,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              border: "1px solid var(--border-subtle)",
              borderRadius: 8,
              padding: 10,
            }}
          >
            {session.output}
          </pre>
        ) : null}

        {info?.accounts.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {info.accounts.map((account) => {
              const result = checks[account.name];
              return (
                <div key={account.name} className="settings-row" style={{ padding: 12 }}>
                  <div className="settings-row__copy">
                    <h4>{account.name}</h4>
                    <p>
                      {account.email || "未知邮箱"} · {formatExpiry(account.expiresAt)} · {account.enabled ? "已启用" : "已停用"}
                    </p>
                    {result ? (
                      <p className="settings-row__microcopy" style={{ color: result.ok ? "var(--success)" : "var(--danger)" }}>
                        检测：{checkText(result)}
                      </p>
                    ) : null}
                  </div>
                  <div className="settings-row__control" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button type="button" className="settings-action-btn" onClick={() => onCheck(account.name)} disabled={busy || isLoggingIn || checking === account.name}>
                      {checking === account.name ? "检测中" : "检测"}
                    </button>
                    <button type="button" className="settings-action-btn" onClick={() => onToggle(account.name, !account.enabled)} disabled={busy || isLoggingIn}>
                      {account.enabled ? "停用" : "启用"}
                    </button>
                    <button type="button" className="settings-action-btn" onClick={() => onDelete(account.name)} disabled={busy || isLoggingIn}>
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="settings-row__microcopy">账号池为空。点击上方按钮登录第一个 Grok 账号。</p>
        )}

        {message ? <p className="settings-row__microcopy">{message}</p> : null}
      </div>
    </article>
  );
}
