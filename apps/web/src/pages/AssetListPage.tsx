import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../lib/api";

type Asset = {
  id: string;
  serial: string;
  name: string;
  category: string;
  status: string;
  budgetCode: string | null;
  purchasedAt: string | null;
  lastActivityAt: string;
  currentLocationId: string;
  currentUserId: string | null;
  currentLocation?: { id: string; name: string } | null;
  currentUser?: { id: string; name: string } | null;
};

export function AssetListPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("take", "200");
    if (query.trim()) params.set("query", query.trim());
    if (status) params.set("status", status);
    return apiUrl(`/assets?${params.toString()}`);
  }, [query, status]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(listUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Asset[];
      setItems(json);
    } catch (e: any) {
      setError(e?.message ?? "failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [listUrl]);

  return (
    <section className="panel">
      <h1 className="panel-title">研究室内 物品一覧</h1>
      <p className="panel-subtitle">検索しなくても、登録済み備品を一覧で確認できます。</p>

      <div className="search-row">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="シリアル / 名称 / カテゴリ / 予算で絞り込み"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全ステータス</option>
          <option value="AVAILABLE">AVAILABLE</option>
          <option value="CHECKED_OUT">CHECKED_OUT</option>
          <option value="BROKEN">BROKEN</option>
          <option value="DISPOSED">DISPOSED</option>
        </select>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          再読み込み
        </button>
      </div>

      {error && <p className="msg-err">{error}</p>}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Serial</th>
              <th>Name</th>
              <th>Category</th>
              <th>予算</th>
              <th>購入日</th>
              <th>Location</th>
              <th>User</th>
              <th>Status</th>
              <th>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9}>読み込み中...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9}>データがありません</td>
              </tr>
            ) : (
              items.map((a) => (
                <tr key={a.id}>
                  <td className="mono">
                    <Link className="link-inline" to={`/assets/${a.id}/edit`}>
                      {a.serial}
                    </Link>
                  </td>
                  <td>
                    <Link className="link-inline" to={`/assets/${a.id}/edit`}>
                      {a.name}
                    </Link>
                  </td>
                  <td>{a.category}</td>
                  <td>{a.budgetCode ?? "-"}</td>
                  <td>{a.purchasedAt ? new Date(a.purchasedAt).toLocaleDateString("ja-JP") : "-"}</td>
                  <td>{a.currentLocation?.name ?? a.currentLocationId}</td>
                  <td>{a.currentUser?.name ?? (a.currentUserId ? a.currentUserId : "-")}</td>
                  <td>{a.status}</td>
                  <td>{new Date(a.lastActivityAt).toLocaleString("ja-JP")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
