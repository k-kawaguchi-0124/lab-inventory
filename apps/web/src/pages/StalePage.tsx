import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../lib/api";

type StaleType = "ASSET" | "CONSUMABLE" | "ALL";

type StaleItem = {
  type: "ASSET" | "CONSUMABLE";
  id: string;
  serial: string;
  name: string;
  category: string;
  location: string | null;
  user: { name: string } | null;
  daysSince: number;
};

type StaleResponse = {
  items: StaleItem[];
};

export function StalePage() {
  const [daysInput, setDaysInput] = useState("180");
  const [type, setType] = useState<StaleType>("ASSET");
  const [data, setData] = useState<StaleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = Number(daysInput);
  const days = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 180;

  function normalizeNumericInput(value: string) {
    return value
      .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
      .replace(/[^0-9]/g, "");
  }

  const url = useMemo(() => apiUrl(`/stale?days=${days}&type=${type}`), [days, type]);

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
    <section className="panel">
      <h1 className="panel-title">長期未更新一覧</h1>
      <p className="panel-subtitle">最終更新から長期間経過した備品・消耗品を表示します。</p>

      <div className="form-row">
        <label className="field-inline">
          <span>days</span>
          <input
            type="text"
            inputMode="numeric"
            value={daysInput}
            onChange={(e) => setDaysInput(normalizeNumericInput(e.target.value))}
          />
        </label>
        <label className="field-inline">
          <span>type</span>
          <select value={type} onChange={(e) => setType(e.target.value as StaleType)}>
            <option value="ASSET">ASSET</option>
            <option value="CONSUMABLE">CONSUMABLE</option>
            <option value="ALL">ALL</option>
          </select>
        </label>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          更新
        </button>
      </div>

      {error && <p className="msg-err">{error}</p>}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Serial</th>
              <th>Name</th>
              <th>Location</th>
              <th>User</th>
              <th>Days</th>
            </tr>
          </thead>
          <tbody>
            {!data?.items?.length && !loading ? (
              <tr>
                <td colSpan={6}>該当なし</td>
              </tr>
            ) : (
              data?.items?.map((x) => (
                <tr key={`${x.type}:${x.id}`}>
                  <td>{x.type}</td>
                  <td className="mono">{x.serial}</td>
                  <td>{x.name}</td>
                  <td>{x.location ?? "-"}</td>
                  <td>{x.user?.name ?? "-"}</td>
                  <td>{x.daysSince}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
