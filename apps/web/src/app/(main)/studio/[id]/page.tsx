"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CATEGORIES, CATEGORY_LABELS, extractYoutubeId } from "@beatdrop/shared";
import { ApiError, api, loginUrl, useMe, type PlaylistDetail } from "@/lib/api";
import { formatAnswers, isGroupedAnswers, parseAnswers } from "@/lib/answers";

interface TrackForm {
  key: string;
  youtubeUrl: string;
  startTime: number;
  duration: number;
  displayTitle: string;
  answers: string;
  matchMode: "any" | "all";
  hint: string;
  difficulty: number; // 0 = inherit from the playlist
  sourceTitle: string;
}
interface Form {
  title: string;
  description: string;
  category: string;
  language: string;
  difficulty: number;
  visibility: "private" | "unlisted" | "public";
  tags: string;
  tracks: TrackForm[];
}

const uid = () => Math.random().toString(36).slice(2);
const emptyTrack = (): TrackForm => ({ key: uid(), youtubeUrl: "", startTime: 0, duration: 30, displayTitle: "", answers: "", matchMode: "any", hint: "", difficulty: 0, sourceTitle: "" });
const emptyForm = (): Form => ({ title: "", description: "", category: "pop", language: "FR", difficulty: 2, visibility: "private", tags: "", tracks: [emptyTrack()] });

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [form, setForm] = useState<Form>(emptyForm);
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({ queryKey: ["playlist", id], queryFn: () => api<PlaylistDetail>(`/api/playlists/${id}`), enabled: !isNew && !!me?.user });

  useEffect(() => {
    if (!data) return;
    setForm({
      title: data.title,
      description: data.description ?? "",
      category: data.category,
      language: data.language,
      difficulty: data.difficulty,
      visibility: data.visibility as Form["visibility"],
      tags: data.tags.join(", "),
      tracks: data.tracks.map((t) => ({
        key: t.id,
        youtubeUrl: `https://www.youtube.com/watch?v=${t.youtubeId}`,
        startTime: t.startTime ?? 0,
        duration: t.duration,
        displayTitle: t.displayTitle ?? "",
        answers: formatAnswers(t.acceptedAnswers ?? []),
        matchMode: t.matchMode === "all" ? "all" : "any",
        hint: t.hint ?? "",
        difficulty: t.difficulty ?? 0,
        sourceTitle: t.sourceTitle ?? "",
      })),
    });
  }, [data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTrack = (i: number, patch: Partial<TrackForm>) => setForm((f) => ({ ...f, tracks: f.tracks.map((t, j) => (j === i ? { ...t, ...patch } : t)) }));
  const move = (i: number, d: -1 | 1) =>
    setForm((f) => {
      const j = i + d;
      if (j < 0 || j >= f.tracks.length) return f;
      const tracks = [...f.tracks];
      [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      return { ...f, tracks };
    });

  async function save() {
    setSaving(true);
    setMsg(null);
    const body = {
      schemaVersion: 1,
      title: form.title,
      description: form.description || undefined,
      category: form.category,
      language: form.language.toUpperCase(),
      difficulty: form.difficulty,
      visibility: form.visibility,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      tracks: form.tracks.map((t) => ({
        youtubeUrl: t.youtubeUrl.trim(),
        startTime: t.startTime,
        duration: t.duration,
        acceptedAnswers: parseAnswers(t.answers),
        displayTitle: t.displayTitle,
        sourceTitle: t.sourceTitle || undefined,
        difficulty: t.difficulty || undefined,
        hint: t.hint || undefined,
        matchMode: isGroupedAnswers(t.answers) ? t.matchMode : undefined,
      })),
    };
    try {
      const r = await api<{ id: string; warnings: string[] }>(isNew ? "/api/playlists" : `/api/playlists/${id}`, { method: isNew ? "POST" : "PUT", body });
      await qc.invalidateQueries({ queryKey: ["mine"] });
      await qc.invalidateQueries({ queryKey: ["playlist", r.id] });
      setMsg({ ok: true, lines: ["Saved.", ...r.warnings] });
      if (isNew) router.replace(`/studio/${r.id}`);
    } catch (e) {
      const err = e as ApiError;
      setMsg({ ok: false, lines: err.errors.length ? err.errors : [err.message] });
    } finally {
      setSaving(false);
    }
  }

  if (!me?.user)
    return (
      <div className="panel space-y-3">
        <p>Log in with Twitch to edit a music quiz.</p>
        <a href={loginUrl} className="btn btn-primary">Log in with Twitch</a>
      </div>
    );
  if (!isNew && data && !data.isOwner) return <div className="panel">You do not own this music quiz. You can duplicate it from its page.</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/studio" className="text-text1 hover:text-white">← Back</Link>
        <h1 className="flex-1 font-display text-4xl">{isNew ? "New music quiz" : "Edit"}</h1>
        {!isNew && <Link href={`/live?playlist=${id}`} className="btn">▶ Live</Link>}
        <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
      </div>

      {msg && (
        <ul className={`panel space-y-1 text-sm ${msg.ok ? "text-accent2" : "text-accent"}`}>
          {msg.lines.map((l, i) => <li key={i}>{l}</li>)}
        </ul>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className="panel h-fit space-y-3">
          <label className="block space-y-1 text-sm text-text1">Title
            <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={80} />
          </label>
          <label className="block space-y-1 text-sm text-text1">Description
            <textarea className="input h-20" value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={500} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm text-text1">Category
              <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm text-text1">Language
              <input className="input" value={form.language} maxLength={2} onChange={(e) => set("language", e.target.value.toUpperCase())} />
            </label>
            <label className="space-y-1 text-sm text-text1">Difficulty
              <select className="input" value={form.difficulty} onChange={(e) => set("difficulty", +e.target.value)}>
                <option value={1}>1 – Easy</option><option value={2}>2 – Medium</option><option value={3}>3 – Hard</option>
              </select>
            </label>
            <label className="space-y-1 text-sm text-text1">Visibility
              <select className="input" value={form.visibility} onChange={(e) => set("visibility", e.target.value as Form["visibility"])}>
                <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm text-text1">Tags (comma-separated)
            <input className="input" value={form.tags} onChange={(e) => set("tags", e.target.value)} />
          </label>
        </section>

        <section className="space-y-4">
          {form.tracks.map((t, i) => {
            const vid = extractYoutubeId(t.youtubeUrl);
            return (
              <div key={t.key} className="panel space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 font-mono text-text1">#{i + 1}</span>
                  <input className="input" placeholder="https://www.youtube.com/watch?v=…" value={t.youtubeUrl} onChange={(e) => setTrack(i, { youtubeUrl: e.target.value })} />
                  <span title={vid ? "YouTube ID detected" : "URL not recognized"} className={vid ? "text-accent2" : "text-accent"}>{vid ? "✓" : "✗"}</span>
                  <button className="btn btn-ghost" aria-label="Move up" onClick={() => move(i, -1)}>↑</button>
                  <button className="btn btn-ghost" aria-label="Move down" onClick={() => move(i, 1)}>↓</button>
                  <button className="btn btn-ghost" aria-label="Duplicate" onClick={() => setForm((f) => ({ ...f, tracks: [...f.tracks.slice(0, i + 1), { ...t, key: uid() }, ...f.tracks.slice(i + 1)] }))}>⧉</button>
                  <button className="btn btn-ghost" aria-label="Delete" disabled={form.tracks.length === 1} onClick={() => setForm((f) => ({ ...f, tracks: f.tracks.filter((_, j) => j !== i) }))}>🗑</button>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_90px_90px_110px]">
                  <input className="input" placeholder="Title shown at reveal" value={t.displayTitle} onChange={(e) => setTrack(i, { displayTitle: e.target.value })} />
                  <label className="text-xs text-text1">Start (s)
                    <input type="number" min={0} className="input" value={t.startTime} onChange={(e) => setTrack(i, { startTime: Math.max(0, +e.target.value || 0) })} />
                  </label>
                  <label className="text-xs text-text1">Duration (s)
                    <input type="number" min={5} max={120} className="input" value={t.duration} onChange={(e) => setTrack(i, { duration: +e.target.value || 30 })} />
                  </label>
                  <label className="text-xs text-text1">Difficulty
                    <select className="input" value={t.difficulty} onChange={(e) => setTrack(i, { difficulty: +e.target.value })}>
                      <option value={0}>Inherit</option><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                    </select>
                  </label>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <input
                      className="input"
                      placeholder="Accepted answers: Pokémon, Pokemon — groups: Daft Punk, Daftpunk ; One More Time, 1 more time"
                      value={t.answers}
                      onChange={(e) => setTrack(i, { answers: e.target.value })}
                    />
                    <button className="btn btn-ghost whitespace-nowrap" onClick={() => setTrack(i, { answers: t.displayTitle.split(/\s[-–]\s/).map((s) => s.trim()).filter(Boolean).join(", ") })}>
                      Suggest
                    </button>
                  </div>
                  {isGroupedAnswers(t.answers) && (
                    <label className="flex items-center gap-2 text-xs text-text1">
                      Groups:
                      <select className="input w-auto" value={t.matchMode} onChange={(e) => setTrack(i, { matchMode: e.target.value as "any" | "all" })}>
                        <option value="all">all required (artist AND title)</option>
                        <option value="any">one is enough</option>
                      </select>
                    </label>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input className="input" placeholder="Hint (optional)" value={t.hint} onChange={(e) => setTrack(i, { hint: e.target.value })} />
                  <input className="input" placeholder="Original work (optional)" value={t.sourceTitle} onChange={(e) => setTrack(i, { sourceTitle: e.target.value })} />
                </div>
              </div>
            );
          })}
          <button className="btn w-full" onClick={() => set("tracks", [...form.tracks, emptyTrack()])}>+ Add a track</button>
        </section>
      </div>
    </div>
  );
}
