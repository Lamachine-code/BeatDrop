import { env } from "./env";

export interface VideoCheck {
  embeddable: boolean;
  durationSec: number | null;
}

function parseIsoDuration(iso: string): number | null {
  const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, d, h, mi, s] = m.map((x) => (x ? Number(x) : 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

/**
 * Batch-checks up to 50 IDs per request for existence, embeddability, and duration.
 * Returns null if YOUTUBE_API_KEY is not configured (check skipped).
 * IDs missing from the map are unavailable or private.
 */
export async function checkVideos(ids: string[]): Promise<Map<string, VideoCheck> | null> {
  if (!env.YOUTUBE_API_KEY) return null;
  const out = new Map<string, VideoCheck>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "status,contentDetails");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", env.YOUTUBE_API_KEY);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube Data API responded with ${res.status}`);
    const json = (await res.json()) as {
      items?: { id: string; status?: { embeddable?: boolean }; contentDetails?: { duration?: string } }[];
    };
    for (const it of json.items ?? []) {
      out.set(it.id, {
        embeddable: it.status?.embeddable !== false,
        durationSec: it.contentDetails?.duration ? parseIsoDuration(it.contentDetails.duration) : null,
      });
    }
  }
  return out;
}
