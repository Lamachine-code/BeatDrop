import { z } from "zod";

export const CATEGORIES = ["cartoon", "movie", "videogame", "anime", "series", "pop", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  cartoon: "Cartoons",
  movie: "Movies",
  videogame: "Video games",
  anime: "Anime",
  series: "TV series",
  pop: "Pop & hits",
  other: "Other",
};

const YT_ID = /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/;
export function extractYoutubeId(url: string): string | null {
  return url.match(YT_ID)?.[1] ?? null;
}

export const TrackImport = z.object({
  youtubeUrl: z.string().regex(YT_ID, "Invalid YouTube URL"),
  startTime: z.number().int().min(0).default(0),
  duration: z.number().int().min(5).max(120).default(30),
  acceptedAnswers: z.union([
    z.array(z.string().min(1)).min(1),
    z.array(z.array(z.string().min(1)).min(1)).min(1),
  ]),
  displayTitle: z.string().min(1).max(120),
  sourceTitle: z.string().max(120).optional(),
  difficulty: z.number().int().min(1).max(3).optional(),
  hint: z.string().max(200).optional(),
  thumbnailUrl: z.string().url().nullable().optional(),
  matchMode: z.enum(["any", "all"]).optional(),
});
export type TrackImport = z.infer<typeof TrackImport>;

export const PlaylistImport = z.object({
  schemaVersion: z.literal(1).default(1),
  title: z.string().min(3).max(80),
  description: z.string().max(500).optional(),
  category: z.enum(CATEGORIES),
  language: z.string().length(2).toUpperCase(),
  difficulty: z.number().int().min(1).max(3).default(2),
  tags: z.array(z.string().max(30)).max(10).default([]),
  coverUrl: z.string().url().nullable().optional(),
  visibility: z.enum(["private", "unlisted", "public"]).optional(),
  tracks: z.array(TrackImport).min(1).max(200),
});
export type PlaylistImport = z.infer<typeof PlaylistImport>;

export const SettingsSchema = z.object({
  basePoints: z.number().int().min(0).max(1000).default(100),
  speedBonus: z.boolean().default(true),
  firstBonus: z.number().int().min(0).max(500).default(50),
  streakBonus: z.boolean().default(true),
  everyoneCanWin: z.boolean().default(false),
  streamDelayMs: z.number().int().min(0).max(30000).default(6000),
  graceMs: z.number().int().min(0).max(5000).default(1500),
  transition: z.enum(["manual", "auto"]).default("manual"),
  autoDelaySec: z.number().int().min(3).max(60).default(8),
  revealSec: z.number().int().min(4).max(30).default(10),
  botAnnounce: z.boolean().default(true),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
