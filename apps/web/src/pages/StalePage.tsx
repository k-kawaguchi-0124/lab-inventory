import { useEffect, useMemo, useState } from "react";

type StaleType = "ASSET" | "CONSUMABLE" | "ALL";

type StaleItem = {
  type: "ASSET" | "CONSUMABLE";
  id: string;
  serial: string;
  name: string;
  category: string;
  status?: string;
  location: string | null;
  user: { name: string; email: string } | null;
  lastActivityAt: string;
  daysSince: number;
};

type StaleResponse = {
  meta: {
    days: number;
    type: StaleType;
    limit: number;
    offset: number;
    returned: number;
    totalApprox: number;
  };
  items: StaleItem[];
};

export function StalePage() {
  const [days, setDays] = useState(180);
  const [type, setType] = useState<StaleType>("ASSET");
  const [data, setData] = useState<StaleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(() => `/api/stale?days=${days}&type=${type}`, [days, type]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as StaleResponse;
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [url]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>滞留一覧（未更新）</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <label>
          days:
          <input
            type="number"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>

        <label>
          type:
          <select value={type} onChange={(e) => setType(e.target.value as StaleType)}>
            <option value="ASSET">ASSET</option>
            <option value="CONSUMABLE">CONSUMABLE</option>
            <option value="ALL">ALL</option>
          </select>
        </label>

        <button onClick={load} disabled={loading}>
          更新
        </button>
      </div>

      {error && <div style={{ color: "red" }}>{error}</div>}

      <table width="100%" cellPadding={6} style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Type</th>
            <th>Serial</th>
            <th>Name</th>
            <th>Location</th>
            <th>Days</th>
          </tr>
        </thead>
        <tbody>
          {!data?.items?.length && !loading ? (
            <tr>
              <td colSpan={5}>該当なし</td>
            </tr>
          ) : (
            data?.items?.map((x) => (
              <tr key={x.id} style={{ borderBottom: "1px solid #eee" }}>
                <td>{x.type}</td>
                <td>{x.serial}</td>
                <td>{x.name}</td>
                <td>{x.location ?? "-"}</td>
                <td>{x.daysSince}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
