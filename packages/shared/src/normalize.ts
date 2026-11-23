const STOP = /^(le|la|les|l|the|a|un|une)\s+/;

/** Normalization applied to both expected answers and chat messages. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(STOP, "");
}
