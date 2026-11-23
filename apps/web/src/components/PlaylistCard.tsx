import Link from "next/link";
import { CATEGORY_LABELS, type Category } from "@beatdrop/shared";
import type { PlaylistSummary } from "@/lib/api";

export const GRADIENTS: Record<string, string> = {
  cartoon: "from-[#ff9a3c] to-[#ff2e63]",
  movie: "from-[#7c3aed] to-[#14141c]",
  videogame: "from-[#08d9d6] to-[#1e1e2a]",
  anime: "from-[#ff2e63] to-[#7c3aed]",
  series: "from-[#3b82f6] to-[#14141c]",
  pop: "from-[#ffc845] to-[#ff2e63]",
  other: "from-[#475569] to-[#14141c]",
};

export const Dots = ({ n }: { n: number }) => (
  <span aria-label={`Difficulty ${n} of 3`} className="tracking-widest text-gold">
    {"●".repeat(n)}
    <span className="text-white/20">{"●".repeat(3 - n)}</span>
  </span>
);

export function PlaylistCard({ p }: { p: PlaylistSummary }) {
  return (
    <Link href={`/b/${p.id}`} className="group block overflow-hidden rounded-xl bg-bg1 transition duration-200 hover:scale-[1.04] hover:shadow-[0_12px_40px_-12px_rgba(255,46,99,0.45)]">
      <div className={`relative flex aspect-[4/3] items-end bg-gradient-to-br p-3 ${GRADIENTS[p.category] ?? GRADIENTS.other}`}>
        <span className="font-display text-3xl leading-none text-white drop-shadow">{p.title}</span>
        <span className="absolute right-2 top-2 rounded-full bg-black/40 px-2 py-0.5 text-xs">{p.language}</span>
      </div>
      <div className="space-y-1 p-3 text-xs text-text1">
        <div className="flex items-center justify-between">
          <span>{CATEGORY_LABELS[p.category as Category] ?? p.category}</span>
          <Dots n={p.difficulty} />
        </div>
        <div>
          {p.trackCount} tracks{p.ownerName ? ` · by ${p.ownerName}` : ""}
        </div>
      </div>
    </Link>
  );
}
