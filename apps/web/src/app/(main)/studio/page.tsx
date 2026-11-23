"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api, loginUrl, useMe, type PlaylistSummary } from "@/lib/api";

export default function Studio() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: list, isLoading } = useQuery({ queryKey: ["mine"], queryFn: () => api<PlaylistSummary[]>("/api/playlists"), enabled: !!me?.user });
  const [json, setJson] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; lines: string[] } | null>(null);

  const imp = useMutation({
    mutationFn: async () => {
      let body: unknown;
      try { body = JSON.parse(json); } catch { throw new ApiError("Invalid JSON", ["The pasted text is not valid JSON."]); }
      return api<{ id: string; warnings: string[] }>("/api/playlists", { method: "POST", body });
    },
    onSuccess: (r) => {
      setMsg({ ok: true, lines: r.warnings.length ? r.warnings : ["Import successful."] });
      setJson("");
      qc.invalidateQueries({ queryKey: ["mine"] });
      router.push(`/studio/${r.id}`);
    },
    onError: (e: ApiError) => setMsg({ ok: false, lines: e.errors.length ? e.errors : [e.message] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/api/playlists/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mine"] }),
  });

  async function exportJson(p: PlaylistSummary) {
    const data = await api<unknown>(`/api/playlists/${p.id}/export`);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${p.title.replace(/[^\w-]+/g, "_")}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!me?.user)
    return (
      <div className="panel space-y-3">
        <p>Log in with Twitch to create and manage your music quizzes.</p>
        <a href={loginUrl} className="btn btn-primary">Log in with Twitch</a>
      </div>
    );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-5xl">My music quizzes</h1>
        <Link href="/studio/new" className="btn btn-primary">+ New music quiz</Link>
      </div>

      <div className="panel">
        {isLoading && <div className="h-16 animate-pulse rounded bg-bg2" />}
        {list?.length === 0 && <p className="text-text1">No music quizzes yet: create one or import a JSON file below.</p>}
        <ul className="divide-y divide-white/5">
          {list?.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/b/${p.id}`} className="font-semibold hover:text-accent2">{p.title}</Link>
                <div className="text-xs text-text1">{p.trackCount} tracks · {p.language} · {p.visibility}</div>
              </div>
              <Link href={`/live?playlist=${p.id}`} className="btn btn-primary">▶ Live</Link>
              <Link href={`/studio/${p.id}`} className="btn">Edit</Link>
              <button className="btn btn-ghost" onClick={() => exportJson(p)}>Export</button>
              <button className="btn btn-ghost" onClick={() => confirm(`Delete "${p.title}"?`) && del.mutate(p.id)}>Delete</button>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel space-y-3">
        <h2 className="font-display text-2xl tracking-wide">Import JSON</h2>
        <p className="text-sm text-text1">Paste a BeatDrop v1 file (see <code className="rounded bg-bg2 px-1">examples/blindtest-hits.json</code>) or load it from disk.</p>
        <input
          type="file"
          accept="application/json,.json"
          className="text-sm"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) setJson(await f.text()); }}
        />
        <textarea className="input h-48 font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} placeholder='{ "schemaVersion": 1, "title": "…", "tracks": [ … ] }' />
        <button className="btn btn-primary" disabled={!json.trim() || imp.isPending} onClick={() => imp.mutate()}>
          {imp.isPending ? "Validating…" : "Validate and import"}
        </button>
        {msg && (
          <ul className={`space-y-1 text-sm ${msg.ok ? "text-gold" : "text-accent"}`}>
            {msg.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
