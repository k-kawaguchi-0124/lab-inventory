export async function apiErrorMessage(res: Response, context: string) {
  let detail = "";
  try {
    const json = (await res.json()) as { error?: string };
    detail = json?.error?.trim() ?? "";
  } catch {
    // ignore
  }
  if (!detail) detail = `HTTP ${res.status}`;
  return `${context}: ${detail}`;
}

export function unknownErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}
