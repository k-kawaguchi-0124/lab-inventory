// APIのベースURL
// - dev: Vite proxy を使うので空 (=同一オリジンで /api を叩く)
// - preview/本番: VITE_API_BASE を設定して直接APIへ
export const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

// エンドポイントを組み立てるヘルパー
export function apiUrl(path: string) {
  // API_BASEが空なら /api を使う（vite proxy用）
  if (!API_BASE) return `/api${path}`;
  // 末尾/先頭のスラッシュをいい感じに結合
  return `${String(API_BASE).replace(/\/$/, "")}${path}`;
}
