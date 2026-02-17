import { useEffect, useState } from "react";
import { apiUrl } from "../lib/api";

type MasterItem = { name: string; usageCount: number };
type LocationItem = { id: string; name: string; assetCount: number; consumableCount: number; childCount: number };
type MastersResponse = {
  assetCategories: MasterItem[];
  assetBudgets: MasterItem[];
  consumableCategories: MasterItem[];
  locations: LocationItem[];
};

type Tab = "assetCategories" | "assetBudgets" | "consumableCategories" | "locations";

export function MastersPage() {
  const [tab, setTab] = useState<Tab>("assetCategories");
  const [data, setData] = useState<MastersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/masters"));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as MastersResponse;
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "読み込みに失敗しました");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createCurrent() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    setMessage(null);
    try {
      const endpoint =
        tab === "assetCategories"
          ? "/masters/asset-categories"
          : tab === "assetBudgets"
            ? "/masters/asset-budgets"
            : tab === "consumableCategories"
              ? "/masters/consumable-categories"
              : "/masters/locations";
      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error ?? `HTTP ${res.status}`);
      }
      setNewName("");
      setMessage("追加しました");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "追加に失敗しました");
    }
  }

  async function renameItem(name: string, id?: string) {
    const next = window.prompt(`「${name}」の新しい名称`, name)?.trim();
    if (!next || next === name) return;
    setError(null);
    setMessage(null);
    try {
      if (tab === "locations") {
        if (!id) return;
        const res = await fetch(apiUrl(`/masters/locations/${id}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        const endpoint =
          tab === "assetCategories"
            ? "/masters/asset-categories"
            : tab === "assetBudgets"
              ? "/masters/asset-budgets"
              : "/masters/consumable-categories";
        const res = await fetch(apiUrl(endpoint), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: name, to: next }),
        });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson?.error ?? `HTTP ${res.status}`);
        }
      }
      setMessage("名称を変更しました");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "変更に失敗しました");
    }
  }

  async function deleteItem(name: string, id?: string) {
    const ok = window.confirm(`「${name}」を削除しますか？`);
    if (!ok) return;
    setError(null);
    setMessage(null);
    try {
      if (tab === "locations") {
        if (!id) return;
        const res = await fetch(apiUrl(`/masters/locations/${id}`), { method: "DELETE" });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson?.error ?? `HTTP ${res.status}`);
        }
      } else {
        const endpoint =
          tab === "assetCategories"
            ? `/masters/asset-categories/${encodeURIComponent(name)}`
            : tab === "assetBudgets"
              ? `/masters/asset-budgets/${encodeURIComponent(name)}`
              : `/masters/consumable-categories/${encodeURIComponent(name)}`;
        const res = await fetch(apiUrl(endpoint), { method: "DELETE" });
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson?.error ?? `HTTP ${res.status}`);
        }
      }
      setMessage("削除しました");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "削除に失敗しました");
    }
  }

  const rows =
    tab === "assetCategories"
      ? data?.assetCategories.map((x) => ({ key: x.name, id: undefined, name: x.name, usageLabel: `${x.usageCount}件`, canDelete: x.usageCount === 0 })) ??
        []
      : tab === "assetBudgets"
        ? data?.assetBudgets.map((x) => ({ key: x.name, id: undefined, name: x.name, usageLabel: `${x.usageCount}件`, canDelete: x.usageCount === 0 })) ??
          []
        : tab === "consumableCategories"
          ? data?.consumableCategories.map((x) => ({
              key: x.name,
              id: undefined,
              name: x.name,
              usageLabel: `${x.usageCount}件`,
              canDelete: x.usageCount === 0,
            })) ?? []
          : data?.locations.map((x) => ({
              key: x.id,
              id: x.id,
              name: x.name,
              usageLabel: `備品${x.assetCount}/消耗品${x.consumableCount}`,
              canDelete: x.assetCount === 0 && x.consumableCount === 0 && x.childCount === 0,
            })) ?? [];

  return (
    <section className="panel">
      <h1 className="panel-title">マスタ管理</h1>
      <p className="panel-subtitle">カテゴリ・予算・保管場所を一括管理できます。使用中データは削除できません。</p>

      <div className="master-tabs">
        <button type="button" className={`btn ${tab === "assetCategories" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("assetCategories")}>
          備品カテゴリ
        </button>
        <button type="button" className={`btn ${tab === "assetBudgets" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("assetBudgets")}>
          備品予算
        </button>
        <button type="button" className={`btn ${tab === "consumableCategories" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("consumableCategories")}>
          消耗品カテゴリ
        </button>
        <button type="button" className={`btn ${tab === "locations" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("locations")}>
          保管場所
        </button>
      </div>

      <div className="search-row" style={{ marginTop: 10 }}>
        <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新しい名称" />
        <button className="btn btn-primary" type="button" onClick={createCurrent}>
          追加
        </button>
        <button className="btn btn-secondary" type="button" onClick={load} disabled={loading}>
          再読み込み
        </button>
      </div>

      {message && <p className="msg-ok">{message}</p>}
      {error && <p className="msg-err">{error}</p>}

      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="data-table masters-table">
          <colgroup>
            <col style={{ width: "40%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "35%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>名称</th>
              <th>使用状況</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3}>{loading ? "読み込み中..." : "データがありません"}</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key}>
                  <td>{row.name}</td>
                  <td>{row.usageLabel}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => renameItem(row.name, row.id)}>
                        名称変更
                      </button>
                      <button type="button" className="btn btn-secondary" disabled={!row.canDelete} onClick={() => deleteItem(row.name, row.id)}>
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
