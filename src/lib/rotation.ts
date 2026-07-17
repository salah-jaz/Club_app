import type { Rotation, RotationRound } from "./types";

/**
 * Generate balanced court rotation.
 * @param rankByPlayerId optional map of playerId → grade rank (lower = stronger).
 *   Guests / unknown should use maxRank+1. When provided, courts are filled with
 *   similar ranks together instead of shuffling.
 */
export function generateBalancedRotation(
  scheduleId: string,
  playerIds: string[],
  courts: number,
  rounds = 5,
  rankByPlayerId?: Record<string, number>,
): Rotation {
  const playersPerCourt = 4;
  const slots = courts * playersPerCourt;
  const playCount: Record<string, number> = {};
  playerIds.forEach((p) => (playCount[p] = 0));
  const defaultRank = 999;
  const rankOf = (id: string) => rankByPlayerId?.[id] ?? defaultRank;

  const result: RotationRound[] = [];
  for (let r = 1; r <= rounds; r++) {
    // Fairness: fewer rounds played → more likely to play this round
    const sorted = [...playerIds].sort((a, b) => {
      const d = playCount[a] - playCount[b];
      if (d !== 0) return d;
      const rd = rankOf(a) - rankOf(b);
      if (rd !== 0) return rd;
      return a.localeCompare(b);
    });
    const playing = sorted.slice(0, slots);
    const resting = sorted.slice(slots);

    if (rankByPlayerId) {
      // Similar ranks on the same court
      playing.sort((a, b) => {
        const rd = rankOf(a) - rankOf(b);
        if (rd !== 0) return rd;
        const d = playCount[a] - playCount[b];
        if (d !== 0) return d;
        return a.localeCompare(b);
      });
    } else {
      // Legacy: shuffle for variety when ranks unavailable
      for (let i = playing.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playing[i], playing[j]] = [playing[j], playing[i]];
      }
    }

    const courtsArr = [];
    for (let c = 0; c < courts; c++) {
      const slice = playing.slice(c * playersPerCourt, (c + 1) * playersPerCourt);
      courtsArr.push({ courtNo: c + 1, players: slice });
      slice.forEach((p) => (playCount[p] += 1));
    }
    result.push({ round: r, courts: courtsArr, resting });
  }
  return { scheduleId, rounds: result };
}

export function generateWeeklyDates(
  start: string,
  sessions: number,
  holidays: string[] = [],
): string[] {
  const result: string[] = [];
  const cur = new Date(start);
  let safety = 0;
  while (result.length < sessions && safety < 200) {
    const iso = cur.toISOString().slice(0, 10);
    if (!holidays.includes(iso)) result.push(iso);
    cur.setDate(cur.getDate() + 7);
    safety++;
  }
  return result;
}
