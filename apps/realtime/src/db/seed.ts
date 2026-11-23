import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { isGrouped, PlaylistImport, extractYoutubeId } from "@beatdrop/shared";
import { db, schema } from "./index";

const file = new URL("../../../../examples/blindtest-hits.json", import.meta.url);
const input = PlaylistImport.parse(JSON.parse(readFileSync(file, "utf8")));

const [exists] = await db.select({ id: schema.playlists.id }).from(schema.playlists).where(eq(schema.playlists.title, input.title));
if (exists) {
  console.log("✔ Demo playlist already exists; nothing to do.");
  process.exit(0);
}

await db.transaction(async (tx) => {
  const [p] = await tx
    .insert(schema.playlists)
    .values({
      ownerId: null,
      title: input.title,
      description: input.description ?? null,
      category: input.category,
      language: input.language,
      difficulty: input.difficulty,
      tags: input.tags,
      visibility: "public",
    })
    .returning({ id: schema.playlists.id });
  await tx.insert(schema.tracks).values(
    input.tracks.map((t, i) => ({
      playlistId: p.id,
      position: i,
      youtubeId: extractYoutubeId(t.youtubeUrl)!,
      startTime: t.startTime,
      duration: t.duration,
      displayTitle: t.displayTitle,
      acceptedAnswers: t.acceptedAnswers,
      matchMode: t.matchMode ?? (isGrouped(t.acceptedAnswers) ? "all" : "any"),
      difficulty: t.difficulty ?? null,
      hint: t.hint ?? null,
      sourceTitle: t.sourceTitle ?? null,
    })),
  );
});
console.log(`✔ Demo playlist "${input.title}" created (${input.tracks.length} tracks).`);
process.exit(0);
