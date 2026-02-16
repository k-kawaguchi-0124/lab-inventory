import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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

export function AssetSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [queryInput, setQueryInput] = useState(searchParams.get("query") ?? "");
  const [items, setItems] = useState<Asset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = searchParams.get("query")?.trim() ?? "";
  const status = searchParams.get("status")?.trim() ?? "";

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set("take", "100");
    if (query) params.set("query", query);
    if (status) params.set("status", status);
    return apiUrl(`/assets?${params.toString()}`);
  }, [query, status]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: Asset[]) => setItems(json))
      .catch((e: any) => {
        setError(e?.message ?? "読み込みに失敗しました");
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, [url]);

  useEffect(() => {
    if (items.length === 0) {
      setSelectedAssetId("");
      return;
    }
    if (!items.find((x) => x.id === selectedAssetId)) {
      setSelectedAssetId(items[0].id);
    }
  }, [items, selectedAssetId]);

  function runSearch() {
    const params = new URLSearchParams(searchParams);
    const q = queryInput.trim();
    if (q) params.set("query", q);
    else params.delete("query");
    setSearchParams(params);
  }

  const selectedAsset = items.find((x) => x.id === selectedAssetId) ?? null;

  return (
    <section className="panel">
      <h1 className="panel-title">検索結果</h1>
      <p className="panel-subtitle">ここから貸出・返却操作へ進めます。</p>

      <div className="search-row">
        <input
          className="input"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="シリアル or 名前で検索"
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
          }}
        />
        <button className="btn btn-primary" onClick={runSearch}>
          再検索
        </button>
        <Link className="btn btn-secondary" to="/">
          Homeへ
        </Link>
      </div>

      {error && <p className="msg-err">{error}</p>}

      <div className="search-actions-panel">
        {selectedAsset ? (
          <>
            <div>
              <strong>選択中:</strong> {selectedAsset.serial} / {selectedAsset.name}
            </div>
            <div className="row-actions">
              <Link className="btn btn-secondary" to={`/assets/${selectedAsset.id}/edit`}>
                編集
              </Link>
              <Link className="btn btn-secondary" to={`/assets/checkout?assetId=${selectedAsset.id}`}>
                貸出
              </Link>
              <Link className="btn btn-secondary" to={`/assets/checkin?assetId=${selectedAsset.id}`}>
                返却
              </Link>
            </div>
          </>
        ) : (
          <div>物品を選択すると、ここに操作ボタンが表示されます。</div>
        )}
      </div>

      <div className="table-wrap">
        <table className="data-table table-wide">
          <thead>
            <tr>
              <th>選択</th>
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
                <td colSpan={10}>読み込み中...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={10}>該当する物品がありません</td>
              </tr>
            ) : (
              items.map((a) => (
                <tr key={a.id} className={selectedAssetId === a.id ? "row-selected" : ""}>
                  <td>
                    <button type="button" className="btn btn-secondary" onClick={() => setSelectedAssetId(a.id)}>
                      選択
                    </button>
                  </td>
                  <td className="mono">{a.serial}</td>
                  <td>{a.name}</td>
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
