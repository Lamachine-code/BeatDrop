import { sql } from "drizzle-orm";
import {
  boolean, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, unique, uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  twitchId: text("twitch_id").notNull().unique(),
  login: text("login").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default("streamer"),
  overlayToken: text("overlay_token").notNull().unique(),
  streamDelayMs: integer("stream_delay_ms").notNull().default(6000),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

/** Twitch tokens encrypted at rest (AES-256-GCM, base64). */
export const twitchCredentials = pgTable("twitch_credentials", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  scopes: text("scopes").array().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const playlists = pgTable(
  "playlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull().default("other"),
    language: text("language").notNull().default("FR"),
    difficulty: smallint("difficulty").notNull().default(2),
    coverUrl: text("cover_url"),
    visibility: text("visibility").notNull().default("private"), // private | unlisted | public
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    playsCount: integer("plays_count").notNull().default(0),
    forkedFrom: uuid("forked_from"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("playlists_public_idx").on(t.visibility, t.category, t.language, t.difficulty)],
);

export const tracks = pgTable(
  "tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    playlistId: uuid("playlist_id").notNull().references(() => playlists.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    youtubeId: text("youtube_id").notNull(),
    startTime: integer("start_time").notNull().default(0),
    duration: integer("duration").notNull().default(30),
    displayTitle: text("display_title").notNull(),
    acceptedAnswers: jsonb("accepted_answers").$type<string[] | string[][]>().notNull(),
    matchMode: text("match_mode").notNull().default("any"),
    difficulty: smallint("difficulty"),
    hint: text("hint"),
    thumbnailUrl: text("thumbnail_url"),
    sourceTitle: text("source_title"),
    embeddable: boolean("embeddable").notNull().default(true),
  },
  (t) => [unique("tracks_playlist_position").on(t.playlistId, t.position)],
);

export const gameSessions = pgTable("game_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id").notNull().references(() => users.id),
  playlistId: uuid("playlist_id").references(() => playlists.id, { onDelete: "set null" }),
  settings: jsonb("settings").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const sessionScores = pgTable(
  "session_scores",
  {
    sessionId: uuid("session_id").notNull().references(() => gameSessions.id, { onDelete: "cascade" }),
    twitchUserId: text("twitch_user_id").notNull(),
    displayName: text("display_name").notNull(),
    points: integer("points").notNull().default(0),
    correctCount: integer("correct_count").notNull().default(0),
    bestStreak: integer("best_streak").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.twitchUserId] })],
);
