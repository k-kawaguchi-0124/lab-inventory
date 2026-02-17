import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { apiUrl } from "../lib/api";

type Location = { id: string; name: string };
type User = { id: string; name: string; role: "ADMIN" | "MEMBER" };
type BorrowedAsset = {
  id: string;
  serial: string;
  name: string;
  category: string;
  currentLocation?: { id: string; name: string } | null;
};
type BorrowedResponse = {
  user: User;
  count: number;
  assets: BorrowedAsset[];
};

export function AssetCheckinPage() {
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [borrowedAssets, setBorrowedAssets] = useState<BorrowedAsset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [note, setNote] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const created = (await res.json()) as Location;
      const next = [...locations, created].sort((a, b) => a.name.localeCompare(b.name, "ja"));
      setLocations(next);
      setLocationId(created.id);
      setNewLocation("");
    } catch (e: any) {
      setError(e?.message ?? "保管場所の追加に失敗しました");
    }
  }

  useEffect(() => {
    Promise.all([fetch(apiUrl("/locations")), fetch(apiUrl("/users"))])
      .then(async ([lRes, uRes]) => {
        const locItems = (await lRes.json()) as Location[];
        const userItems = (await uRes.json()) as User[];
        setLocations(locItems);
        setUsers(userItems);
        if (locItems.length > 0) setLocationId(locItems[0].id);

        const prefilledAssetId = searchParams.get("assetId");
        if (prefilledAssetId) {
          setAssetId(prefilledAssetId);
        }
      })
      .catch(() => {
        setLocations([]);
        setUsers([]);
      });
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setBorrowedAssets([]);
      setAssetId("");
      return;
    }

    setLoadingAssets(true);
    fetch(apiUrl(`/users/${selectedUserId}/assets`))
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as BorrowedResponse;
        setBorrowedAssets(json.assets);
        if (json.assets.length > 0) setAssetId(json.assets[0].id);
        else setAssetId("");
      })
      .catch(() => {
        setBorrowedAssets([]);
        setAssetId("");
      })
      .finally(() => setLoadingAssets(false));
  }, [selectedUserId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!assetId) {
      setError("返却する備品を選択してください");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/assets/${assetId}/checkin`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId,
          note: note.trim() ? note : undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage("返却を更新しました");
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
      <h1 className="panel-title">備品の返却</h1>
      <p className="panel-subtitle">ユーザを選び、そのユーザが借りている備品を選択して返却します。</p>

      <form className="form-grid" onSubmit={onSubmit}>
        <label className="field">
          <span>ユーザ</span>
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} required>
            <option value="">選択してください</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>返却する備品</span>
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} required disabled={!selectedUserId || loadingAssets}>
            {!selectedUserId ? (
              <option value="">先にユーザを選択してください</option>
            ) : loadingAssets ? (
              <option value="">読み込み中...</option>
            ) : borrowedAssets.length === 0 ? (
              <option value="">貸出中の備品はありません</option>
            ) : (
              borrowedAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} / {a.serial}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="field">
          <span>返却先</span>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} required>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>保管場所新規登録</span>
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
        </label>
        <label className="field field-full">
          <span>メモ</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="field-full">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            返却を登録
          </button>
        </div>
      </form>

      {message && <p className="msg-ok">{message}</p>}
      {error && <p className="msg-err">{error}</p>}
    </section>
  );
}
