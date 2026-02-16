import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { apiUrl } from "../lib/api";

type Location = { id: string; name: string };

export function AssetMovePage() {
  const [assetId, setAssetId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(apiUrl("/locations"))
      .then((r) => r.json())
      .then((items: Location[]) => {
        setLocations(items);
        if (items.length > 0) setLocationId(items[0].id);
      })
      .catch(() => setLocations([]));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/assets/${assetId}/move`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          note: note.trim() ? note : undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage("場所を更新しました");
      setAssetId("");
      setNote("");
    } catch (err: any) {
      setError(err?.message ?? "更新に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h1 className="panel-title">備品の移動</h1>
      <p className="panel-subtitle">備品IDと移動先の場所を指定して更新します。</p>

      <form className="form-grid" onSubmit={onSubmit}>
        <label className="field field-full">
          <span>備品ID</span>
          <input value={assetId} onChange={(e) => setAssetId(e.target.value)} required placeholder="cuid..." />
        </label>
        <label className="field">
          <span>移動先</span>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field field-full">
          <span>メモ</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="field-full">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            移動を登録
          </button>
        </div>
      </form>

      {message && <p className="msg-ok">{message}</p>}
      {error && <p className="msg-err">{error}</p>}
    </section>
  );
}
