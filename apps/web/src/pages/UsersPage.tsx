import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { apiUrl } from "../lib/api";

type User = {
  id: string;
  name: string;
  role: "ADMIN" | "MEMBER";
};

type BorrowedAsset = {
  id: string;
  serial: string;
  name: string;
  category: string;
  status: string;
  lastActivityAt: string;
  currentLocation?: { id: string; name: string } | null;
};

type BorrowedResponse = {
  user: User;
  count: number;
  assets: BorrowedAsset[];
};

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [borrowed, setBorrowed] = useState<BorrowedResponse | null>(null);
  const [loadingBorrowed, setLoadingBorrowed] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetch(apiUrl("/users"));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as User[];
      setUsers(json);
      if (!selectedUserId && json.length > 0) setSelectedUserId(json[0].id);
    } catch (e: any) {
      setError(e?.message ?? "ユーザ一覧の取得に失敗しました");
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function loadBorrowed(userId: string) {
    if (!userId) {
      setBorrowed(null);
      return;
    }
    setLoadingBorrowed(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/users/${userId}/assets`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as BorrowedResponse;
      setBorrowed(json);
    } catch (e: any) {
      setError(e?.message ?? "貸出一覧の取得に失敗しました");
      setBorrowed(null);
    } finally {
      setLoadingBorrowed(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (selectedUserId) loadBorrowed(selectedUserId);
  }, [selectedUserId]);

  async function onCreateUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiUrl("/users"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role }),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error ?? `HTTP ${res.status}`);
      }
      const created = (await res.json()) as User;
      setMessage(`ユーザを登録しました: ${created.name}`);
      setName("");
      setRole("MEMBER");
      await loadUsers();
      setSelectedUserId(created.id);
    } catch (e: any) {
      setError(e?.message ?? "ユーザ登録に失敗しました");
    }
  }

  async function onDeleteUser(user: User) {
    const ok = window.confirm(`ユーザ「${user.name}」を削除しますか？`);
    if (!ok) return;
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/users/${user.id}`), { method: "DELETE" });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error ?? `HTTP ${res.status}`);
      }
      setMessage(`ユーザを削除しました: ${user.name}`);
      if (selectedUserId === user.id) {
        setSelectedUserId("");
        setBorrowed(null);
      }
      await loadUsers();
    } catch (e: any) {
      setError(e?.message ?? "ユーザ削除に失敗しました");
    }
  }

  return (
    <section className="panel">
      <h1 className="panel-title">ユーザ管理</h1>
      <p className="panel-subtitle">ユーザ登録と、ユーザごとの貸出中物品を確認できます。</p>

      <div className="user-grid">
        <div className="panel user-panel">
          <h2 className="panel-title">ユーザ登録</h2>
          <form className="form-grid" onSubmit={onCreateUser}>
            <label className="field">
              <span>名前</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>権限</span>
              <select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "MEMBER")}>
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
            <div className="field field-full">
              <button className="btn btn-primary" type="submit">
                登録
              </button>
            </div>
          </form>

          <div className="form-row" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" type="button" onClick={loadUsers} disabled={loadingUsers}>
              ユーザ一覧を更新
            </button>
          </div>
          {loadingUsers && <p>ユーザ一覧を取得中...</p>}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={3}>ユーザがありません</td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setSelectedUserId(u.id)}
                          style={{ padding: "6px 10px" }}
                        >
                          {u.name}
                        </button>
                      </td>
                      <td>{u.role}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: "6px 10px" }}
                          onClick={() => onDeleteUser(u)}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel user-panel">
          <h2 className="panel-title">貸出中物品（ユーザ別）</h2>
          {!selectedUserId && <p>ユーザを選択してください。</p>}
          {selectedUserId && loadingBorrowed && <p>取得中...</p>}
          {selectedUserId && borrowed && (
            <>
              <p className="panel-subtitle" style={{ marginBottom: 8 }}>
                {borrowed.user.name} / 貸出中 {borrowed.count}件
              </p>
              <div className="table-wrap">
                <table className="data-table table-wide-user">
                  <thead>
                    <tr>
                      <th>Serial</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Location</th>
                      <th>Status</th>
                      <th>Last Activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {borrowed.assets.length === 0 ? (
                      <tr>
                        <td colSpan={6}>現在貸出中の物品はありません</td>
                      </tr>
                    ) : (
                      borrowed.assets.map((a) => (
                        <tr key={a.id}>
                          <td className="mono">{a.serial}</td>
                          <td>{a.name}</td>
                          <td>{a.category}</td>
                          <td>{a.currentLocation?.name ?? "-"}</td>
                          <td>{a.status}</td>
                          <td>{new Date(a.lastActivityAt).toLocaleString("ja-JP")}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {message && <p className="msg-ok">{message}</p>}
      {error && <p className="msg-err">{error}</p>}
    </section>
  );
}
