import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { apiUrl } from "../lib/api";
import { UiSelect } from "../components/UiSelect";
import { apiErrorMessage, unknownErrorMessage } from "../lib/errors";

type Location = { id: string; name: string };
type AssetCandidate = { id: string; serial: string; name: string; status: string };

export function AssetMovePage() {
  const [assetId, setAssetId] = useState("");
  const [assetQuery, setAssetQuery] = useState("");
  const [assetCandidates, setAssetCandidates] = useState<AssetCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [note, setNote] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addLocation() {
    const name = newLocation.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch(apiUrl("/locations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(await apiErrorMessage(res, "保管場所の追加に失敗しました"));
      const created = (await res.json()) as Location;
      const next = [...locations, created].sort((a, b) => a.name.localeCompare(b.name, "ja"));
      setLocations(next);
      setLocationId(created.id);
      setNewLocation("");
      setShowNewLocation(false);
    } catch (e: any) {
      setError(unknownErrorMessage(e, "保管場所の追加に失敗しました"));
    }
  }

  useEffect(() => {
    fetch(apiUrl("/locations"))
      .then((r) => r.json())
      .then((items: Location[]) => {
        setLocations(items);
        if (items.length > 0) setLocationId(items[0].id);
      })
      .catch(() => setLocations([]));
  }, []);

  useEffect(() => {
    const q = assetQuery.trim();
    if (q.length < 2) {
      setAssetCandidates([]);
      return;
    }

    const timer = setTimeout(async () => {
      setCandidateLoading(true);
      try {
        const res = await fetch(apiUrl(`/assets?query=${encodeURIComponent(q)}&take=8`));
        if (!res.ok) throw new Error();
        const json = (await res.json()) as AssetCandidate[];
        setAssetCandidates(json);
      } catch {
        setAssetCandidates([]);
      } finally {
        setCandidateLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [assetQuery]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!assetId) {
      setError("移動する備品を候補から選択してください");
      return;
    }
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
      if (!res.ok) throw new Error(await apiErrorMessage(res, "移動の登録に失敗しました"));
      setMessage("場所を更新しました");
      setAssetId("");
      setAssetQuery("");
      setAssetCandidates([]);
      setNote("");
    } catch (err: unknown) {
      setError(unknownErrorMessage(err, "移動の登録に失敗しました"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h1 className="panel-title">備品の移動</h1>
      <p className="panel-subtitle">名称/シリアルで備品を選択して、移動先を更新します。</p>

      <form className="form-grid" onSubmit={onSubmit}>
        <label className="field field-full">
          <span>備品検索（名称 / シリアル）</span>
          <input
            value={assetQuery}
            onChange={(e) => setAssetQuery(e.target.value)}
            placeholder="例: Raspi4 / 26000001"
          />
          {candidateLoading && <small>候補を検索中...</small>}
          {!candidateLoading && assetCandidates.length > 0 && (
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {assetCandidates.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="btn btn-secondary"
                  style={{ textAlign: "left" }}
                  onClick={() => {
                    setAssetId(a.id);
                    setAssetQuery(`${a.name} / ${a.serial}`);
                    setAssetCandidates([]);
                  }}
                >
                  {a.name} | {a.serial} ({a.status})
                </button>
              ))}
            </div>
          )}
          {assetId && <small>選択済みの備品ID: {assetId}</small>}
        </label>
        <label className="field">
          <span>移動先</span>
          <UiSelect
            value={locationId}
            onChange={setLocationId}
            required
            options={locations.map((loc) => ({ value: loc.id, label: loc.name }))}
          />
          <button type="button" className="link-inline-btn" onClick={() => setShowNewLocation((v) => !v)}>
            {showNewLocation ? "保管場所追加を閉じる" : "＋ 新しい保管場所を追加"}
          </button>
          {showNewLocation && (
            <div className="form-row">
              <input
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="新しい保管場所名"
              />
              <button type="button" className="btn btn-secondary" onClick={addLocation}>
                追加
              </button>
            </div>
          )}
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
