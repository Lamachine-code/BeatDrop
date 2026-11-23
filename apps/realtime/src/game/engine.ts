import {
  computeScore, difficultyMultiplier, isCorrect,
  type Accepted, type LeaderboardEntry, type Phase, type RevealInfo, type Settings, type Snapshot, type Winner,
} from "@beatdrop/shared";

export interface TrackData {
  youtubeId: string;
  startTime: number;
  duration: number;
  displayTitle: string;
  acceptedAnswers: Accepted;
  matchMode: "any" | "all";
  difficulty: number | null;
  hint: string | null;
  thumbnailUrl: string | null;
  sourceTitle: string | null;
}
export interface PlaylistData {
  id: string;
  title: string;
  difficulty: number;
  tracks: TrackData[];
}
export interface ChatUser {
  id: string;
  name: string;
  isMod: boolean;
  isBroadcaster: boolean;
}
export interface ScoreRow {
  userId: string;
  name: string;
  points: number;
  correct: number;
  bestStreak: number;
}
export type Target = "host" | "overlay" | "all";
export interface EngineHooks {
  emit(target: Target, event: string, payload: unknown): void;
  sendChat(message: string): void;
  onEnd(scores: ScoreRow[]): void;
}

interface UserScore extends ScoreRow {
  streak: number;
  lastCorrectRound: number;
}

const COUNTDOWN_MS = 3000;
const FEED_MAX = 30;

/**
 * State machine for a game:
 * LOBBY → COUNTDOWN → PLAYING → GRACE → REVEAL → INTERMISSION → (COUNTDOWN…) → ENDED
 * Server clock only: the client never decides timing.
 */
