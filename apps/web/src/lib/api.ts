function normalizeBasePath(value?: string) {
  if (!value || value.trim() === "" || value === "/") return "/";
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}

const appBase = normalizeBasePath((import.meta as any).env?.BASE_URL ?? "/");

// APIのベースURL
// - 指定がある場合: VITE_API_BASE を優先
// - 指定なし: appBase + /api（例: /xxxx/api, /api）
const configuredApiBase = (import.meta as any).env?.VITE_API_BASE;
export const API_BASE = configuredApiBase
  ? String(configuredApiBase).replace(/\/$/, "")
  : `${appBase === "/" ? "" : appBase}/api`;

// エンドポイントを組み立てるヘルパー
export function apiUrl(path: string) {
  // 末尾/先頭のスラッシュをいい感じに結合
  return `${String(API_BASE).replace(/\/$/, "")}${path}`;
}
