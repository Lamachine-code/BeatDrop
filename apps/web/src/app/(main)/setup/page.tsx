"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, loginUrl } from "@/lib/api";
import { send, useLive } from "@/lib/live";
import { useHostSocket } from "@/lib/useHostSocket";

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="panel space-y-3">
      <h2 className="flex items-center gap-3 font-display text-3xl tracking-wide">
        <span className={`grid size-8 place-items-center rounded-full text-base font-sans ${done ? "bg-accent2 text-black" : "bg-bg2"}`}>{done ? "✓" : n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Setup() {
  const qc = useQueryClient();
  const { me, loadingMe } = useHostSocket();
  const { presence, calib, connected } = useLive();
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    setLoginError(new URLSearchParams(window.location.search).get("error"));
  }, []);
  const overlayUrl = url ?? me?.overlayUrl ?? "";
  const logged = !!me?.user;

  const copy = async () => {
    await navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="font-display text-5xl">Setup</h1>
      {loginError && <div className="panel text-accent">Twitch login denied: {loginError}</div>}

      <Step n={1} title="Connect your Twitch account" done={logged}>
        {loadingMe ? (
          <div className="h-8 animate-pulse rounded bg-bg2" />
        ) : logged ? (
          <p className="text-text1">Logged in as <b className="text-white">{me?.user?.displayName}</b>. No bot invitation needed: BeatDrop reads your chat with your permission.</p>
        ) : (
          <>
            <p className="text-text1">Allow BeatDrop to read chat and write bot announcements in your channel.</p>
            <a href={loginUrl} className="btn btn-primary">Log in with Twitch</a>
          </>
        )}
      </Step>

      <Step n={2} title="Add the overlay in OBS" done={(presence?.overlayCount ?? 0) > 0}>
        {logged ? (
          <>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-bg2 px-3 py-2 text-sm">{overlayUrl}</code>
              <button className="btn" onClick={copy}>{copied ? "Copied ✓" : "Copy URL"}</button>
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-text1">
              <li>In OBS: <b>Sources → + → Browser</b>.</li>
              <li>Paste the URL above, width <b>1920</b>, height <b>1080</b>.</li>
              <li>Enable <b>Control audio via OBS</b> so the music passes through your audio mixer.</li>
              <li>In <b>Advanced Audio Properties</b>, assign this source to a separate track and exclude it from VODs (see the DMCA warning below).</li>
            </ol>
            <p className="text-sm text-text1">
              URL options: <code>?pos=left</code> leaderboard on the left · <code>?scale=0.8</code> scales everything down · <code>?audioOnly=1</code> audio only, no visual layout.
            </p>
            <p className={`text-sm ${(presence?.overlayCount ?? 0) > 0 ? "text-accent2" : "text-gold"}`}>
              {(presence?.overlayCount ?? 0) > 0 ? "● Overlay detected" : connected ? "● Waiting for overlay… open the URL in OBS or a browser tab" : "● Connecting to server…"}
            </p>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                if (!confirm("The old URL will stop working immediately. Continue?")) return;
                const r = await api<{ overlayUrl: string }>("/api/overlay-token/rotate", { method: "POST" });
                setUrl(r.overlayUrl);
                qc.invalidateQueries({ queryKey: ["me"] });
              }}
            >
              Regenerate URL (if it leaked)
            </button>
          </>
        ) : (
          <p className="text-text1">Log in first.</p>
        )}
      </Step>

      <Step n={3} title="Calibrate your stream delay" done={calib.status === "done"}>
        <p className="text-sm text-text1">
          Your viewers hear the music several seconds after you do. BeatDrop measures this delay so no one loses points.
          Current delay: <b className="text-white">{((presence?.streamDelayMs ?? me?.user?.streamDelayMs ?? 6000) / 1000).toFixed(1)} s</b>.
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-text1">
          <li>The overlay must be in OBS and your live stream <b>must be running</b>. Open your own stream in another tab.</li>
          <li>Click “Start calibration”: the overlay flashes “TOP”.</li>
          <li>As soon as you see it <b>on your stream</b>, type <code>TOP</code> in chat. Three attempts.</li>
        </ol>
        <button className="btn btn-primary" disabled={!logged || (presence?.chat !== "connected") || calib.status === "running"} onClick={() => send("host:calibrate.start")}>
          {calib.status === "running" ? `Attempt ${calib.step}/3… ${calib.waiting ? "type TOP as soon as you see the flash" : "measurement recorded"}` : "Start calibration"}
        </button>
        {presence?.chat !== "connected" && logged && <p className="text-sm text-gold">Twitch chat: {presence?.chat === "error" ? presence.chatError : "connecting…"}</p>}
        {calib.status === "done" && <p className="text-sm text-accent2">Measured delay: {((calib.delayMs ?? 0) / 1000).toFixed(1)} s (attempts: {calib.samples?.map((s) => `${(s / 1000).toFixed(1)}s`).join(", ")}). Saved.</p>}
        {calib.status === "fail" && <p className="text-sm text-accent">{calib.reason}</p>}
        <p className="text-xs text-text1">You can also adjust the delay manually during a game from the dashboard. To test without a live stream, leave the default (6 s) or set it to 0.</p>
      </Step>

      <Step n={4} title="Before your first live stream">
        <ul className="list-disc space-y-2 pl-5 text-sm text-text1">
          <li><b className="text-white">Music rights (Twitch DMCA)</b>: broadcasting copyrighted music may cause strikes, especially on VODs. Route the overlay audio to a separate track and exclude it from VODs.</li>
          <li><b className="text-white">YouTube</b>: the player remains mounted behind the visual layout. Some videos disable embedding and are automatically skipped during live play.</li>
        </ul>
      </Step>
    </div>
  );
}
