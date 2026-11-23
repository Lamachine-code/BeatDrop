import { describe, expect, it } from "vitest";
import { isCorrect, normalize, computeScore } from "../src";

describe("normalize", () => {
  it("retire accents, ponctuation, articles", () => {
    expect(normalize("Pokémon !")).toBe("pokemon");
    expect(normalize("Le Roi Lion (Disney)")).toBe("roi lion");
    expect(normalize("L'Été indien")).toBe("ete indien");
    expect(normalize("Cœur & Âme")).toBe("coeur et ame");
  });
});

describe("isCorrect", () => {
  const poke = ["Pokémon", "Pokemon"];
  it("gère les accents", () => expect(isCorrect("pokemon", poke)).toBe(true));
  it("tolère une faute", () => expect(isCorrect("pokemone", poke)).toBe(true));
  it("accepte un message bruité", () => expect(isCorrect("c'est pokemon non", poke)).toBe(true));
  it("refuse les faux positifs sur mots courts (≤ 4 car.)", () => expect(isCorrect("zara", ["Lara"])).toBe(false));
  it("tolère 1 faute à partir de 5 caractères", () => expect(isCorrect("mari0", ["Mario"])).toBe(true));
  it("exige l'exactitude jusqu'à 4 caractères", () => {
    expect(isCorrect("zelda", ["Zeld"])).toBe(false);
    expect(isCorrect("zeld", ["Zeld"])).toBe(true);
    expect(isCorrect("zela", ["Zeld"])).toBe(false);
  });
  it("refuse un autre mot", () => expect(isCorrect("digimon", poke)).toBe(false));
  it("groupes en mode all", () => {
    const g = [["Daft Punk", "Daftpunk"], ["One More Time", "1 more time"]];
    expect(isCorrect("daft punk one more time", g, "all")).toBe(true);
    expect(isCorrect("daft punk", g, "all")).toBe(false);
    expect(isCorrect("daft punk", g, "any")).toBe(true);
  });
  it("ignore les messages trop longs", () => expect(isCorrect("pokemon ".repeat(40), poke)).toBe(false));
});

describe("computeScore", () => {
  const cfg = { basePoints: 100, speedBonus: true, firstBonus: 50, streakBonus: true, everyoneCanWin: false };
  const base = { elapsedMs: 0, durationMs: 30000, rank: 1, previousStreak: 0, difficultyMultiplier: 1, inGrace: false, cfg };
  it("premier et immédiat = 250", () => expect(computeScore(base)).toBe(250));
  it("pas de bonus rapidité en grace", () => expect(computeScore({ ...base, inGrace: true })).toBe(150));
  it("série plafonnée à +50", () => expect(computeScore({ ...base, rank: 2, elapsedMs: 30000, previousStreak: 9 })).toBe(150));
  it("tout le monde peut gagner", () => expect(computeScore({ ...base, cfg: { ...cfg, everyoneCanWin: true }, rank: 5 })).toBe(100));
});
