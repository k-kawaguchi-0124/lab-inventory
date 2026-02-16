import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { apiUrl } from "../lib/api";

type Location = { id: string; name: string };
type User = { id: string; name: string };
type AssetCandidate = {
  id: string;
  serial: string;
  name: string;
  status: string;
};

export function AssetCheckoutPage() {
  const [searchParams] = useSearchParams();
  const [assetId, setAssetId] = useState("");
  const [assetQuery, setAssetQuery] = useState("");
  const [assetCandidates, setAssetCandidates] = useState<AssetCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prefilled = searchParams.get("assetId");
    if (prefilled) setAssetId(prefilled);
  }, [searchParams]);

  useEffect(() => {
    Promise.all([fetch(apiUrl("/locations")), fetch(apiUrl("/users"))])
      .then(async ([lRes, uRes]) => {
        const l = (await lRes.json()) as Location[];
        const u = (await uRes.json()) as User[];
        setLocations(l);
        setUsers(u);
        if (l.length > 0) setLocationId(l[0].id);
        if (u.length > 0) setUserId(u[0].id);
      })
      .catch(() => {
        setLocations([]);
        setUsers([]);
      });
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
        const res = await fetch(apiUrl(`/assets?status=AVAILABLE&query=${encodeURIComponent(q)}&take=8`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/assets/${assetId}/checkout`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          locationId,
          note: note.trim() ? note : undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage("貸出を更新しました");
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
      <h1 className="panel-title">備品の貸出</h1>
      <p className="panel-subtitle">シリアル/名称で候補を選ぶか、備品IDを直接入力して貸出を更新します。</p>

      <form className="form-grid" onSubmit={onSubmit}>
        <label className="field field-full">
          <span>備品検索（シリアル / 名称）</span>
          <input
            value={assetQuery}
            onChange={(e) => setAssetQuery(e.target.value)}
            placeholder="例: 26000001 / オシロスコープ"
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
                    setAssetQuery(`${a.serial} / ${a.name}`);
                    setAssetCandidates([]);
                  }}
                >
                  {a.serial} | {a.name} ({a.status})
                </button>
              ))}
            </div>
          )}
        </label>
        <label className="field field-full">
          <span>備品ID</span>
          <input value={assetId} onChange={(e) => setAssetId(e.target.value)} required placeholder="cuid..." />
        </label>
        <label className="field">
          <span>貸出先ユーザー</span>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} required>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>場所</span>
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
            貸出を登録
          </button>
        </div>
      </form>

      {message && <p className="msg-ok">{message}</p>}
      {error && <p className="msg-err">{error}</p>}
    </section>
  );
}
