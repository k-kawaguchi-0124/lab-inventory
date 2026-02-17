import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../lib/api";

type Location = { id: string; name: string };

type Consumable = {
  id: string;
  serial: string;
  name: string;
  category: string;
  unit: string;
  currentQty: string | number;
  reorderThreshold: string | number;
  locationId: string;
  location?: { id: string; name: string } | null;
  lastActivityAt: string;
  needsReorder: boolean;
};

function num(v: string | number) {
  return typeof v === "number" ? v : Number(v);
}

export function ConsumablesPage() {
  const [items, setItems] = useState<Consumable[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [onlyNeedsReorder, setOnlyNeedsReorder] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [unit, setUnit] = useState("個");
  const [currentQty, setCurrentQty] = useState("0");
  const [reorderThreshold, setReorderThreshold] = useState("0");
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("take", "300");
    if (query.trim()) params.set("query", query.trim());
    if (onlyNeedsReorder) params.set("needsReorder", "true");
    return apiUrl(`/consumables?${params.toString()}`);
  }, [query, onlyNeedsReorder]);

  async function loadMaster() {
    const [locRes, catRes] = await Promise.all([fetch(apiUrl("/locations")), fetch(apiUrl("/consumable-categories"))]);
    const locJson = (await locRes.json()) as Location[];
    const catJson = (await catRes.json()) as { items?: string[] };
    const catItems = (catJson.items ?? []).filter((x) => x.trim().length > 0);
    setLocations(locJson);
    setCategories(catItems);
    if (!locationId && locJson.length > 0) setLocationId(locJson[0].id);
  }

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(listUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Consumable[];
      setItems(json);
    } catch (e: any) {
      setError(e?.message ?? "読み込みに失敗しました");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMaster().catch(() => undefined);
  }, []);

  useEffect(() => {
    loadItems();
  }, [listUrl]);

  function addCategory() {
    const value = newCategory.trim();
    if (!value) return;
    if (!categories.includes(value)) {
      setCategories([...categories, value].sort((a, b) => a.localeCompare(b, "ja")));
    }
    setCategory(value);
    setNewCategory("");
  }

  async function createConsumable() {
    setError(null);
    setMessage(null);
    if (!name.trim() || !category.trim() || !unit.trim() || !locationId) {
      setError("必須項目を入力してください");
      return;
    }
    try {
      const reserveRes = await fetch(apiUrl("/serials/reserve?type=CONSUMABLE"), { method: "POST" });
      if (!reserveRes.ok) throw new Error(`reserve HTTP ${reserveRes.status}`);
      const reserveJson = (await reserveRes.json()) as { serial: string };

      const res = await fetch(apiUrl("/consumables"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serial: reserveJson.serial,
          name: name.trim(),
          category: category.trim(),
          unit: unit.trim(),
          currentQty: Number(currentQty || 0),
          reorderThreshold: Number(reorderThreshold || 0),
          locationId,
          note: note.trim() ? note.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error(`create HTTP ${res.status}`);

      setMessage("消耗品を登録しました");
      setName("");
      setCurrentQty("0");
      setReorderThreshold("0");
      setNote("");
      await loadMaster();
      await loadItems();
    } catch (e: any) {
      setError(e?.message ?? "登録に失敗しました");
    }
  }

  async function adjustQuantity(id: string, delta: number) {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/consumables/${id}/adjust`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error ?? `HTTP ${res.status}`);
      }
      await loadItems();
    } catch (e: any) {
      setError(e?.message ?? "数量更新に失敗しました");
    }
  }

  return (
    <section className="home">
      <div className="panel">
        <h1 className="panel-title">消耗品管理</h1>
        <p className="panel-subtitle">現在数量を直接更新します。0になってもデータは残り、次回入荷時に加算できます。</p>

        <div className="form-grid">
          <label className="field">
            <span>名称</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>カテゴリ</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">選択してください</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>カテゴリ新規登録</span>
            <div className="form-row">
              <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="新しいカテゴリ名" />
              <button className="btn btn-secondary" type="button" onClick={addCategory}>
                追加
              </button>
            </div>
          </label>
          <label className="field">
            <span>単位</span>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="個 / 本 / mL など" />
          </label>
          <label className="field">
            <span>現在数量</span>
            <input type="number" min="0" step="0.01" value={currentQty} onChange={(e) => setCurrentQty(e.target.value)} />
          </label>
          <label className="field">
            <span>発注目安（この値以下で要発注）</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={reorderThreshold}
              onChange={(e) => setReorderThreshold(e.target.value)}
            />
          </label>
          <label className="field">
            <span>保管場所</span>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>メモ</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="field field-full">
            <button className="btn btn-primary" type="button" onClick={createConsumable}>
              消耗品を登録
            </button>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">在庫一覧</h2>
        <div className="search-row">
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="名前・カテゴリ検索" />
          <label className="field-inline">
            <input type="checkbox" checked={onlyNeedsReorder} onChange={(e) => setOnlyNeedsReorder(e.target.checked)} />
            要発注のみ表示
          </label>
          <button className="btn btn-secondary" onClick={loadItems} disabled={loading}>
            更新
          </button>
        </div>

        {message && <p className="msg-ok">{message}</p>}
        {error && <p className="msg-err">{error}</p>}

        <div className="table-wrap">
          <table className="data-table table-wide-user">
            <thead>
              <tr>
                <th>Serial</th>
                <th>Name</th>
                <th>Category</th>
                <th>数量</th>
                <th>発注目安</th>
                <th>状態</th>
                <th>不足量</th>
                <th>場所</th>
                <th>更新</th>
                <th>数量操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10}>読み込み中...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10}>データがありません</td>
                </tr>
              ) : (
                items.map((c) => {
                  const qty = num(c.currentQty);
                  const threshold = num(c.reorderThreshold);
                  const shortage = Math.max(0, threshold - qty);
                  return (
                    <tr key={c.id}>
                      <td className="mono">{c.serial}</td>
                      <td>{c.name}</td>
                      <td>{c.category}</td>
                      <td>
                        {qty} {c.unit}
                      </td>
                      <td>
                        {threshold} {c.unit}
                      </td>
                      <td>
                        {c.needsReorder ? <span className="badge-warn">要発注</span> : <span className="badge-ok">在庫あり</span>}
                      </td>
                      <td>
                        {shortage} {c.unit}
                      </td>
                      <td>{c.location?.name ?? c.locationId}</td>
                      <td>{new Date(c.lastActivityAt).toLocaleString("ja-JP")}</td>
                      <td>
                        <div className="qty-actions">
                          <button className="btn btn-secondary" onClick={() => adjustQuantity(c.id, -1)}>
                            -1
                          </button>
                          <button className="btn btn-secondary" onClick={() => adjustQuantity(c.id, -5)}>
                            -5
                          </button>
                          <button className="btn btn-secondary" onClick={() => adjustQuantity(c.id, 1)}>
                            +1
                          </button>
                          <button className="btn btn-secondary" onClick={() => adjustQuantity(c.id, 5)}>
                            +5
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
