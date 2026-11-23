export interface ScoreCfg {
  basePoints: number;
  speedBonus: boolean;
  firstBonus: number;
  streakBonus: boolean;
  everyoneCanWin: boolean;
}

export interface ScoreInput {
  elapsedMs: number;
  durationMs: number;
  rank: number;
  previousStreak: number;
  difficultyMultiplier: number;
  inGrace: boolean;
  cfg: ScoreCfg;
}

export const difficultyMultiplier = (d: number) => (d >= 3 ? 1.5 : d === 2 ? 1.25 : 1);

export function computeScore(i: ScoreInput): number {
  const { cfg } = i;
  if (cfg.everyoneCanWin) return Math.round(cfg.basePoints * i.difficultyMultiplier);
  const clamped = Math.max(0, Math.min(i.elapsedMs, i.durationMs));
  const speed = cfg.speedBonus && !i.inGrace ? Math.round(100 * (1 - clamped / i.durationMs)) : 0;
  const first = i.rank === 1 ? cfg.firstBonus : 0;
  const streak = cfg.streakBonus ? Math.min(50, i.previousStreak * 10) : 0;
  return Math.round((cfg.basePoints + speed + first + streak) * i.difficultyMultiplier);
}
