import { and, asc, eq } from "drizzle-orm";
import { extractYoutubeId, isGrouped, PlaylistImport } from "@beatdrop/shared";
import { db, schema } from "./db";
import { checkVideos } from "./youtube";

const { playlists, tracks } = schema;

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export function formatZodIssues(issues: { path: (string | number)[]; message: string }[]): string[] {
  return issues.map((i) => {
    if (i.path[0] === "tracks" && typeof i.path[1] === "number") {
      const rest = i.path.slice(2).join(".");
      return `Piste ${i.path[1] + 1}${rest ? ` (${rest})` : ""} : ${i.message}`;
    }
    return `${i.path.join(".") || "playlist"}: ${i.message}`;
  });
}

export async function loadPlaylist(id: string) {
  const [p] = await db.select().from(playlists).where(eq(playlists.id, id));
  if (!p) return null;
  const t = await db.select().from(tracks).where(eq(tracks.playlistId, id)).orderBy(asc(tracks.position));
  return { ...p, tracks: t };
}
export type LoadedPlaylist = NonNullable<Awaited<ReturnType<typeof loadPlaylist>>>;

/** Export au format d'import v1. */
export function toExport(p: LoadedPlaylist): PlaylistImport {
  return {
    schemaVersion: 1,
    title: p.title,
    description: p.description ?? undefined,
    category: p.category as PlaylistImport["category"],
    language: p.language,
    difficulty: p.difficulty,
    tags: p.tags,
    coverUrl: p.coverUrl,
    tracks: p.tracks.map((t) => ({
      youtubeUrl: `https://www.youtube.com/watch?v=${t.youtubeId}`,
      startTime: t.startTime,
      duration: t.duration,
      acceptedAnswers: t.acceptedAnswers,
      matchMode: t.matchMode as "any" | "all",
      displayTitle: t.displayTitle,
      sourceTitle: t.sourceTitle ?? undefined,
      difficulty: t.difficulty ?? undefined,
      hint: t.hint ?? undefined,
      thumbnailUrl: t.thumbnailUrl,
    })),
  };
}

type SaveResult = { ok: true; id: string; warnings: string[] } | { ok: false; errors: string[] };

/** Validates a playlist (using YouTube Data API when available), then creates or replaces it. */
export async function savePlaylist(
  ownerId: string,
  input: PlaylistImport,
  opts: { id?: string; forkedFrom?: string; skipChecks?: boolean } = {},
): Promise<SaveResult> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const ids = input.tracks.map((t) => extractYoutubeId(t.youtubeUrl)!);

  let checks = null;
  if (!opts.skipChecks) {
    try {
      checks = await checkVideos(ids);
    } catch (e) {
      warnings.push(`YouTube check skipped: ${(e as Error).message}`);
    }
  }

  const rows = input.tracks.map((t, i) => {
    const youtubeId = ids[i];
    let embeddable = true;
    if (checks) {
      const c = checks.get(youtubeId);
      if (!c) errors.push(`Track ${i + 1}: video unavailable or private (${youtubeId})`);
      else {
        if (!c.embeddable) {
          embeddable = false;
          warnings.push(`Track ${i + 1}: video is not embeddable and will be skipped live`);
        }
        if (c.durationSec !== null && c.durationSec < t.startTime + t.duration)
          warnings.push(`Track ${i + 1}: the video (${c.durationSec}s) is shorter than the start plus duration`);
      }
    }
    return {
      position: i,
      youtubeId,
      startTime: t.startTime,
      duration: t.duration,
      displayTitle: t.displayTitle,
      acceptedAnswers: t.acceptedAnswers,
      matchMode: t.matchMode ?? (isGrouped(t.acceptedAnswers) ? "all" : "any"),
      difficulty: t.difficulty ?? null,
      hint: t.hint ?? null,
      thumbnailUrl: t.thumbnailUrl ?? null,
      sourceTitle: t.sourceTitle ?? null,
      embeddable,
    };
  });
  if (errors.length) return { ok: false, errors };

  const values = {
    title: input.title,
    description: input.description ?? null,
    category: input.category,
    language: input.language,
    difficulty: input.difficulty,
    coverUrl: input.coverUrl ?? null,
    tags: input.tags,
    ...(input.visibility ? { visibility: input.visibility } : {}),
  };

  const id = await db.transaction(async (tx) => {
    let pid = opts.id;
    if (pid) {
      await tx.update(playlists).set({ ...values, updatedAt: new Date() }).where(eq(playlists.id, pid));
      await tx.delete(tracks).where(eq(tracks.playlistId, pid));
    } else {
      const [r] = await tx
        .insert(playlists)
        .values({ ownerId, ...values, forkedFrom: opts.forkedFrom })
        .returning({ id: playlists.id });
      pid = r.id;
    }
    await tx.insert(tracks).values(rows.map((r) => ({ ...r, playlistId: pid! })));
    return pid!;
  });
  return { ok: true, id, warnings };
}

export async function markUnembeddable(youtubeId: string) {
  await db.update(tracks).set({ embeddable: false }).where(and(eq(tracks.youtubeId, youtubeId)));
}
