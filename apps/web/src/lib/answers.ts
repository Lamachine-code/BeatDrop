/** « Daft Punk, Daftpunk ; One More Time, 1 more time » ⇄ groupes de variantes. */
export function formatAnswers(a: string[] | string[][]): string {
  return Array.isArray(a[0]) ? (a as string[][]).map((g) => g.join(", ")).join(" ; ") : (a as string[]).join(", ");
}

export function parseAnswers(s: string): string[] | string[][] {
  const groups = s
    .split(";")
    .map((g) => g.split(",").map((x) => x.trim()).filter(Boolean))
    .filter((g) => g.length);
  return groups.length <= 1 ? (groups[0] ?? []) : groups;
}

export const isGroupedAnswers = (s: string) => s.includes(";");
