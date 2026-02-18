import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiUrl } from "../lib/api";
import { UiSelect } from "../components/UiSelect";
import { apiErrorMessage, unknownErrorMessage } from "../lib/errors";

type Asset = {
  id: string;
  serial: string;
  name: string;
  category: string;
  status: string;
  budgetCode: string | null;
  purchasedAt: string | null;
  note: string | null;
  currentLocationId: string;
};

type Location = {
  id: string;
  name: string;
};

type TimelineItem = {
  id: string;
  action: string;
  note: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
  fromLocation: { id: string; name: string } | null;
  toLocation: { id: string; name: string } | null;
  fromUser: { id: string; name: string } | null;
  toUser: { id: string; name: string } | null;
  qtyDelta: string | number | null;
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
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewBudget, setShowNewBudget] = useState(false);
  const [newLocation, setNewLocation] = useState("");
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [budgetCode, setBudgetCode] = useState("");
  const [purchasedAt, setPurchasedAt] = useState("");
  const [note, setNote] = useState("");
  const [locationId, setLocationId] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
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
      .catch((e: unknown) => setError(unknownErrorMessage(e, "物品情報の読み込みに失敗しました")))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoadingTimeline(true);
    fetch(apiUrl(`/assets/${id}/timeline`))
      .then(async (res) => {
        if (!res.ok) throw new Error(await apiErrorMessage(res, "履歴の取得に失敗しました"));
        return (await res.json()) as TimelineItem[];
      })
      .then((items) => setTimeline(items))
      .catch(() => setTimeline([]))
      .finally(() => setLoadingTimeline(false));
  }, [id]);

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
      if (!res.ok) throw new Error(await apiErrorMessage(res, "保管場所の追加に失敗しました"));
      const created = (await res.json()) as Location;
      const next = [...locations, created].sort((a, b) => a.name.localeCompare(b.name, "ja"));
      setLocations(next);
      setLocationId(created.id);
      setNewLocation("");
      setShowNewLocation(false);
    } catch (e: unknown) {
      setError(unknownErrorMessage(e, "保管場所の追加に失敗しました"));
    }
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
      if (!res.ok) throw new Error(await apiErrorMessage(res, "物品情報の更新に失敗しました"));
      setMessage("更新しました");
    } catch (err: unknown) {
      setError(unknownErrorMessage(err, "物品情報の更新に失敗しました"));
    } finally {
      setLoading(false);
    }
  }

  async function onDelete() {
    if (!id) return;
    const ok = window.confirm(`物品「${asset?.name ?? ""}」を削除しますか？この操作は元に戻せません。`);
    if (!ok) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/assets/${id}`), { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await apiErrorMessage(res, "物品の削除に失敗しました"));
      }
      navigate("/assets");
    } catch (err: unknown) {
      setError(unknownErrorMessage(err, "物品の削除に失敗しました"));
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
          <UiSelect
            value={category}
            onChange={setCategory}
            required
            options={
              categories.length === 0
                ? [{ value: "", label: "カテゴリを追加してください" }]
                : categories.map((c) => ({ value: c, label: c }))
            }
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
        <label className="field">
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
        <label className="field">
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
        <div className="field-full form-row">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            保存
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={onDelete}
            disabled={loading || asset?.status === "CHECKED_OUT"}
            title={asset?.status === "CHECKED_OUT" ? "貸出中は削除できません" : undefined}
          >
            削除
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
      <section className="timeline-panel">
        <h2 className="panel-title">履歴タイムライン</h2>
        {loadingTimeline ? (
          <p>履歴を読み込み中...</p>
        ) : timeline.length === 0 ? (
          <p>履歴はありません</p>
        ) : (
          <div className="timeline-list">
            {timeline.map((t) => (
              <article key={t.id} className="timeline-item">
                <p className="timeline-head">
                  <strong>{t.action}</strong> / {new Date(t.createdAt).toLocaleString("ja-JP")}
                </p>
                <p className="timeline-meta">
                  実行者: {t.actor?.name ?? "-"} / 場所: {t.fromLocation?.name ?? "-"} → {t.toLocation?.name ?? "-"}
                </p>
                {(t.fromUser || t.toUser) && (
                  <p className="timeline-meta">
                    ユーザ: {t.fromUser?.name ?? "-"} → {t.toUser?.name ?? "-"}
                  </p>
                )}
                {t.qtyDelta !== null && <p className="timeline-meta">数量変化: {String(t.qtyDelta)}</p>}
                {t.note && <p className="timeline-note">{t.note}</p>}
              </article>
            ))}
          </div>
        )}
      </section>
      {message && <p className="msg-ok">{message}</p>}
      {error && <p className="msg-err">{error}</p>}
    </section>
  );
}
