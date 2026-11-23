import { eq, sql } from "drizzle-orm";
import type { Server } from "socket.io";
import { DEFAULT_SETTINGS, SettingsSchema, type Presence, type Settings } from "@beatdrop/shared";
import { db, schema } from "./db";
import { env } from "./env";
import { GameSession, type ChatUser, type PlaylistData, type Target } from "./game/engine";
import { loadPlaylist, markUnembeddable } from "./playlists";
import { openChat, type ChatHandle } from "./twitch";

export interface HubUser {
  id: string;
  twitchId: string;
  login: string;
  streamDelayMs: number;
}

/** Everything related to one channel: game session, chat connection, and calibration. */
export class ChannelHub {
  session: GameSession | null = null;
  hostSockets = new Set<string>();
  overlaySockets = new Set<string>();
  private chat: ChatHandle | null = null;
  private chatState: Presence["chat"] = "off";
  private chatError: string | undefined;
  private calib: { samples: number[]; flashTs: number; timeout?: NodeJS.Timeout } | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(public user: HubUser, private io: Server) {}

  room(role: "host" | "overlay") {
    return `channel:${this.user.id}:${role}`;
  }
  emit(target: Target, event: string, payload: unknown) {
    if (target === "host" || target === "all") this.io.to(this.room("host")).emit(event, payload);
    if (target === "overlay" || target === "all") this.io.to(this.room("overlay")).emit(event, payload);
  }
  toast(level: "info" | "warn" | "error", text: string) {
    this.emit("host", "host:toast", { level, text });
  }

  presence(): Presence {
    return {
      overlayCount: this.overlaySockets.size,
      chat: this.chatState,
      chatError: this.chatError,
      fakeChat: env.ALLOW_FAKE_CHAT,
      streamDelayMs: this.user.streamDelayMs,
    };
  }
  emitPresence() {
    this.emit("host", "presence", this.presence());
  }

