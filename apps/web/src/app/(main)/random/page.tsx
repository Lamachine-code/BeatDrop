"use client";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@beatdrop/shared";
import { ApiError, api, loginUrl, useMe } from "@/lib/api";

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function RandomPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const [cats, setCats] = useState<Category[]>(["pop", "movie", "cartoon", "videogame"]);
  const [langs, setLangs] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [duration, setDuration] = useState(30);
  const [range, setRange] = useState<[number, number]>([1, 3]);
  const [progressive, setProgressive] = useState(false);

  const m = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/random", {
        method: "POST",
        body: { categories: cats, languages: langs, count, duration, minDifficulty: range[0], maxDifficulty: range[1], progressive },
      }),
    onSuccess: (r) => router.push(`/live?playlist=${r.id}`),
  });

  if (!me?.user)
    return (
      <div className="panel space-y-3">
        <p>Log in with Twitch to generate a game.</p>
        <a href={loginUrl} className="btn btn-primary">Log in with Twitch</a>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-5xl">🎲 Random game</h1>
      <div className="panel space-y-5">
        <div className="space-y-2">
          <div className="text-sm text-text1">Categories</div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c} className="chip" data-on={cats.includes(c)} onClick={() => setCats(toggle(cats, c))}>{CATEGORY_LABELS[c]}</button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-sm text-text1">Language (none selected = all)</div>
          <div className="flex gap-2">
            {["FR", "EN"].map((l) => (
              <button key={l} className="chip" data-on={langs.includes(l)} onClick={() => setLangs(toggle(langs, l))}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="space-y-1 text-sm text-text1">Minimum difficulty
            <select className="input" value={range[0]} onChange={(e) => setRange([Math.min(+e.target.value, range[1]), range[1]])}>
              {[1, 2, 3].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-text1">Maximum difficulty
            <select className="input" value={range[1]} onChange={(e) => setRange([range[0], Math.max(+e.target.value, range[0])])}>
              {[1, 2, 3].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-text1">Number of tracks
            <select className="input" value={count} onChange={(e) => setCount(+e.target.value)}>
              {[5, 10, 20, 30, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm text-text1">Duration per track
            <select className="input" value={duration} onChange={(e) => setDuration(+e.target.value)}>
              {[15, 30, 45].map((n) => <option key={n} value={n}>{n} s</option>)}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={progressive} onChange={(e) => setProgressive(e.target.checked)} /> Progressive difficulty (easy → hard)
        </label>
        {m.error && <p className="text-sm text-accent">{(m.error as ApiError).message}</p>}
        <button className="btn btn-primary w-full" disabled={!cats.length || m.isPending} onClick={() => m.mutate()}>
          {m.isPending ? "Drawing game…" : "▶ Draw and start live"}
        </button>
      </div>
      <p className="text-sm text-text1">Tracks are randomly drawn from public quizzes in the catalog.</p>
    </div>
  );
}
