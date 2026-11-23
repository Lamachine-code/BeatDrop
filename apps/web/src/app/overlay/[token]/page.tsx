"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element */
import { AnimatePresence, motion } from "framer-motion";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import type { LeaderboardEntry, Snapshot } from "@beatdrop/shared";
import { connectLive, emitOverlayError, serverNow, useLive } from "@/lib/live";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    obsstudio?: unknown;
  }
}

let ytPromise: Promise<any> | null = null;
function loadYT(): Promise<any> {
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return ytPromise;
}

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const t = setInterval(() => setN((i) => (i >= text.length ? i : i + 1)), 35);
    return () => clearInterval(t);
  }, [text]);
  return <>{text.slice(0, n)}</>;
}

function Bars({ active }: { active: boolean }) {
  return (
    <div className="flex h-24 items-end gap-2" aria-hidden>
      {Array.from({ length: 18 }).map((_, i) => (
        <div
          key={i}
          className="w-3 origin-bottom rounded-full bg-accent2"
          style={{ height: "100%", animation: `eq ${700 + ((i * 97) % 500)}ms ease-in-out ${(i * 53) % 400}ms infinite`, animationPlayState: active ? "running" : "paused", transform: "scaleY(0.2)" }}
        />
      ))}
    </div>
  );
}

function Ring({ progress, urgent, children }: { progress: number; urgent: boolean; children: React.ReactNode }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-40 place-items-center">
      <svg viewBox="0 0 140 140" className="absolute inset-0 -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1e1e2a" strokeWidth="10" />
        <circle
          cx="70" cy="70" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
          stroke={urgent ? "#ff2e63" : "#08d9d6"} strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))}
          style={urgent ? { animation: "pulse-ring 0.8s infinite" } : undefined}
        />
      </svg>
      <div className="font-mono text-6xl tabular-nums">{children}</div>
    </div>
  );
}

function Board({ entries, limit, big }: { entries: LeaderboardEntry[]; limit: number; big?: boolean }) {
  return (
    <motion.ol layout className={`space-y-2 ${big ? "w-[560px]" : "w-full"}`}>
      {entries.slice(0, limit).map((e) => (
        <motion.li
          layout key={e.userId} transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={`flex items-center gap-3 rounded-xl bg-bg2 px-4 ${big ? "py-3 text-3xl" : "py-2 text-2xl"}`}
        >
          <span className={`w-8 font-mono tabular-nums ${e.rank === 1 ? "text-gold" : "text-text1"}`}>{e.rank}</span>
          <span className="flex-1 truncate">{e.name}</span>
          {e.delta > 0 && <span className="text-lg text-accent2">▲{e.delta}</span>}
          {e.delta < 0 && <span className="text-lg text-accent">▼{-e.delta}</span>}
          <span className="font-mono tabular-nums text-gold">{e.points}</span>
        </motion.li>
      ))}
    </motion.ol>
  );
}

