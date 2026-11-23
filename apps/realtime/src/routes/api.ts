import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CATEGORIES, PlaylistImport } from "@beatdrop/shared";
import { db, schema } from "../db";
import { env } from "../env";
import { formatZodIssues, isUuid, loadPlaylist, savePlaylist, toExport, type LoadedPlaylist } from "../playlists";
import { signToken } from "../session-token";
import { currentUser, type User } from "./auth";

const { users, playlists, tracks } = schema;

const overlayUrl = (u: User) => `${env.WEB_URL}/overlay/${u.overlayToken}`;

async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<User | null> {
  const u = await currentUser(req);
  if (!u) reply.code(401).send({ error: "Twitch login required" });
  return u;
}

const canView = (p: LoadedPlaylist, u: User | null) => p.visibility !== "private" || p.ownerId === u?.id;

const RandomBody = z.object({
  categories: z.array(z.enum(CATEGORIES)).min(1),
  languages: z.array(z.string().length(2)).default([]),
  count: z.number().int().min(3).max(100).default(20),
  minDifficulty: z.number().int().min(1).max(3).default(1),
  maxDifficulty: z.number().int().min(1).max(3).default(3),
  duration: z.number().int().min(5).max(120).default(30),
  progressive: z.boolean().default(false),
});

export async function apiRoutes(app: FastifyInstance, hooks: { kickOverlays(userId: string): void }) {
  app.get("/health", async () => ({ ok: true }));

  app.get("/api/me", async (req) => {
    const u = await currentUser(req);
    if (!u) return { user: null };
    return {
      user: { id: u.id, login: u.login, displayName: u.displayName, avatarUrl: u.avatarUrl, streamDelayMs: u.streamDelayMs },
      overlayUrl: overlayUrl(u),
      fakeChat: env.ALLOW_FAKE_CHAT,
    };
  });

  app.get("/api/socket-token", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    return { token: await signToken(u.id, "socket", "12h") };
  });

  app.post("/api/overlay-token/rotate", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const [n] = await db.update(users).set({ overlayToken: randomBytes(24).toString("base64url") }).where(eq(users.id, u.id)).returning();
    hooks.kickOverlays(u.id); // the old overlay URL stops working immediately
    return { overlayUrl: overlayUrl(n) };
  });

  // ───────── Catalogue ─────────
  const listSelect = {
    id: playlists.id,
    title: playlists.title,
    description: playlists.description,
    category: playlists.category,
    language: playlists.language,
    difficulty: playlists.difficulty,
    coverUrl: playlists.coverUrl,
    visibility: playlists.visibility,
    tags: playlists.tags,
    playsCount: playlists.playsCount,
    updatedAt: playlists.updatedAt,
    // Raw SQL manually qualified: Drizzle removes table prefixes in a single-table select.
    trackCount: sql<number>`(select count(*)::int from tracks tr where tr.playlist_id = playlists.id)`,
    ownerName: sql<string | null>`(select u.display_name from users u where u.id = playlists.owner_id)`,
  };

  app.get("/api/catalog", async () => {
    return db.select(listSelect).from(playlists).where(eq(playlists.visibility, "public")).orderBy(desc(playlists.playsCount), desc(playlists.updatedAt)).limit(200);
  });

  app.get("/api/playlists", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    return db.select(listSelect).from(playlists).where(eq(playlists.ownerId, u.id)).orderBy(desc(playlists.updatedAt));
  });

  app.get("/api/playlists/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) return reply.code(404).send({ error: "Introuvable" });
    const u = await currentUser(req);
    const p = await loadPlaylist(id);
    if (!p || !canView(p, u)) return reply.code(404).send({ error: "Introuvable" });
    const owner = p.ownerId === u?.id;
    return {
      ...p,
      isOwner: owner,
      // Answers and titles stay secret so they do not spoil the quiz.
      tracks: p.tracks.map((t) => (owner ? t : { id: t.id, position: t.position, duration: t.duration, difficulty: t.difficulty, embeddable: t.embeddable })),
    };
  });

  app.get("/api/playlists/:id/export", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const { id } = req.params as { id: string };
    const p = isUuid(id) ? await loadPlaylist(id) : null;
    if (!p || p.ownerId !== u.id) return reply.code(404).send({ error: "Introuvable" });
    return toExport(p);
  });

  // JSON creation/import (same endpoint, same Zod schema)
  app.post("/api/playlists", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const parsed = PlaylistImport.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ errors: formatZodIssues(parsed.error.issues) });
    const r = await savePlaylist(u.id, parsed.data);
    if (!r.ok) return reply.code(400).send({ errors: r.errors });
    return { id: r.id, warnings: r.warnings };
  });

  app.put("/api/playlists/:id", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const { id } = req.params as { id: string };
    const p = isUuid(id) ? await loadPlaylist(id) : null;
    if (!p || p.ownerId !== u.id) return reply.code(404).send({ error: "Introuvable" });
    const parsed = PlaylistImport.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ errors: formatZodIssues(parsed.error.issues) });
    const r = await savePlaylist(u.id, parsed.data, { id });
    if (!r.ok) return reply.code(400).send({ errors: r.errors });
    return { id: r.id, warnings: r.warnings };
  });

  app.delete("/api/playlists/:id", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const { id } = req.params as { id: string };
    if (!isUuid(id)) return reply.code(404).send({ error: "Introuvable" });
    await db.delete(playlists).where(and(eq(playlists.id, id), eq(playlists.ownerId, u.id)));
    return { ok: true };
  });

  app.post("/api/playlists/:id/fork", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const { id } = req.params as { id: string };
    const p = isUuid(id) ? await loadPlaylist(id) : null;
    if (!p || !canView(p, u)) return reply.code(404).send({ error: "Introuvable" });
    const data = toExport(p);
    const r = await savePlaylist(u.id, { ...PlaylistImport.parse({ ...data, title: `${p.title} (copie)`.slice(0, 80) }), visibility: "private" }, { forkedFrom: p.id, skipChecks: true });
    if (!r.ok) return reply.code(400).send({ errors: r.errors });
    return { id: r.id };
  });

  // ───────── Random game ─────────
  app.post("/api/random", async (req, reply) => {
    const u = await requireUser(req, reply);
    if (!u) return;
    const parsed = RandomBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ errors: formatZodIssues(parsed.error.issues) });
    const b = parsed.data;

    const rows = await db
      .select({ t: tracks, pDiff: playlists.difficulty })
      .from(tracks)
      .innerJoin(playlists, eq(tracks.playlistId, playlists.id))
      .where(
        and(
          eq(playlists.visibility, "public"),
          inArray(playlists.category, b.categories),
          b.languages.length ? inArray(playlists.language, b.languages.map((l) => l.toUpperCase())) : undefined,
          eq(tracks.embeddable, true),
          sql`coalesce(${tracks.difficulty}, ${playlists.difficulty}) between ${b.minDifficulty} and ${b.maxDifficulty}`,
        ),
      )
      .orderBy(sql`random()`)
      .limit(b.count * 4);

    const seen = new Set<string>();
    let picked = rows
      .filter(({ t }) => {
        const key = `${t.youtubeId}:${t.startTime}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, b.count);
    if (!picked.length) return reply.code(400).send({ errors: ["No tracks match these filters."] });
    if (b.progressive) picked = picked.sort((x, y) => (x.t.difficulty ?? x.pDiff) - (y.t.difficulty ?? y.pDiff));

    const id = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(playlists)
        .values({ ownerId: u.id, title: `Random game (${picked.length} tracks)`, category: "other", language: b.languages[0]?.toUpperCase() ?? "EN", visibility: "private", tags: ["random"] })
        .returning({ id: playlists.id });
      await tx.insert(tracks).values(
        picked.map(({ t }, i) => ({
          playlistId: p.id,
          position: i,
          youtubeId: t.youtubeId,
          startTime: t.startTime,
          duration: b.duration,
          displayTitle: t.displayTitle,
          acceptedAnswers: t.acceptedAnswers,
          matchMode: t.matchMode,
          difficulty: t.difficulty,
          hint: t.hint,
          thumbnailUrl: t.thumbnailUrl,
          sourceTitle: t.sourceTitle,
        })),
      );
      return p.id;
    });
    return { id, count: picked.length };
  });
}
