"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CATEGORY_LABELS, type Category } from "@beatdrop/shared";
import { Dots, GRADIENTS } from "@/components/PlaylistCard";
import { api, loginUrl, useMe, type PlaylistDetail } from "@/lib/api";

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: me } = useMe();
  const { data: p, isLoading, error } = useQuery({ queryKey: ["playlist", id], queryFn: () => api<PlaylistDetail>(`/api/playlists/${id}`) });
  const fork = useMutation({
    mutationFn: () => api<{ id: string }>(`/api/playlists/${id}/fork`, { method: "POST" }),
    onSuccess: (r) => router.push(`/studio/${r.id}`),
  });

  if (isLoading) return <div className="h-64 animate-pulse rounded-2xl bg-bg1" />;
  if (error || !p) return <div className="panel">This music quiz could not be found or is private.</div>;
  const logged = !!me?.user;

  return (
    <div className="space-y-8">
      <section className={`rounded-2xl bg-gradient-to-br p-8 ${GRADIENTS[p.category] ?? GRADIENTS.other}`}>
        <h1 className="font-display text-6xl leading-none md:text-7xl">{p.title}</h1>
        {p.description && <p className="mt-3 max-w-2xl text-white/85">{p.description}</p>}
        <p className="mt-3 flex items-center gap-3 text-sm text-white/80">
          {CATEGORY_LABELS[p.category as Category]} · {p.tracks.length} tracks · {p.language} · <Dots n={p.difficulty} />
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {logged ? (
            <Link href={`/live?playlist=${p.id}`} className="btn btn-primary">▶ Start live</Link>
          ) : (
            <a href={loginUrl} className="btn btn-primary">Log in to start</a>
          )}
          {logged && p.isOwner && <Link href={`/studio/${p.id}`} className="btn">Edit</Link>}
          {logged && !p.isOwner && (
            <button className="btn" disabled={fork.isPending} onClick={() => fork.mutate()}>
              Duplicate and edit
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h2 className="mb-3 font-display text-2xl tracking-wide">Tracks</h2>
        {!p.isOwner && <p className="mb-3 text-sm text-text1">Titles remain hidden so they do not spoil the game.</p>}
        <ol className="divide-y divide-white/5">
          {p.tracks.map((t, i) => (
            <li key={t.id} className="flex items-center gap-4 py-2 text-sm">
              <span className="w-8 text-text1 tabular-nums">{i + 1}</span>
              <span className="flex-1">{p.isOwner ? t.displayTitle : "Mystery track"}</span>
              {!t.embeddable && <span className="text-xs text-gold">not embeddable</span>}
              <span className="text-text1 tabular-nums">{t.duration} s</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