function Stage({ snap, connected, synced }: { snap: Snapshot | null; connected: boolean; synced: boolean }) {
  const now = serverNow();
  let body: React.ReactNode;

  if (!snap) {
    body = (
      <div className="space-y-4 text-center">
        <div className="font-display text-8xl"><span className="text-accent">♪</span> BEATDROP</div>
        <div className="text-3xl text-text1">{!connected ? "Reconnecting…" : synced ? "Waiting for a game…" : "Connecting…"}</div>
      </div>
    );
  } else if (snap.state === "LOBBY") {
    body = (
      <div className="space-y-4 text-center">
        <div className="font-display text-7xl">{snap.playlistTitle}</div>
        <div className="text-3xl text-text1">{snap.total} tracks · answer in chat!</div>
        <div className="text-2xl text-accent2">The game is about to begin…</div>
      </div>
    );
  } else if (snap.state === "COUNTDOWN" && snap.round) {
    const n = Math.max(1, Math.ceil((snap.round.playAtServerTs - now) / 1000));
    body = (
      <div className="space-y-2 text-center">
        <div className="text-3xl text-text1">Track {snap.index + 1} / {snap.total}</div>
        <div className="font-display text-[190px] leading-none text-accent">{n}</div>
      </div>
    );
  } else if ((snap.state === "PLAYING" || snap.state === "GRACE") && snap.round) {
    const rem = Math.max(0, snap.round.endsAtServerTs - now);
    const over = rem <= 0;
    body = (
      <div className="flex flex-col items-center gap-5">
        <Bars active={!over} />
        <Ring progress={rem / (snap.round.duration * 1000)} urgent={!over && rem <= 5000}>{over ? "…" : Math.ceil(rem / 1000)}</Ring>
        <div className="font-display text-6xl">{over ? "Final answers…" : "What is this title?"}</div>
        <div className="flex items-center gap-6 text-2xl text-text1">
          <span className="text-accent2">✓ {snap.correctCount} found</span>
          {snap.round.hint && <span className="text-gold">💡 {snap.round.hint}</span>}
        </div>
      </div>
    );
  } else if (snap.state === "REVEAL" && snap.reveal) {
    const w = snap.reveal.winners;
    body = (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className="flex w-full flex-col items-center gap-4">
        <img src={snap.reveal.thumbnailUrl} alt="" className="h-[200px] rounded-xl object-cover" />
        <div className="min-h-[3.5rem] text-center font-display text-5xl"><Typewriter text={snap.reveal.displayTitle} /></div>
        <div className="text-2xl text-gold">
          {w.length ? `🏆 ${w.slice(0, 3).map((x, i) => (i === 0 ? `${x.name} (${(x.elapsedMs / 1000).toFixed(1)} s)` : x.name)).join(" · ")}` : "No one found it…"}
        </div>
      </motion.div>
    );
  } else if (snap.state === "INTERMISSION") {
    const next = snap.nextAt ? Math.max(0, Math.ceil((snap.nextAt - now) / 1000)) : null;
    body = (
      <div className="flex flex-col items-center gap-4">
        <div className="font-display text-5xl">Leaderboard</div>
        {snap.leaderboard.length ? <Board entries={snap.leaderboard} limit={6} big /> : <div className="text-3xl text-text1">No one has scored.</div>}
        {next !== null && <div className="text-2xl text-accent2">Next round in {next} s</div>}
      </div>
    );
  } else if (snap.state === "ENDED") {
    const top = snap.leaderboard.slice(0, 3);
    body = (
      <div className="flex flex-col items-center gap-5">
        <div className="font-display text-7xl text-gold">Final podium</div>
        {top.length ? <Board entries={top} limit={3} big /> : <div className="text-3xl text-text1">No points scored.</div>}
        <div className="text-2xl text-text1">Thanks for playing!</div>
      </div>
    );
  } else {
    body = null;
  }

  return (
    <div className="absolute left-1/2 top-1/2 z-10 flex h-[460px] w-[800px] -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-bg1 p-8 shadow-2xl">
      {body}
    </div>
  );
}

