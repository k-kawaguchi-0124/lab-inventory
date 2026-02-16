import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

type Stats = {
  checkedOutCount: number;
  staleDays: number;
  staleCount: number;
  staleAssetCount: number;
  staleConsumableCount: number;
};

type Asset = {
  id: string;
  serial: string;
  name: string;
  category: string;
  status: string;
  currentLocationId: string;
  currentUserId: string | null;
  updatedAt: string;
};

export function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const staleDays = 180;

  const statsUrl = useMemo(() => `/api/stats?staleDays=${staleDays}`, [staleDays]);

  useEffect(() => {
    fetch(statsUrl)
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null));
  }, [statsUrl]);

  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/assets?query=${encodeURIComponent(query.trim())}&take=20`);
      const json = await res.json();
      setResults(json);
    } finally {
      setLoading(false);
    }
  }

  async function loadCheckedOut() {
    setLoading(true);
    try {
      const res = await fetch(`/api/assets?status=CHECKED_OUT&take=20`);
      const json = await res.json();
      setResults(json);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>Lab Inventory</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8, minWidth: 180 }}>
          <div style={{ color: "#666" }}>貸出中</div>
          <div style={{ fontSize: 24 }}>{stats ? stats.checkedOutCount : "-"}</div>
          <button onClick={loadCheckedOut} disabled={loading} style={{ marginTop: 8 }}>
            一覧を見る
          </button>
        </div>

        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8, minWidth: 220 }}>
          <div style={{ color: "#666" }}>{staleDays}日以上 未更新</div>
          <div style={{ fontSize: 24 }}>{stats ? stats.staleCount : "-"}</div>
          <div style={{ color: "#666", fontSize: 12 }}>
            備品 {stats?.staleAssetCount ?? "-"} / 消耗品 {stats?.staleConsumableCount ?? "-"}
          </div>
          <Link to="/stale" style={{ display: "inline-block", marginTop: 8 }}>
            滞留一覧へ
          </Link>
        </div>
      </div>

      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="シリアル or 名前で検索"
          style={{ width: 320, padding: 8 }}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />
        <button onClick={search} disabled={loading}>
          検索
        </button>
        <button onClick={loadCheckedOut} disabled={loading}>
          貸出中を表示
        </button>
      </div>

      <h2 style={{ marginBottom: 8 }}>結果</h2>
      <table width="100%" cellPadding={8} style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Serial</th>
            <th>Name</th>
            <th>Category</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {results.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ color: "#666" }}>
                まだ結果がありません（検索するか「貸出中を表示」を押してください）
              </td>
            </tr>
          ) : (
            results.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{a.serial}</td>
                <td>{a.name}</td>
                <td>{a.category}</td>
                <td>{a.status}</td>
                <td>{new Date(a.updatedAt).toLocaleString()}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
