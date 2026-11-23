"use client";
import { io, type Socket } from "socket.io-client";
import { create } from "zustand";
import type { Presence, Snapshot } from "@beatdrop/shared";
import { API } from "./api";

export interface Toast {
  id: number;
  level: "info" | "warn" | "error" | "ok";
  text: string;
}
export interface Calib {
  status: "idle" | "running" | "done" | "fail";
  step: number;
  waiting: boolean;
  delayMs?: number;
  samples?: number[];
  reason?: string;
}
interface LiveStore {
  connected: boolean;
  connectError: string | null;
  /** false until the first state:sync message arrives */
  synced: boolean;
  snapshot: Snapshot | null;
  presence: Presence | null;
  toasts: Toast[];
  /** offset = heure serveur − heure locale (ms) */
  offset: number;
  flashAt: number | null;
  calib: Calib;
}

export const useLive = create<LiveStore>(() => ({
  connected: false,
  connectError: null,
  synced: false,
  snapshot: null,
  presence: null,
  toasts: [],
  offset: 0,
  flashAt: null,
  calib: { status: "idle", step: 0, waiting: false },
}));

export const serverNow = () => Date.now() + useLive.getState().offset;

let socket: Socket | null = null;
let toastId = 0;
export function pushToast(level: Toast["level"], text: string, ttl = 4500) {
  const id = ++toastId;
  useLive.setState((s) => ({ toasts: [...s.toasts.slice(-5), { id, level, text }] }));
  setTimeout(() => useLive.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ttl);
}
export const send = (event: string, payload?: unknown) => socket?.emit(event, payload);
export const emitOverlayError = (videoId: string, code: number) => socket?.emit("overlay:error", { videoId, code });

/** Connects to the real-time server. Returns a cleanup function. */
export function connectLive(auth: { role: "host"; token: string } | { role: "overlay"; overlayToken: string }) {
  const s = io(API, { auth, reconnection: true, reconnectionDelayMax: 4000 });
  socket = s;
  const samples: { rtt: number; off: number }[] = [];

  const ping = () => {
    const t0 = Date.now();
    s.emit("time:ping", (serverTs: number) => {
      const t3 = Date.now();
      const rtt = t3 - t0;
      samples.push({ rtt, off: serverTs + rtt / 2 - t3 });
      if (samples.length > 8) samples.shift();
      const best = [...samples].sort((a, b) => a.rtt - b.rtt).slice(0, 3);
      useLive.setState({ offset: best.reduce((acc, x) => acc + x.off, 0) / best.length });
    });
  };
  const pingTimer = setInterval(ping, 10_000);

  s.on("connect", () => {
    useLive.setState({ connected: true, connectError: null });
    ping();
    setTimeout(ping, 400);
  });
  s.on("disconnect", () => useLive.setState({ connected: false }));
  s.on("connect_error", (e) => useLive.setState({ connected: false, connectError: e.message }));
  s.on("state:sync", (snap: Snapshot | null) => useLive.setState({ snapshot: snap, synced: true }));
  s.on("presence", (p: Presence) => useLive.setState({ presence: p }));
  s.on("leaderboard:update", (p: { leaderboard: Snapshot["leaderboard"] }) =>
    useLive.setState((st) => (st.snapshot ? { snapshot: { ...st.snapshot, leaderboard: p.leaderboard } } : {})),
  );
  s.on("round:correct", (w: { name: string; points: number }) => pushToast("ok", `${w.name} got it!  +${w.points}`));
  s.on("host:toast", (t: { level: Toast["level"]; text: string }) => pushToast(t.level, t.text, 7000));
  s.on("calib:flash", (p: { atServerTs: number }) => useLive.setState({ flashAt: p.atServerTs }));
  s.on("calib:status", (p: { step: number; waiting: boolean }) => useLive.setState({ calib: { status: "running", step: p.step, waiting: p.waiting } }));
  s.on("calib:result", (p: { delayMs: number; samples: number[] }) => useLive.setState({ calib: { status: "done", step: 3, waiting: false, delayMs: p.delayMs, samples: p.samples } }));
  s.on("calib:fail", (p: { reason: string }) => useLive.setState({ calib: { status: "fail", step: 0, waiting: false, reason: p.reason } }));

  return () => {
    clearInterval(pingTimer);
    s.disconnect();
    if (socket === s) socket = null;
    useLive.setState({ connected: false, synced: false, snapshot: null, presence: null });
  };
}