function OverlayInner() {
  const { token } = useParams<{ token: string }>();
  const sp = useSearchParams();
  const audioOnly = sp.get("audioOnly") === "1";
  const left = sp.get("pos") === "left";
  const explicitScale = Number(sp.get("scale"));
  const { snapshot: snap, connected, synced, flashAt, toasts } = useLive();
  const [ready, setReady] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [flash, setFlash] = useState(false);
  const [fit, setFit] = useState(1);
  const [inObs, setInObs] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const videoRef = useRef<string | null>(null);
  useTick(100);

  useEffect(() => connectLive({ role: "overlay", overlayToken: token }), [token]);

  useEffect(() => {
    const obs = "obsstudio" in window;
    setInObs(obs);
    document.body.style.background = obs ? "transparent" : "#1a1a1a";
    const f = () => setFit(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    f();
    window.addEventListener("resize", f);
    return () => {
      window.removeEventListener("resize", f);
      document.body.style.background = "";
    };
  }, []);
  const scale = explicitScale > 0 ? explicitScale : inObs ? 1 : fit;

  // ───────── YouTube player (always mounted, hidden behind the central card) ─────────
  useEffect(() => {
    let destroyed = false;
    let player: any;
    loadYT().then((YT) => {
      if (destroyed || !wrapRef.current) return;
      const el = document.createElement("div");
      wrapRef.current.appendChild(el);
      player = new YT.Player(el, {
        width: 480,
        height: 270,
        playerVars: { controls: 1, rel: 0, playsinline: 1, disablekb: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            if (destroyed) return;
            playerRef.current = player;
            setReady(true);
          },
          onError: (e: { data: number }) => {
            if (videoRef.current) emitOverlayError(videoRef.current, e.data);
          },
        },
      });
    });
    return () => {
      destroyed = true;
      try { player?.destroy(); } catch { /* noop */ }
      playerRef.current = null;
      setReady(false);
    };
  }, []);

  const round = snap?.round ?? null;
  const roundKey = round ? `${snap?.sessionId}:${snap?.index}:${round.playAtServerTs}` : "none";
  useEffect(() => {
    const p = playerRef.current;
    if (!ready || !p) return;
    if (!round) {
      videoRef.current = null;
      try { p.stopVideo(); } catch { /* noop */ }
      return;
    }
    videoRef.current = round.videoId;
    const delay = round.playAtServerTs - serverNow();
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (delay > 0) {
      p.cueVideoById({ videoId: round.videoId, startSeconds: round.startTime });
      timers.push(setTimeout(() => p.playVideo(), delay));
    } else {
      // reconnexion en cours de manche : on rattrape la position
      p.loadVideoById({ videoId: round.videoId, startSeconds: round.startTime + Math.min(-delay / 1000, round.duration) });
    }
    timers.push(setTimeout(() => { try { p.pauseVideo(); } catch { /* noop */ } }, Math.max(0, round.endsAtServerTs - serverNow())));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, ready]);

  // Flash de calibration
  useEffect(() => {
    if (!flashAt) return;
    const wait = Math.max(0, flashAt - serverNow());
    const t1 = setTimeout(() => setFlash(true), wait);
    const t2 = setTimeout(() => setFlash(false), wait + 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [flashAt]);

  const player = <div ref={wrapRef} className={audioOnly ? "fixed -left-[9999px] top-0 h-[270px] w-[480px]" : "absolute left-1/2 top-1/2 z-0 h-[270px] w-[480px] -translate-x-1/2 -translate-y-1/2"} />;
  if (audioOnly) return <>{player}</>;

  const showBoard = snap && snap.state !== "INTERMISSION" && snap.state !== "ENDED" && snap.leaderboard.length > 0;
  const okToasts = toasts.filter((t) => t.level === "ok");

  return (
    <div className="fixed inset-0 overflow-hidden" onClick={() => setUnlocked(true)}>
      <div style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: "top left", position: "relative" }} className="text-text0">
        {player}
        <Stage snap={snap} connected={connected} synced={synced} />

        {snap && (
          <div className="absolute left-12 top-12 rounded-2xl bg-bg1/90 px-6 py-4">
            <div className="font-display text-4xl"><span className="text-accent">♪</span> {snap.playlistTitle}</div>
            <div className="text-xl text-text1">Track {Math.max(snap.index + 1, 0)} / {snap.total}</div>
          </div>
        )}

        {showBoard && (
          <div className={`absolute top-12 w-[420px] rounded-2xl bg-bg1/90 p-5 ${left ? "left-12 top-48" : "right-12"}`}>
            <div className="mb-3 font-display text-3xl">Leaderboard</div>
            <Board entries={snap!.leaderboard} limit={5} />
          </div>
        )}

        <div className="absolute bottom-12 right-12 w-[520px] space-y-3">
          <AnimatePresence>
            {okToasts.map((t) => (
              <motion.div key={t.id} initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="rounded-xl border border-accent2/40 bg-bg1 px-5 py-3 text-2xl text-accent2">
                ✓ {t.text}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {snap?.state === "PLAYING" && <div className="absolute bottom-12 left-12 rounded-xl bg-bg1/90 px-5 py-3 text-2xl">Type your answer in chat!</div>}

        {!inObs && !unlocked && (
          <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-full bg-gold px-6 py-2 text-xl font-semibold text-black">
            🔊 Click anywhere to enable audio (not needed in OBS)
          </div>
        )}
        {synced && !connected && <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full bg-bg2 px-4 py-1 text-lg text-text1">Reconnecting…</div>}
      </div>

      {flash && (
        <div className="absolute inset-0 z-50 grid place-items-center bg-white text-black" style={{ animation: "flash 1.5s ease-out forwards" }}>
          <div className="text-center">
            <div className="font-display text-[300px] leading-none">TOP</div>
            <div className="text-5xl">Type “TOP” in your live stream chat!</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OverlayPage() {
  return (
    <Suspense fallback={null}>
      <OverlayInner />
    </Suspense>
  );
}
