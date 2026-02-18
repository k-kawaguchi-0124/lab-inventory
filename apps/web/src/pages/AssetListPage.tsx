import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../lib/api";
import { UiSelect } from "../components/UiSelect";
import { apiErrorMessage, unknownErrorMessage } from "../lib/errors";

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
  const [candidates, setCandidates] = useState<Asset[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
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
      if (!res.ok) throw new Error(await apiErrorMessage(res, "物品一覧の取得に失敗しました"));
      const json = (await res.json()) as Asset[];
      setItems(json);
    } catch (e: unknown) {
      setError(unknownErrorMessage(e, "物品一覧の取得に失敗しました"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [listUrl]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(async () => {
      setCandidateLoading(true);
      try {
        const res = await fetch(apiUrl(`/assets?query=${encodeURIComponent(q)}&take=8`));
        if (!res.ok) throw new Error();
        const json = (await res.json()) as Asset[];
        setCandidates(json);
      } catch {
        setCandidates([]);
      } finally {
        setCandidateLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <section className="panel">
      <h1 className="panel-title">研究室内 物品一覧</h1>
      <p className="panel-subtitle">検索しなくても、登録済み備品を一覧で確認できます。</p>

      <div className="search-row">
        <div className="autocomplete-wrap">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名称 / シリアル / カテゴリ / 予算で絞り込み"
          />
          {candidateLoading && <div className="autocomplete-hint">候補を検索中...</div>}
          {!candidateLoading && candidates.length > 0 && (
            <div className="autocomplete-list">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="autocomplete-item"
                  onClick={() => {
                    setQuery(c.serial);
                    setCandidates([]);
                  }}
                >
                  <span>{c.name}</span>
                  <span className="mono">{c.serial}</span>
                  <span>{c.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <UiSelect
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "全ステータス" },
            { value: "AVAILABLE", label: "AVAILABLE" },
            { value: "CHECKED_OUT", label: "CHECKED_OUT" },
            { value: "BROKEN", label: "BROKEN" },
            { value: "DISPOSED", label: "DISPOSED" },
          ]}
        />
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          再読み込み
        </button>
      </div>

      {error && <p className="msg-err">{error}</p>}

      <div className="table-wrap">
        <table className="data-table assets-list-table">
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
                  <td className="mono" data-label="Serial">
                    <Link className="link-inline" to={`/assets/${a.id}/edit`}>
                      {a.serial}
                    </Link>
                  </td>
                  <td data-label="Name">
                    <Link className="link-inline" to={`/assets/${a.id}/edit`}>
                      {a.name}
                    </Link>
                  </td>
                  <td data-label="Category">{a.category}</td>
                  <td data-label="予算">{a.budgetCode ?? "-"}</td>
                  <td data-label="購入日">{a.purchasedAt ? new Date(a.purchasedAt).toLocaleDateString("ja-JP") : "-"}</td>
                  <td data-label="Location">{a.currentLocation?.name ?? a.currentLocationId}</td>
                  <td data-label="User">{a.currentUser?.name ?? (a.currentUserId ? a.currentUserId : "-")}</td>
                  <td data-label="Status">{a.status}</td>
                  <td data-label="Last Activity">{new Date(a.lastActivityAt).toLocaleString("ja-JP")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
