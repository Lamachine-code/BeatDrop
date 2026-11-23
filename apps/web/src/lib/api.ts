import { useQuery } from "@tanstack/react-query";

export const API = process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(message: string, public errors: string[] = [], public status = 0) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  const res = await fetch(API + path, {
    method: init.method ?? "GET",
    credentials: "include",
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? data?.errors?.[0] ?? `Erreur ${res.status}`, data?.errors ?? [], res.status);
  return data as T;
}

export interface Me {
  user: { id: string; login: string; displayName: string; avatarUrl: string | null; streamDelayMs: number } | null;
  overlayUrl?: string;
  fakeChat?: boolean;
}
export interface PlaylistSummary {
  id: string;
  title: string;
  description: string | null;
  category: string;
  language: string;
  difficulty: number;
  coverUrl: string | null;
  visibility: string;
  tags: string[];
  playsCount: number;
  trackCount: number;
  ownerName: string | null;
}
export interface TrackView {
  id: string;
  position: number;
  duration: number;
  difficulty: number | null;
  embeddable: boolean;
  displayTitle?: string;
  youtubeId?: string;
  startTime?: number;
  acceptedAnswers?: string[] | string[][];
  matchMode?: string;
  hint?: string | null;
  sourceTitle?: string | null;
}
export interface PlaylistDetail extends Omit<PlaylistSummary, "trackCount" | "ownerName"> {
  isOwner: boolean;
  tracks: TrackView[];
}

export const useMe = () => useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/me") });
export const loginUrl = `${API}/auth/twitch`;
