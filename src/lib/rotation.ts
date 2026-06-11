import type { Rotation, RotationRound } from "./types";

export function generateBalancedRotation(
  scheduleId: string,
  playerIds: string[],
  courts: number,
  rounds = 5,
): Rotation {
  const playersPerCourt = 4;
  const slots = courts * playersPerCourt;
  const playCount: Record<string, number> = {};
  playerIds.forEach((p) => (playCount[p] = 0));

  const result: RotationRound[] = [];
  for (let r = 1; r <= rounds; r++) {
    // Sort ascending by play count, tie-break random
    const sorted = [...playerIds].sort((a, b) => {
      const d = playCount[a] - playCount[b];
      return d !== 0 ? d : Math.random() - 0.5;
    });
    const playing = sorted.slice(0, slots);
    const resting = sorted.slice(slots);
    // shuffle playing for variety
    for (let i = playing.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playing[i], playing[j]] = [playing[j], playing[i]];
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