  // ───────── Chat Twitch ─────────
  async ensureChat() {
    if (this.chat || this.chatState === "connecting") return;
    this.chatState = "connecting";
    this.chatError = undefined;
    this.emitPresence();
    try {
      this.chat = await openChat({
        userId: this.user.id,
        twitchId: this.user.twitchId,
        onMessage: (u, text) => this.onChat(u, text),
        onStatus: (state, error) => {
          this.chatState = state;
          this.chatError = error;
          this.emitPresence();
        },
      });
    } catch (e) {
      this.chat = null;
      this.chatState = "error";
      this.chatError = (e as Error).message;
      this.emitPresence();
    }
  }
  stopChat() {
    this.chat?.stop();
    this.chat = null;
    this.chatState = "off";
    this.emitPresence();
  }
  /** Disconnect chat if nobody is watching and no game is active. */
  scheduleIdleStop() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      const active = this.session && this.session.state !== "ENDED";
      if (!active && this.hostSockets.size === 0) this.stopChat();
    }, 5 * 60_000);
  }

  onChat(u: ChatUser, text: string) {
    if (this.calib && u.isBroadcaster && text.trim().toLowerCase() === "top") return this.onCalibrationTop();
    this.session?.handleChat(u, text);
  }
  private sendChat = (message: string) => {
    this.chat?.send(message).catch((e) => this.toast("warn", `Bot message not sent: ${(e as Error).message}`));
  };

  // ───────── Session ─────────
  async createSession(playlistId: string, partial: Partial<Settings> = {}) {
    const p = await loadPlaylist(playlistId);
    if (!p || (p.visibility === "private" && p.ownerId !== this.user.id)) throw new Error("Blind test introuvable");
    const playable = p.tracks.filter((t) => t.embeddable);
    if (!playable.length) throw new Error("This quiz contains no playable tracks");

    this.session?.dispose();
    const data: PlaylistData = {
      id: p.id,
      title: p.title,
      difficulty: p.difficulty,
      tracks: playable.map((t) => ({
        youtubeId: t.youtubeId,
        startTime: t.startTime,
        duration: t.duration,
        displayTitle: t.displayTitle,
        acceptedAnswers: t.acceptedAnswers,
        matchMode: t.matchMode === "all" ? "all" : "any",
        difficulty: t.difficulty,
        hint: t.hint,
        thumbnailUrl: t.thumbnailUrl,
        sourceTitle: t.sourceTitle,
      })),
    };
    const settings = SettingsSchema.parse({ ...DEFAULT_SETTINGS, streamDelayMs: this.user.streamDelayMs, ...partial });
    const [row] = await db.insert(schema.gameSessions).values({ hostId: this.user.id, playlistId: p.id, settings }).returning({ id: schema.gameSessions.id });
    await db.update(schema.playlists).set({ playsCount: sql`${schema.playlists.playsCount} + 1` }).where(eq(schema.playlists.id, p.id));

    this.session = new GameSession(row.id, data, settings, {
      emit: (t, e, pl) => this.emit(t, e, pl),
      sendChat: this.sendChat,
      onEnd: (scores) => void this.persistEnd(row.id, scores),
    });
    void this.ensureChat();
    this.session.sync();
  }

  private async persistEnd(sessionId: string, scores: { userId: string; name: string; points: number; correct: number; bestStreak: number }[]) {
    try {
      await db.update(schema.gameSessions).set({ endedAt: new Date() }).where(eq(schema.gameSessions.id, sessionId));
      if (scores.length)
        await db.insert(schema.sessionScores).values(
          scores.map((s) => ({ sessionId, twitchUserId: s.userId, displayName: s.name, points: s.points, correctCount: s.correct, bestStreak: s.bestStreak })),
        );
    } catch (e) {
      console.error("persistEnd", e);
    }
  }

  closeSession() {
    this.session?.dispose();
    this.session = null;
    this.emit("all", "state:sync", null);
    this.scheduleIdleStop();
  }

  async onOverlayError(videoId: string) {
    this.session?.skipBroken(videoId);
    await markUnembeddable(videoId).catch(() => {});
  }

  // ───────── Stream delay calibration ─────────
  startCalibration() {
    if (this.calib?.timeout) clearTimeout(this.calib.timeout);
    this.calib = { samples: [], flashTs: 0 };
    this.nextFlash();
  }
  private nextFlash() {
    if (!this.calib) return;
    const c = this.calib;
    c.flashTs = Date.now() + 1500;
    this.emit("overlay", "calib:flash", { atServerTs: c.flashTs });
    this.emit("host", "calib:status", { step: c.samples.length + 1, of: 3, waiting: true });
    c.timeout = setTimeout(() => {
      this.calib = null;
      this.emit("host", "calib:fail", { reason: 'No "TOP" received in time. Check that the overlay is in OBS and your stream is live.' });
    }, 25_000);
  }
  private onCalibrationTop() {
    const c = this.calib;
    if (!c || Date.now() < c.flashTs) return;
    if (c.timeout) clearTimeout(c.timeout);
    c.samples.push(Date.now() - c.flashTs - 300); // ~300 ms human reaction time
    if (c.samples.length < 3) {
      this.emit("host", "calib:status", { step: c.samples.length, of: 3, waiting: false, last: c.samples.at(-1) });
      setTimeout(() => this.nextFlash(), 3000);
      return;
    }
    const sorted = [...c.samples].sort((a, b) => a - b);
    const delayMs = Math.max(0, Math.min(30000, Math.round(sorted[1] / 100) * 100));
    this.calib = null;
    void this.saveStreamDelay(delayMs);
    this.emit("host", "calib:result", { delayMs, samples: c.samples });
  }
  async saveStreamDelay(delayMs: number) {
    this.user.streamDelayMs = delayMs;
    await db.update(schema.users).set({ streamDelayMs: delayMs }).where(eq(schema.users.id, this.user.id));
    this.session?.updateSettings({ streamDelayMs: delayMs });
    this.emitPresence();
  }
}

export class Hubs {
  private map = new Map<string, ChannelHub>();
  constructor(private io: Server) {}
  async get(userId: string): Promise<ChannelHub | null> {
    let h = this.map.get(userId);
    if (h) return h;
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!u) return null;
    h = new ChannelHub({ id: u.id, twitchId: u.twitchId, login: u.login, streamDelayMs: u.streamDelayMs }, this.io);
    this.map.set(userId, h);
    return h;
  }
  /** Call when a streamer rotates an overlay token: disconnect the old overlay. */
  get all() {
    return this.map.values();
  }
}
