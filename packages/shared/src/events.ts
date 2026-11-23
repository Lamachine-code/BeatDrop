import type { Settings } from "./schemas";

export type Phase = "LOBBY" | "COUNTDOWN" | "PLAYING" | "GRACE" | "REVEAL" | "INTERMISSION" | "ENDED";

export interface LeaderboardEntry {
  userId: string;
  name: string;
  points: number;
  correct: number;
  streak: number;
  rank: number;
  /** Positions gained (+) or lost (-) since the start of the round. */
  delta: number;
}

export interface Winner {
  userId: string;
  name: string;
  points: number;
  elapsedMs: number;
  rank: number;
}

export interface RoundInfo {
  videoId: string;
  startTime: number;
  duration: number;
  /** Server timestamp when audio starts on the streamer side. */
  playAtServerTs: number;
  /** Server timestamp for audio end on the streamer side (viewer clock). */
  endsAtServerTs: number;
  hint: string | null;
}

export interface RevealInfo {
  displayTitle: string;
  sourceTitle: string | null;
  thumbnailUrl: string;
  winners: Winner[];
}

export interface Snapshot {
  sessionId: string;
  playlistId: string;
  playlistTitle: string;
  state: Phase;
  /** Zero-based index of the current track (-1 before the first track). */
  index: number;
  total: number;
  settings: Settings;
  serverNow: number;
  round: RoundInfo | null;
  reveal: RevealInfo | null;
  correctCount: number;
  activeChatters: number;
  leaderboard: LeaderboardEntry[];
  /** Server timestamp for the next automatic start. */
  nextAt: number | null;
  /** Visible par le host uniquement. */
  host?: {
    displayTitle: string;
    expected: string[] | string[][];
    feed: Winner[];
  };
}

export interface Presence {
  overlayCount: number;
  chat: "off" | "connecting" | "connected" | "error";
  chatError?: string;
  fakeChat: boolean;
  streamDelayMs: number;
}

export type HostCommand =
  | "host:session.create"
  | "host:next"
  | "host:stop"
  | "host:close"
  | "host:hint"
  | "host:extend"
  | "host:pause"
  | "host:settings.update"
  | "host:fakechat"
  | "host:calibrate.start";
