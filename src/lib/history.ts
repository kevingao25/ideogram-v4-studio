import type { V4Prompt } from "@/lib/v4-prompt";

export type HistoryEndpoint = "generate" | "remix" | "magic-prompt" | "describe";

export type HistoryEntry = {
  id: string;
  endpoint: HistoryEndpoint;
  createdAt: string;
  prompt: string;
  jsonPrompt: V4Prompt | null;
  seed: number | null;
  resolution: string | null;
};

export function sanitizeHistoryEntry(input: Record<string, unknown>): HistoryEntry {
  return {
    id: String(input.id),
    endpoint: input.endpoint as HistoryEndpoint,
    createdAt: String(input.createdAt),
    prompt: typeof input.prompt === "string" ? input.prompt : "",
    jsonPrompt: (input.jsonPrompt as V4Prompt | null) ?? null,
    seed: typeof input.seed === "number" ? input.seed : null,
    resolution: typeof input.resolution === "string" ? input.resolution : null,
  };
}

export function loadHistory(storage: Pick<Storage, "getItem">): HistoryEntry[] {
  const raw = storage.getItem("ideogram-v4-studio-history");
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(sanitizeHistoryEntry).slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function saveHistory(
  storage: Pick<Storage, "setItem">,
  entries: HistoryEntry[],
): void {
  storage.setItem("ideogram-v4-studio-history", JSON.stringify(entries.slice(0, 20)));
}
