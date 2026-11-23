"use client";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Phase } from "@beatdrop/shared";
import { api, loginUrl, type PlaylistDetail } from "@/lib/api";
import { send, serverNow, useLive } from "@/lib/live";
import { useHostSocket } from "@/lib/useHostSocket";

const PHASE_LABEL: Record<Phase, string> = {
  LOBBY: "Waiting room",
  COUNTDOWN: "Countdown",
  PLAYING: "Round in progress",
  GRACE: "Final answers",
  REVEAL: "Reveal",
  INTERMISSION: "Intermission",
  ENDED: "Game ended",
};

function useTick(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function Dashboard() {
  const params = useSearchParams();
  const playlistId = params.get("playlist");
  const { me, loadingMe } = useHostSocket();
  const { connected, connectError, synced, snapshot: snap, presence, toasts } = useLive();
  const [chatName, setChatName] = useState("viewer_test");
  const [chatText, setChatText] = useState("");
  const [delay, setDelay] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  useTick();

  const { data: pl } = useQuery({
    queryKey: ["playlist", playlistId],
    queryFn: () => api<PlaylistDetail>(`/api/playlists/${playlistId}`),
    enabled: !!playlistId && !!me?.user,
  });

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (e.code === "Space") { e.preventDefault(); send("host:next"); }
      if (e.key.toLowerCase() === "h") send("host:hint");
      if (e.key.toLowerCase() === "a" && snap) send("host:settings.update", { transition: snap.settings.transition === "auto" ? "manual" : "auto" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [snap]);

  if (loadingMe) return <div className="h-40 animate-pulse rounded-xl bg-bg1" />;
  if (!me?.user)
    return (
      <div className="panel space-y-3">
        <p>Log in with Twitch to control a game.</p>
        <a href={loginUrl} className="btn btn-primary">Log in with Twitch</a>
      </div>
    );

  const overlayOk = (presence?.overlayCount ?? 0) > 0;
  const Status = (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <span className={connected ? "text-accent2" : "text-accent"}>{connected ? "● Server connected" : `● Server disconnected${connectError ? ` (${connectError})` : ""}`}</span>
      <span className={overlayOk ? "text-accent2" : "text-gold"}>{overlayOk ? `● Overlay connected (${presence?.overlayCount})` : "● No overlay connected: no audio will play"}</span>
      <span className={presence?.chat === "connected" ? "text-accent2" : presence?.chat === "error" ? "text-accent" : "text-gold"}>
        {presence?.chat === "connected" ? "● Twitch chat connected" : presence?.chat === "error" ? `● Chat: ${presence.chatError ?? "error"}` : "● Twitch chat: connecting…"}
      </span>
    </div>
  );

  // ───────── Pas de session ─────────
  if (!snap) {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <h1 className="font-display text-5xl">Live dashboard</h1>
        {Status}
        <div className="panel space-y-4">
          {!synced && <p className="text-text1">Connecting to server…</p>}
          {synced && playlistId && (
            <>
              <p>Selected quiz: <b>{pl?.title ?? "…"}</b> {pl && <span className="text-text1">({pl.tracks.length} tracks)</span>}</p>
              <button className="btn btn-primary w-full" disabled={!connected || !pl} onClick={() => send("host:session.create", { playlistId })}>▶ Create session</button>
            </>
          )}
          {synced && !playlistId && (
            <p className="text-text1">No quiz selected. Choose one from the <Link href="/" className="text-accent2 underline">catalog</Link> or create a <Link href="/random" className="text-accent2 underline">random game</Link>.</p>
          )}
        </div>
        <ToastList />
      </div>
    );
  }

  // ───────── Session active ─────────
  const s = snap.settings;
  const remaining = snap.round ? Math.max(0, Math.ceil((snap.round.endsAtServerTs - serverNow()) / 1000)) : 0;
  const nextIn = snap.nextAt ? Math.max(0, Math.ceil((snap.nextAt - serverNow()) / 1000)) : null;
  const inRound = snap.state === "COUNTDOWN" || snap.state === "PLAYING" || snap.state === "GRACE";
  const expected = snap.host?.expected ?? [];
  const expectedText = Array.isArray(expected[0]) ? (expected as string[][]).map((g) => g.join(" / ")).join("  +  ") : (expected as string[]).join(" · ");
  const delayValue = delay ?? s.streamDelayMs;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-bg1 px-5 py-3">
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold" style={{ animation: "pulse-ring 2s infinite" }}>● LIVE</span>
        <h1 className="font-display text-3xl">{snap.playlistTitle}</h1>
        <span className="text-text1">Track {Math.max(snap.index + 1, 0)} / {snap.total}</span>
        <span className="rounded-full bg-bg2 px-3 py-1 text-sm">{PHASE_LABEL[snap.state]}</span>
        <div className="flex-1" />
        {snap.state === "ENDED" ? (
          <button className="btn btn-primary" onClick={() => send("host:close")}>Finish and exit</button>
        ) : (
          <button className="btn btn-ghost" onClick={() => confirm("Stop the game now?") && send("host:stop")}>⏹ Stop</button>
        )}
      </div>
      {Status}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className="panel space-y-4">
            <div className="flex items-center gap-6">
              <div className="grid size-28 place-items-center rounded-full border-4 border-bg2 font-mono text-4xl tabular-nums" style={{ borderColor: inRound && remaining <= 5 && snap.state === "PLAYING" ? "var(--color-accent)" : undefined }}>
                {snap.state === "COUNTDOWN" ? Math.max(0, Math.ceil(((snap.round?.playAtServerTs ?? 0) - serverNow()) / 1000)) : inRound ? remaining : "–"}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                {snap.index >= 0 && snap.state !== "ENDED" && (
                  <>
                    <div className="text-xs text-text1">Expected answer (private)</div>
                    <div className="truncate text-xl font-semibold">{snap.host?.displayTitle}</div>
                    <div className="truncate text-sm text-text1">Accepted: {expectedText}</div>
                  </>
                )}
                {snap.state === "LOBBY" && <p className="text-text1">The game has not started. Check that the overlay is connected, then start it.</p>}
                <div className="text-sm">
                  Found by <b className="text-accent2">{snap.correctCount}</b> / {snap.activeChatters} active viewers
                  {snap.round?.hint && <span className="ml-3 text-gold">💡 {snap.round.hint}</span>}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {snap.state !== "ENDED" && (
                <button className="btn btn-primary" onClick={() => send("host:next")}>
                  {snap.state === "LOBBY" ? "▶ Start" : inRound ? "⏭ Reveal (Space)" : "⏭ Next round (Space)"}
                </button>
              )}
              <button className="btn" disabled={!inRound} onClick={() => send("host:hint")}>💡 Hint (H)</button>
              {snap.state === "INTERMISSION" && snap.nextAt && (
                <>
                  <button className="btn" onClick={() => send("host:extend")}>+10 s</button>
                  <button className="btn" onClick={() => send("host:pause")}>⏸ Pause auto</button>
                  <span className="text-sm text-text1">Next round in {nextIn} s</span>
                </>
              )}
            </div>
          </section>

          <section className="panel grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm text-text1">Transition between rounds (A)</div>
              <div className="flex gap-2">
                <button className="chip" data-on={s.transition === "manual"} onClick={() => send("host:settings.update", { transition: "manual" })}>Manual</button>
                <button className="chip" data-on={s.transition === "auto"} onClick={() => send("host:settings.update", { transition: "auto" })}>Auto</button>
                <select className="input w-auto" value={s.autoDelaySec} onChange={(e) => send("host:settings.update", { autoDelaySec: +e.target.value })}>
                  {[5, 8, 12, 20].map((n) => <option key={n} value={n}>{n} s</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-text1">Stream delay: {(delayValue / 1000).toFixed(1)} s</div>
              <input
                type="range" min={0} max={20000} step={500} value={delayValue} className="w-full"
                onChange={(e) => setDelay(+e.target.value)}
                onPointerUp={() => { if (delay !== null) { send("host:settings.update", { streamDelayMs: delay }); setDelay(null); } }}
                onKeyUp={() => { if (delay !== null) { send("host:settings.update", { streamDelayMs: delay }); setDelay(null); } }}
              />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.botAnnounce} onChange={(e) => send("host:settings.update", { botAnnounce: e.target.checked })} /> Bot announces answers in chat</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.speedBonus} onChange={(e) => send("host:settings.update", { speedBonus: e.target.checked })} /> Speed bonus</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.everyoneCanWin} onChange={(e) => send("host:settings.update", { everyoneCanWin: e.target.checked })} /> Everyone can win (100 fixed pts)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.streakBonus} onChange={(e) => send("host:settings.update", { streakBonus: e.target.checked })} /> Streak bonus</label>
          </section>

          {presence?.fakeChat && (
            <section className="panel space-y-2">
              <div className="text-sm text-text1">Test chat (simulate viewers without a Twitch live stream)</div>
              <form
                className="flex gap-2"
                onSubmit={(e) => { e.preventDefault(); if (chatText.trim()) { send("host:fakechat", { name: chatName || "viewer_test", text: chatText }); setChatText(""); } }}
              >
                <input className="input w-40" value={chatName} onChange={(e) => setChatName(e.target.value)} aria-label="Username" />
                <input className="input" placeholder="Type an answer…" value={chatText} onChange={(e) => setChatText(e.target.value)} aria-label="Message" />
                <button className="btn" type="submit">Send</button>
              </form>
            </section>
          )}

          <section className="panel flex flex-wrap items-center gap-2 text-sm">
            <span className="text-text1">OBS overlay URL:</span>
            <code className="flex-1 truncate rounded bg-bg2 px-2 py-1">{me.overlayUrl}</code>
            <button className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(me.overlayUrl ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied ✓" : "Copy"}</button>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="panel">
            <h2 className="mb-3 font-display text-2xl tracking-wide">Leaderboard</h2>
            {snap.leaderboard.length === 0 && <p className="text-sm text-text1">No points yet.</p>}
            <ol className="space-y-1">
              {snap.leaderboard.map((e) => (
                <li key={e.userId} className="flex items-center gap-3 text-sm">
                  <span className="w-6 text-text1 tabular-nums">{e.rank}</span>
                  <span className="flex-1 truncate">{e.rank === 1 ? "🥇 " : e.rank === 2 ? "🥈 " : e.rank === 3 ? "🥉 " : ""}{e.name}</span>
                  {e.delta > 0 && <span className="text-accent2">▲{e.delta}</span>}
                  {e.delta < 0 && <span className="text-accent">▼{-e.delta}</span>}
                  <span className="font-mono tabular-nums">{e.points}</span>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel">
            <h2 className="mb-3 font-display text-2xl tracking-wide">Correct answers</h2>
            <ul className="max-h-72 space-y-1 overflow-auto text-sm">
              {(snap.host?.feed ?? []).map((w, i) => (
                <li key={`${w.userId}-${i}`} className="flex gap-2"><span className="text-accent2">✓</span><span className="flex-1 truncate">{w.name}</span><span className="font-mono">+{w.points}</span><span className="text-text1">({(w.elapsedMs / 1000).toFixed(1)} s)</span></li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      <ToastList />
    </div>
  );
}

function ToastList() {
  const toasts = useLive((s) => s.toasts).filter((t) => t.level !== "ok");
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`rounded-lg px-4 py-2 text-sm shadow-lg ${t.level === "error" ? "bg-accent text-white" : t.level === "warn" ? "bg-gold text-black" : "bg-bg2"}`}>{t.text}</div>
      ))}
    </div>
  );
}

export default function LivePage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-bg1" />}>
      <Dashboard />
    </Suspense>
  );
}
