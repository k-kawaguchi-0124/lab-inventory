import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { apiUrl } from "../lib/api";
import { UiSelect } from "../components/UiSelect";

type Location = {
  id: string;
  name: string;
};

export function AssetCreatePage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [budgets, setBudgets] = useState<string[]>([]);
  const [serial, setSerial] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [budgetCode, setBudgetCode] = useState("");
  const [newBudget, setNewBudget] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewBudget, setShowNewBudget] = useState(false);
  const [purchasedAt, setPurchasedAt] = useState("");
  const [locationId, setLocationId] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetch(apiUrl("/locations")), fetch(apiUrl("/asset-categories")), fetch(apiUrl("/asset-budgets"))])
      .then(async ([locRes, catRes, budgetRes]) => {
        const locItems = (await locRes.json()) as Location[];
        const catJson = (await catRes.json()) as { items?: string[] };
        const budgetJson = (await budgetRes.json()) as { items?: string[] };
        const catItems = (catJson.items ?? []).filter((x) => x.trim().length > 0);
        const budgetItems = (budgetJson.items ?? []).filter((x) => x.trim().length > 0);
        setLocations(locItems);
        setCategories(catItems);
        setBudgets(budgetItems);
        if (locItems.length > 0) setLocationId(locItems[0].id);
      })
      .catch(() => {
        setLocations([]);
        setCategories([]);
      });
  }, []);

  function addCategory() {
    const value = newCategory.trim();
    if (!value) return;
    if (!categories.includes(value)) {
      setCategories([...categories, value].sort((a, b) => a.localeCompare(b, "ja")));
    }
    setCategory(value);
    setNewCategory("");
    setShowNewCategory(false);
  }

  function addBudget() {
    const value = newBudget.trim();
    if (!value) return;
    if (!budgets.includes(value)) {
      setBudgets([...budgets, value].sort((a, b) => a.localeCompare(b, "ja")));
    }
    setBudgetCode(value);
    setNewBudget("");
    setShowNewBudget(false);
  }

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
      setShowNewLocation(false);
    } catch (e: any) {
      setError(e?.message ?? "保管場所の追加に失敗しました");
    }
  }

  async function reserveSerial() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiUrl("/serials/reserve?type=ASSET"), { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { serial: string; expiresAt: string };
      setSerial(json.serial);
      setMessage(`シリアルを予約しました（期限: ${new Date(json.expiresAt).toLocaleTimeString("ja-JP")}）`);
    } catch (e: any) {
      setError(e?.message ?? "予約に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!serial) {
      setError("先にシリアル予約を実行してください");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiUrl("/assets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serial,
          name,
          category,
          budgetCode: budgetCode.trim() ? budgetCode.trim() : undefined,
          purchasedAt: purchasedAt || undefined,
          locationId,
          note: note.trim() ? note : undefined,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { id: string; serial: string };
      setMessage(`備品を登録しました: ${json.serial}`);
      setSerial("");
      setName("");
      setCategory("");
      setBudgetCode("");
      setPurchasedAt("");
      setNote("");
    } catch (err: any) {
      setError(err?.message ?? "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <h1 className="panel-title">備品の新規登録</h1>
      <p className="panel-subtitle">シリアル予約後に備品情報を登録します。</p>

      <div className="form-row">
        <button type="button" className="btn btn-secondary" onClick={reserveSerial} disabled={loading}>
          シリアル予約
        </button>
        <div className="serial-badge">{serial || "未予約"}</div>
      </div>

      <form className="form-grid compact-form" onSubmit={onSubmit}>
        <label className="field">
          <span>名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>カテゴリ</span>
          <UiSelect
            value={category}
            onChange={setCategory}
            required
            options={[
              { value: "", label: "選択してください" },
              ...categories.map((c) => ({ value: c, label: c })),
            ]}
          />
          <button type="button" className="link-inline-btn" onClick={() => setShowNewCategory((v) => !v)}>
            {showNewCategory ? "カテゴリ追加を閉じる" : "＋ 新しいカテゴリを追加"}
          </button>
          {showNewCategory && (
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
          )}
        </label>
        <label className="field field-compact">
          <span>予算</span>
          <UiSelect
            value={budgetCode}
            onChange={setBudgetCode}
            options={[
              { value: "", label: "選択してください" },
              ...budgets.map((b) => ({ value: b, label: b })),
            ]}
          />
          <button type="button" className="link-inline-btn" onClick={() => setShowNewBudget((v) => !v)}>
            {showNewBudget ? "予算追加を閉じる" : "＋ 新しい予算を追加"}
          </button>
          {showNewBudget && (
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
          )}
        </label>
        <label className="field field-compact">
          <span>購入日</span>
          <input type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
        </label>
        <label className="field">
          <span>保管場所</span>
          <UiSelect
            value={locationId}
            onChange={setLocationId}
            required
            options={locations.map((loc) => ({ value: loc.id, label: loc.name }))}
          />
        </label>
        <label className="field">
          <span>保管場所新規登録</span>
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
            登録する
          </button>
        </div>
      </form>

      {message && <p className="msg-ok">{message}</p>}
      {error && <p className="msg-err">{error}</p>}
    </section>
  );
}
