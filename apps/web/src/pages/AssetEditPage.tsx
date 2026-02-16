import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiUrl } from "../lib/api";

type Asset = {
  id: string;
  serial: string;
  name: string;
  category: string;
  budgetCode: string | null;
  purchasedAt: string | null;
  note: string | null;
  currentLocationId: string;
};

type Location = {
  id: string;
  name: string;
};

function toDateInputValue(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function AssetEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [budgets, setBudgets] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [budgetCode, setBudgetCode] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [note, setNote] = useState("");
  const [locationId, setLocationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(apiUrl(`/assets/${id}`)),
      fetch(apiUrl("/locations")),
      fetch(apiUrl("/asset-categories")),
      fetch(apiUrl("/asset-budgets")),
    ])
      .then(async ([aRes, lRes, cRes, bRes]) => {
        if (!aRes.ok) throw new Error(`asset HTTP ${aRes.status}`);
        if (!lRes.ok) throw new Error(`locations HTTP ${lRes.status}`);
        if (!cRes.ok) throw new Error(`categories HTTP ${cRes.status}`);
        if (!bRes.ok) throw new Error(`budgets HTTP ${bRes.status}`);
        const a = (await aRes.json()) as Asset;
        const l = (await lRes.json()) as Location[];
        const c = (await cRes.json()) as { items?: string[] };
        const b = (await bRes.json()) as { items?: string[] };
        const catItems = (c.items ?? []).filter((x) => x.trim().length > 0);
        const budgetItems = (b.items ?? []).filter((x) => x.trim().length > 0);
        if (a.category && !catItems.includes(a.category)) catItems.push(a.category);
        if (a.budgetCode && !budgetItems.includes(a.budgetCode)) budgetItems.push(a.budgetCode);
        setAsset(a);
        setLocations(l);
        setCategories(catItems.sort((x, y) => x.localeCompare(y, "ja")));
        setBudgets(budgetItems.sort((x, y) => x.localeCompare(y, "ja")));
        setName(a.name);
        setCategory(a.category);
        setBudgetCode(a.budgetCode ?? "");
        setPurchasedAt(toDateInputValue(a.purchasedAt));
        setNote(a.note ?? "");
        setLocationId(a.currentLocationId || l[0]?.id || "");
      })
      .catch((e: any) => setError(e?.message ?? "読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, [id]);

  function addCategory() {
    const value = newCategory.trim();
    if (!value) return;
    if (!categories.includes(value)) {
      setCategories([...categories, value].sort((a, b) => a.localeCompare(b, "ja")));
    }
    setCategory(value);
    setNewCategory("");
  }

  function addBudget() {
    const value = newBudget.trim();
    if (!value) return;
    if (!budgets.includes(value)) {
      setBudgets([...budgets, value].sort((a, b) => a.localeCompare(b, "ja")));
    }
    setBudgetCode(value);
    setNewBudget("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/assets/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          locationId,
          budgetCode: budgetCode.trim() ? budgetCode.trim() : null,
          purchasedAt: purchasedAt ? new Date(purchasedAt).toISOString() : null,
          note: note.trim() ? note : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage("更新しました");
    } catch (err: any) {
      setError(err?.message ?? "更新に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  if (!id) return <section className="panel">IDが指定されていません</section>;

  return (
    <section className="panel">
      <h1 className="panel-title">物品情報の編集</h1>
      <p className="panel-subtitle">
        シリアル番号は固定です。変更が必要な場合は再登録運用にしてください。
      </p>

      <form className="form-grid" onSubmit={onSubmit}>
        <label className="field">
          <span>シリアル番号（編集不可）</span>
          <input value={asset?.serial ?? ""} disabled />
        </label>
        <label className="field">
          <span>名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>カテゴリ</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} required>
            {categories.length === 0 && <option value="">カテゴリを追加してください</option>}
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
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="新しいカテゴリ名"
            />
            <button type="button" className="btn btn-secondary" onClick={addCategory}>
              追加
            </button>
          </div>
        </label>
        <label className="field">
          <span>予算</span>
          <select value={budgetCode} onChange={(e) => setBudgetCode(e.target.value)}>
            <option value="">選択してください</option>
            {budgets.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>予算新規登録</span>
          <div className="form-row">
            <input
              value={newBudget}
              onChange={(e) => setNewBudget(e.target.value)}
              placeholder="新しい予算名"
            />
            <button type="button" className="btn btn-secondary" onClick={addBudget}>
              追加
            </button>
          </div>
        </label>
        <label className="field">
          <span>購入日</span>
          <input type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
        </label>
        <label className="field">
          <span>保管場所</span>
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
        <div className="field-full form-row">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            保存
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => navigate("/assets")}>
            一覧に戻る
          </button>
          <Link to="/" className="btn btn-secondary">
            Home
          </Link>
        </div>
      </form>

      {loading && <p>読み込み中...</p>}
      {message && <p className="msg-ok">{message}</p>}
      {error && <p className="msg-err">{error}</p>}
    </section>
  );
}
