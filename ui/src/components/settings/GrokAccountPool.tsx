import { useEffect, useState } from "react";
import { deleteGrokAccount, getGrokAccounts, importCurrentGrokAccount, type GrokPoolInfo } from "../../lib/api-grok-accounts";

function formatExpiry(expiresAt: number | null): string {
  if (!expiresAt) return "未知有效期";
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60000));
  if (minutes <= 0) return "可能已过期";
  if (minutes < 60) return `${minutes} 分钟后过期`;
  return `${Math.round(minutes / 60)} 小时后过期`;
}

export function GrokAccountPool() {
  const [info, setInfo] = useState<GrokPoolInfo | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setInfo(await getGrokAccounts());
  };

  useEffect(() => {
    refresh().catch((e) => setMessage(e instanceof Error ? e.message : "账号池读取失败"));
  }, []);

  const onImport = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage("请先输入账号名，例如 account-a。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await importCurrentGrokAccount(trimmed);
      setName("");
      await refresh();
      setMessage("已导入账号池。重启 ima2 后会参与轮询。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (account: string) => {
    setBusy(true);
    setMessage("");
    try {
      await deleteGrokAccount(account);
      await refresh();
      setMessage("已从账号池删除。重启 ima2 后生效。");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="settings-row settings-accordion">
      <div className="settings-row__copy">
        <p className="settings-eyebrow">Grok OAuth</p>
        <h4>Grok 账号池</h4>
        <p>把当前已登录的 Grok OAuth 保存到池里。重启后系统会给每个账号启动独立代理，并按生成任务轮询使用。</p>
        {info ? (
          <p className="settings-row__microcopy">
            池内 {info.accounts.length} 个账号，当前运行中的代理 {info.activeProxyCount} 个。
          </p>
        ) : null}
      </div>
      <div className="settings-accordion__body" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            className="api-key-input__field"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="账号名，例如 account-a"
            disabled={busy}
          />
          <button type="button" className="settings-action-btn" onClick={onImport} disabled={busy}>
            导入当前登录
          </button>
        </div>
        {info?.accounts.length ? (
          <div style={{ display: "grid", gap: 8 }}>
            {info.accounts.map((account) => (
              <div key={account.name} className="settings-row" style={{ padding: 12 }}>
                <div className="settings-row__copy">
                  <h4>{account.name}</h4>
                  <p>{account.email || "未知邮箱"} · {formatExpiry(account.expiresAt)}</p>
                </div>
                <div className="settings-row__control">
                  <button type="button" className="settings-action-btn" onClick={() => onDelete(account.name)} disabled={busy}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="settings-row__microcopy">账号池为空。先完成 Grok 登录，再输入账号名并导入。</p>
        )}
        {message ? <p className="settings-row__microcopy">{message}</p> : null}
      </div>
    </article>
  );
}