export class GameSession {
  state: Phase = "LOBBY";
  index = -1;
  private scores = new Map<string, UserScore>();
  private prevRanks = new Map<string, number>();
  private roundWinners: Winner[] = [];
  private roundChatters = new Set<string>();
  private answered = new Set<string>();
  private lastMsgAt = new Map<string, number>();
  private feed: Winner[] = [];
  private t0 = 0;
  private playEnd = 0;
  private graceEnd = 0;
  private hintShown = false;
  private reveal: RevealInfo | null = null;
  private nextAt: number | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    readonly id: string,
    readonly playlist: PlaylistData,
    public settings: Settings,
    private hooks: EngineHooks,
  ) {}

  get track(): TrackData | undefined {
    return this.playlist.tracks[this.index];
  }
  get total() {
    return this.playlist.tracks.length;
  }
  get inRound() {
    return this.state === "COUNTDOWN" || this.state === "PLAYING" || this.state === "GRACE";
  }

  // ───────── Timers ─────────
  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private at(ts: number, fn: () => void) {
    this.clearTimer();
    this.timer = setTimeout(fn, Math.max(0, ts - Date.now()));
  }
  dispose() {
    this.clearTimer();
  }

  // ───────── Commandes host ─────────
  /** Next button: starts the next round or ends the current round (immediate reveal). */
  next() {
    if (this.state === "ENDED") return;
    if (this.inRound) this.doReveal();
    else this.beginRound();
  }

  stop() {
    this.end();
  }

  showHint() {
    const t = this.track;
    if ((this.state !== "PLAYING" && this.state !== "GRACE") || !t?.hint || this.hintShown) return false;
    this.hintShown = true;
    this.sync();
    return true;
  }

  extend(ms = 10_000) {
    if (this.state !== "INTERMISSION" || this.nextAt === null) return;
    this.nextAt += ms;
    this.at(this.nextAt, () => this.beginRound());
    this.sync();
  }

  /** Suspends automatic start (the next Next action resumes it). */
  pause() {
    if (this.state !== "INTERMISSION") return;
    this.clearTimer();
    this.nextAt = null;
    this.sync();
  }

  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    if (this.state === "INTERMISSION") {
      if (this.settings.transition === "auto" && this.nextAt === null && patch.transition === "auto") {
        this.nextAt = Date.now() + this.settings.autoDelaySec * 1000;
        this.at(this.nextAt, () => this.beginRound());
      } else if (this.settings.transition === "manual") {
        this.clearTimer();
        this.nextAt = null;
      }
    }
    this.sync();
  }

  /** Video cannot be played in the overlay: skip directly to the next track. */
  skipBroken(videoId: string) {
    if (this.inRound && this.track?.youtubeId === videoId) {
      this.hooks.emit("host", "host:toast", { level: "warn", text: `Video could not be played (${this.track.displayTitle}), track skipped.` });
      this.beginRound();
    }
  }

  // ───────── Cycle d'une manche ─────────
  private rankedScores(): UserScore[] {
    return [...this.scores.values()].sort((a, b) => b.points - a.points || b.correct - a.correct || a.name.localeCompare(b.name));
  }

  private beginRound() {
    this.clearTimer();
    this.index += 1;
    if (this.index >= this.total) return this.end();

    this.prevRanks = new Map(this.rankedScores().map((s, i) => [s.userId, i + 1]));
    this.roundWinners = [];
    this.roundChatters.clear();
    this.answered.clear();
    this.hintShown = false;
    this.reveal = null;
    this.nextAt = null;

    const t = this.track!;
    const now = Date.now();
    this.t0 = now + COUNTDOWN_MS;
    this.playEnd = this.t0 + t.duration * 1000 + this.settings.streamDelayMs;
    this.graceEnd = this.playEnd + this.settings.graceMs;

    this.state = "COUNTDOWN";
    this.sync();
    this.at(this.t0, () => {
      this.state = "PLAYING";
      this.sync();
      this.at(this.playEnd, () => {
        this.state = "GRACE";
        this.sync();
        this.at(this.graceEnd, () => this.doReveal());
      });
    });
  }

  private doReveal() {
    this.clearTimer();
    const t = this.track!;
    this.state = "REVEAL";
    this.reveal = {
      displayTitle: t.displayTitle,
      sourceTitle: t.sourceTitle,
      thumbnailUrl: t.thumbnailUrl ?? `https://i.ytimg.com/vi/${t.youtubeId}/hqdefault.jpg`,
      winners: [...this.roundWinners],
    };
    this.hooks.emit("all", "round:reveal", this.reveal);

    if (this.settings.botAnnounce) {
      const names = this.roundWinners.slice(0, 3).map((w) => `@${w.name}`).join(", ");
      this.hooks.sendChat(
        this.roundWinners.length
          ? `✅ It was "${t.displayTitle}"! Great job ${names} 🎉`
          : `❌ No one found it… It was "${t.displayTitle}"`,
      );
    }
    this.sync();
    this.at(Date.now() + this.settings.revealSec * 1000, () => this.afterReveal());
  }

  private afterReveal() {
    if (this.index >= this.total - 1) return this.end();
    this.state = "INTERMISSION";
    if (this.settings.transition === "auto") {
      this.nextAt = Date.now() + this.settings.autoDelaySec * 1000;
      this.at(this.nextAt, () => this.beginRound());
    } else {
      this.nextAt = null;
      this.clearTimer();
    }
    this.sync();
  }

  private end() {
    if (this.state === "ENDED") return;
    this.clearTimer();
    this.nextAt = null;
    this.state = "ENDED";
    this.hooks.onEnd(this.rankedScores().map(({ userId, name, points, correct, bestStreak }) => ({ userId, name, points, correct, bestStreak })));
    this.sync();
  }

  // ───────── Chat ─────────
  handleChat(u: ChatUser, rawText: string) {
    const text = rawText.trim();
    if (!text) return;
    if (text.startsWith("!")) return this.handleCommand(u, text.toLowerCase());
    if (this.state !== "PLAYING" && this.state !== "GRACE") return;

    this.roundChatters.add(u.id);
    const now = Date.now();
    const last = this.lastMsgAt.get(u.id) ?? 0;
    if (now - last < 1000) return; // one message evaluated per second per viewer
    this.lastMsgAt.set(u.id, now);
    if (this.answered.has(u.id)) return;

    const t = this.track!;
    if (isCorrect(text, t.acceptedAnswers, t.matchMode)) this.award(u, now);
  }

  private handleCommand(u: ChatUser, cmd: string) {
    const [name] = cmd.split(/\s+/);
    if (name === "!score") {
      const s = this.scores.get(u.id);
      this.hooks.sendChat(s ? `@${u.name}: ${s.points} pts (${s.correct} correct answer(s))` : `@${u.name}: no points yet, your turn to play!`);
    } else if (name === "!top") {
      const top = this.rankedScores().slice(0, 5);
      this.hooks.sendChat(top.length ? "🏆 " + top.map((s, i) => `${i + 1}. ${s.name} (${s.points})`).join(" · ") : "No points yet.");
    } else if (name === "!skip" && (u.isMod || u.isBroadcaster) && this.inRound) {
      this.next();
    } else if (name === "!hint" && this.showHint()) {
      /* l'indice s'affiche sur l'overlay */
    }
  }

  private award(u: ChatUser, now: number) {
    const t = this.track!;
    const inGrace = this.state === "GRACE";
    const elapsedMs = Math.max(0, now - (this.t0 + this.settings.streamDelayMs));
    const rank = this.roundWinners.length + 1;

    let s = this.scores.get(u.id);
    if (!s) {
      s = { userId: u.id, name: u.name, points: 0, correct: 0, bestStreak: 0, streak: 0, lastCorrectRound: -10 };
      this.scores.set(u.id, s);
    }
    s.name = u.name;
    const previousStreak = s.lastCorrectRound === this.index - 1 ? s.streak : 0;
    const points = computeScore({
      elapsedMs,
      durationMs: t.duration * 1000,
      rank,
      previousStreak,
      difficultyMultiplier: difficultyMultiplier(t.difficulty ?? this.playlist.difficulty),
      inGrace,
      cfg: this.settings,
    });
    s.points += points;
    s.correct += 1;
    s.streak = previousStreak + 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.lastCorrectRound = this.index;
    this.answered.add(u.id);

    const winner: Winner = { userId: u.id, name: u.name, points, elapsedMs, rank };
    this.roundWinners.push(winner);
    this.feed = [winner, ...this.feed].slice(0, FEED_MAX);
    this.hooks.emit("all", "round:correct", { ...winner, correctCount: this.roundWinners.length });
    this.hooks.emit("all", "leaderboard:update", { leaderboard: this.leaderboard() });
    this.hooks.emit("host", "state:sync", this.snapshot("host"));
  }

  // ───────── Lecture ─────────
  leaderboard(limit = 10): LeaderboardEntry[] {
    return this.rankedScores().slice(0, limit).map((s, i) => ({
      userId: s.userId,
      name: s.name,
      points: s.points,
      correct: s.correct,
      streak: s.lastCorrectRound >= this.index - 1 ? s.streak : 0,
      rank: i + 1,
      delta: this.prevRanks.has(s.userId) ? this.prevRanks.get(s.userId)! - (i + 1) : 0,
    }));
  }

  snapshot(role: "host" | "overlay"): Snapshot {
    const t = this.track;
    const round =
      this.inRound && t
        ? {
            videoId: t.youtubeId,
            startTime: t.startTime,
            duration: t.duration,
            playAtServerTs: this.t0,
            endsAtServerTs: this.t0 + t.duration * 1000,
            hint: this.hintShown ? t.hint : null,
          }
        : null;
    const snap: Snapshot = {
      sessionId: this.id,
      playlistId: this.playlist.id,
      playlistTitle: this.playlist.title,
      state: this.state,
      index: this.index,
      total: this.total,
      settings: this.settings,
      serverNow: Date.now(),
      round,
      reveal: this.state === "REVEAL" || this.state === "INTERMISSION" ? this.reveal : null,
      correctCount: this.roundWinners.length,
      activeChatters: this.roundChatters.size,
      leaderboard: this.leaderboard(),
      nextAt: this.nextAt,
    };
    if (role === "host") {
      snap.host = { displayTitle: t?.displayTitle ?? "", expected: t?.acceptedAnswers ?? [], feed: this.feed };
    }
    return snap;
  }

  sync() {
    this.hooks.emit("host", "state:sync", this.snapshot("host"));
    this.hooks.emit("overlay", "state:sync", this.snapshot("overlay"));
  }
}
