import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiUrl } from "../lib/api";

type Stats = {
  checkedOutCount: number;
  staleDays: number;
  staleCount: number;
  staleAssetCount: number;
  staleConsumableCount: number;
};

type AssetCandidate = {
  id: string;
  serial: string;
  name: string;
  status: string;
};

const staleDays = 180;

export function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<AssetCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const navigate = useNavigate();

  const statsUrl = useMemo(() => apiUrl(`/stats?staleDays=${staleDays}`), []);

  useEffect(() => {
    setStatsLoading(true);
    fetch(statsUrl)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [statsUrl]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setCandidates([]);
      return;
    }

    const timer = setTimeout(async () => {
      setCandidateLoading(true);
      try {
        const res = await fetch(apiUrl(`/assets?query=${encodeURIComponent(q)}&take=8`));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AssetCandidate[];
        setCandidates(json);
      } catch {
        setCandidates([]);
      } finally {
        setCandidateLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  function onSearch() {
    const term = query.trim();
    if (!term) return;
    setCandidates([]);
    navigate(`/assets/search?query=${encodeURIComponent(term)}`);
  }

  return (
    <section className="home">
      <div className="hero">
        <p className="kicker">LAB MANAGEMENT</p>
        <h1 className="hero-title">池永・野林研究室 物品管理</h1>
        <p className="hero-subtitle">
          備品検索、貸出中確認、長期未更新確認、日常運用の導線をこのトップページに集約しています。
        </p>
      </div>

      <div className="panel">
        <h2 className="panel-title">運用アクション</h2>
        <div className="action-grid">
          <Link to="/assets" className="action-link">
            物品一覧
          </Link>
          <Link to="/assets/new" className="action-link">
            新規登録
          </Link>
          <Link to="/assets/checkout" className="action-link">
            貸出
          </Link>
          <Link to="/assets/checkin" className="action-link">
            返却
          </Link>
          <Link to="/consumables" className="action-link">
            消耗品管理
          </Link>
        </div>
      </div>

      <div className="stat-grid">
        <article className="stat-card">
          <p className="stat-label">貸出中</p>
          <p className="stat-value">{statsLoading ? "..." : stats ? stats.checkedOutCount : "-"}</p>
          <Link className="btn btn-secondary" to="/assets/search?status=CHECKED_OUT">
            一覧を見る
          </Link>
        </article>

        <article className="stat-card">
          <p className="stat-label">{staleDays}日以上 長期未更新</p>
          <p className="stat-value">{statsLoading ? "..." : stats ? stats.staleCount : "-"}</p>
          <p className="stat-meta">
            備品 {stats?.staleAssetCount ?? "-"} / 消耗品 {stats?.staleConsumableCount ?? "-"}
          </p>
          <Link to="/stale" className="link-inline">
            長期未更新一覧へ
          </Link>
        </article>
      </div>

      <div className="panel">
        <h2 className="panel-title">検索</h2>
        <div className="search-row">
          <div className="autocomplete-wrap">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="シリアル or 名前で検索"
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
            {candidateLoading && <div className="autocomplete-hint">候補を検索中...</div>}
            {!candidateLoading && candidates.length > 0 && (
              <div className="autocomplete-list">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="autocomplete-item"
                    onClick={() => {
                      setQuery(c.serial);
                      setCandidates([]);
                      navigate(`/assets/search?query=${encodeURIComponent(c.serial)}`);
                    }}
                  >
                    <span className="mono">{c.serial}</span>
                    <span>{c.name}</span>
                    <span>{c.status}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={onSearch}>
            結果ページへ
          </button>
        </div>
      </div>

    </section>
  );
}
