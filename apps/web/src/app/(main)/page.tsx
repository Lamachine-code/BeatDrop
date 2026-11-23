"use client";
import { useQuery } from "@tanstack/react-query";
import useEmblaCarousel from "embla-carousel-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORIES, CATEGORY_LABELS } from "@beatdrop/shared";
import { Dots, GRADIENTS, PlaylistCard } from "@/components/PlaylistCard";
import { api, type PlaylistSummary } from "@/lib/api";

function Row({ title, items }: { title: string; items: PlaylistSummary[] }) {
  const [ref] = useEmblaCarousel({ dragFree: true, align: "start", containScroll: "trimSnaps" });
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-display text-3xl tracking-wide">{title}</h2>
      <div ref={ref} className="overflow-hidden py-3 -my-3">
        <div className="flex gap-4">
          {items.map((p) => (
            <div key={p.id} className="w-56 shrink-0">
              <PlaylistCard p={p} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { data, isLoading, error } = useQuery({ queryKey: ["catalog"], queryFn: () => api<PlaylistSummary[]>("/api/catalog") });
  const [lang, setLang] = useState<string>("all");
  const [diff, setDiff] = useState<number>(0);

  const filtered = useMemo(
    () => (data ?? []).filter((p) => (lang === "all" || p.language === lang) && (diff === 0 || p.difficulty === diff)),
    [data, lang, diff],
  );
  const langs = useMemo(() => [...new Set((data ?? []).map((p) => p.language))], [data]);
  const hero = filtered[0];

  if (error)
    return (
      <div className="panel space-y-2">
        <p className="font-semibold">Could not reach the BeatDrop server.</p>
        <p className="text-sm text-text1">Make sure the real-time server is running (pnpm dev) and NEXT_PUBLIC_REALTIME_URL is correct.</p>
      </div>
    );

  return (
    <div className="space-y-10">
      {isLoading && <div className="h-72 animate-pulse rounded-2xl bg-bg1" />}

      {hero && (
        <section className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-8 md:p-12 ${GRADIENTS[hero.category] ?? GRADIENTS.other}`}>
          <div className="absolute inset-0 bg-gradient-to-t from-bg0/90 via-bg0/30 to-transparent" />
          <div className="relative max-w-2xl space-y-4">
            <h1 className="font-display text-6xl leading-none md:text-8xl">{hero.title}</h1>
            {hero.description && <p className="text-white/85">{hero.description}</p>}
            <p className="flex items-center gap-3 text-sm text-white/80">
              {hero.trackCount} tracks · {hero.language} · <Dots n={hero.difficulty} /> · {hero.playsCount} plays
            </p>
            <div className="flex gap-3">
              <Link href={`/live?playlist=${hero.id}`} className="btn btn-primary">▶ Start live</Link>
              <Link href={`/b/${hero.id}`} className="btn">Details</Link>
            </div>
          </div>
        </section>
      )}

      {!isLoading && data?.length === 0 && (
        <div className="panel space-y-2">
          <p className="font-semibold">The catalog is empty.</p>
          <p className="text-sm text-text1">
            Load the demo playlist with <code className="rounded bg-bg2 px-1">pnpm db:seed</code>, or create your own music quiz from{" "}
            <Link href="/studio" className="text-accent2 underline">Create</Link>.
          </p>
        </div>
      )}

      <div className="sticky top-[57px] z-30 -mx-5 flex flex-wrap items-center gap-2 bg-bg0/90 px-5 py-2 backdrop-blur">
        <span className="text-xs text-text1">Language</span>
        {["all", ...langs].map((l) => (
          <button key={l} className="chip" data-on={lang === l} onClick={() => setLang(l)}>{l === "all" ? "All" : l}</button>
        ))}
        <span className="ml-4 text-xs text-text1">Difficulty</span>
        {[0, 1, 2, 3].map((d) => (
          <button key={d} className="chip" data-on={diff === d} onClick={() => setDiff(d)}>{d === 0 ? "All" : "●".repeat(d)}</button>
        ))}
      </div>

      <Row title="Trending" items={[...filtered].sort((a, b) => b.playsCount - a.playsCount).slice(0, 12)} />
      <Row title="New releases" items={filtered.slice(0, 12)} />
      {CATEGORIES.map((c) => (
        <Row key={c} title={CATEGORY_LABELS[c]} items={filtered.filter((p) => p.category === c)} />
      ))}
    </div>
  );
}
