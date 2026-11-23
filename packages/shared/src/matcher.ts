import { distance } from "fastest-levenshtein";
import { normalize } from "./normalize";

/** Maximum tolerated Levenshtein distance based on the expected answer length. */
export const maxDist = (len: number) => (len <= 4 ? 0 : len <= 8 ? 1 : len <= 15 ? 2 : 3);

/** Does the message contain one variant (n-word sliding window)? */
function matchesVariant(msgNorm: string, variant: string): boolean {
  const target = normalize(variant);
  if (!target) return false;
  const tol = maxDist(target.length);
  const msgWords = msgNorm.split(" ");
  const n = target.split(" ").length;
  for (let i = 0; i + n <= msgWords.length; i++) {
    const window = msgWords.slice(i, i + n).join(" ");
    if (distance(window, target) <= tol) return true;
  }
  return false;
}

export type Accepted = string[] | string[][];

export function isGrouped(accepted: Accepted): accepted is string[][] {
  return Array.isArray(accepted[0]);
}

export function isCorrect(message: string, accepted: Accepted, mode: "any" | "all" = "any"): boolean {
  const msg = normalize(message);
  if (!msg || msg.length > 200 || accepted.length === 0) return false;

  const groups: string[][] = isGrouped(accepted) ? accepted : [accepted as string[]];
  const groupHit = (g: string[]) => g.some((v) => matchesVariant(msg, v));

  if (groups.length === 1) return groupHit(groups[0]);
  return mode === "all" ? groups.every(groupHit) : groups.some(groupHit);
}
