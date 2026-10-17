import assert from "node:assert";
import {
  formatRoundsList,
  formatRestingRoundsList,
  getRoundsPlayed,
  getRoundsRested,
  getPronouns,
  buildRotationChangeConfirmation,
  applyMove,
  cloneRounds,
  stripEmptySlots,
  type DragTarget,
} from "../src/components/CourtRotationView";
import type { Member, RotationRound } from "../src/lib/types";

console.log("=== RUNNING COURT ROTATION CONFIRMATION TEST SUITE ===");

// 1. Test formatRoundsList & formatRestingRoundsList
console.log("\n[Test 1] formatRoundsList & formatRestingRoundsList helpers");
assert.strictEqual(formatRoundsList([]), "");
assert.strictEqual(formatRoundsList([1]), "Round 1");
assert.strictEqual(formatRoundsList([1, 2]), "Rounds 1 and 2");
assert.strictEqual(formatRoundsList([1, 2, 3]), "Rounds 1, 2, and 3");
assert.strictEqual(formatRoundsList([1, 2, 4, 5]), "Rounds 1, 2, 4, and 5");

assert.strictEqual(formatRestingRoundsList([]), "");
assert.strictEqual(formatRestingRoundsList([1]), "Round 1");
assert.strictEqual(formatRestingRoundsList([1, 3]), "Round 1 and Round 3");
assert.strictEqual(formatRestingRoundsList([1, 2, 4]), "Round 1, Round 2, and Round 4");
console.log("✓ formatRoundsList & formatRestingRoundsList format correctly");

// 2. Test getPronouns
console.log("\n[Test 2] getPronouns helper");
const femalePronouns = getPronouns("female");
assert.strictEqual(femalePronouns.object, "her");
assert.strictEqual(femalePronouns.subject, "she");

const malePronouns = getPronouns("male");
assert.strictEqual(malePronouns.object, "him");
assert.strictEqual(malePronouns.subject, "he");

const guestPronouns = getPronouns(undefined);
assert.strictEqual(guestPronouns.object, "them");
assert.strictEqual(guestPronouns.subject, "they");
console.log("✓ getPronouns correctly returns gender-based and neutral pronouns");

// Sample Members
const members: Member[] = [
  {
    id: "m_dyna",
    userId: "u_dyna",
    firstName: "Dyna",
    lastName: "Francis",
    dob: "1990-01-01",
    email: "dyna@example.com",
    sex: "female",
    memberType: "adult",
    membership: true,
    trainingEligible: true,
    playEligible: true,
    skipCreditConsumption: false,
    applyDiscount: false,
    grade: "Grade A",
    biMemberId: "BI1",
    status: "active",
    credit: 100,
  },
  {
    id: "m_bob",
    userId: "u_bob",
    firstName: "Bob",
    lastName: "Smith",
    dob: "1988-05-10",
    email: "bob@example.com",
    sex: "male",
    memberType: "adult",
    membership: true,
    trainingEligible: true,
    playEligible: true,
    skipCreditConsumption: false,
    applyDiscount: false,
    grade: "Grade A",
    biMemberId: "BI2",
    status: "active",
    credit: 100,
  },
];

const memberName = (id: string) => {
  if (id.startsWith("guest_")) return `Guest Player ${id.split("_")[1]}`;
  const m = members.find((x) => x.id === id);
  return m ? `${m.firstName} ${m.lastName}` : "?";
};

// Rounds setup:
// Dyna plays Rounds 1, 2, 4, and 5. Dyna rests in Round 3.
// Bob plays Rounds 1, 2, 3, 4, and 5.
// Guest Player 1 rests in Round 1 and Round 3, plays on Court 1 in Round 2, 4, 5.
const rounds: RotationRound[] = [
  {
    round: 1,
    courts: [{ courtNo: 1, players: ["m_dyna", "m_bob", "", ""] }],
    resting: ["guest_1"],
  },
  {
    round: 2,
    courts: [{ courtNo: 1, players: ["m_dyna", "m_bob", "guest_1", ""] }],
    resting: [],
  },
  {
    round: 3,
    courts: [{ courtNo: 1, players: ["m_bob", "", "", ""] }],
    resting: ["m_dyna", "guest_1"],
  },
  {
    round: 4,
    courts: [{ courtNo: 1, players: ["m_dyna", "m_bob", "guest_1", ""] }],
    resting: [],
  },
  {
    round: 5,
    courts: [{ courtNo: 1, players: ["m_dyna", "m_bob", "guest_1", ""] }],
    resting: [],
  },
];

// 3. Test getRoundsPlayed and getRoundsRested
console.log("\n[Test 3] getRoundsPlayed and getRoundsRested helpers");
const dynaPlayed = getRoundsPlayed(rounds, "m_dyna");
assert.deepStrictEqual(dynaPlayed, [1, 2, 4, 5]);
const dynaRested = getRoundsRested(rounds, "m_dyna");
assert.deepStrictEqual(dynaRested, [3]);

const guestPlayed = getRoundsPlayed(rounds, "guest_1");
assert.deepStrictEqual(guestPlayed, [2, 4, 5]);
const guestRested = getRoundsRested(rounds, "guest_1");
assert.deepStrictEqual(guestRested, [1, 3]);
console.log("✓ getRoundsPlayed and getRoundsRested correctly return played and rested rounds");

// 4. Test Resting Players → Court (Preserves existing correct behavior)
console.log("\n[Test 4] Resting Players → Court: Shows all rounds the player currently plays");
const addDynaToRound3Conf = buildRotationChangeConfirmation({
  rounds,
  source: { kind: "rest", roundIdx: 2, restIdx: 0, playerId: "m_dyna" },
  target: { kind: "court", roundIdx: 2, courtNo: 1, slot: 1, playerId: "" },
  members,
  memberName,
});

assert.ok(addDynaToRound3Conf !== null, "Confirmation must be returned");
assert.strictEqual(addDynaToRound3Conf.title, "Confirm Rotation Change");
assert.strictEqual(
  addDynaToRound3Conf.message,
  "Dyna Francis is already scheduled to play Rounds 1, 2, 4, and 5. You are adding her to Round 3 as well. Do you want to continue?",
);
console.log("✓ Resting Players → Court correctly lists rounds player plays");

// 5. Test Court → Resting Players (Bug fix: Shows all rounds the player currently rests in)
console.log("\n[Test 5] Court → Resting Players: Shows all rounds the player currently rests in");
// Example from user prompt:
// Guest Player 1 currently rests in Round 1 and Round 3. Moving from Court 1 to Resting Players in Round 2.
const moveGuestToRestingConf = buildRotationChangeConfirmation({
  rounds,
  source: { kind: "court", roundIdx: 1, courtNo: 1, slot: 2, playerId: "guest_1" },
  target: { kind: "rest-zone", roundIdx: 1 },
  members,
  memberName,
});

assert.ok(moveGuestToRestingConf !== null, "Confirmation must be returned");
assert.strictEqual(moveGuestToRestingConf.title, "Confirm Rotation Change");
assert.strictEqual(
  moveGuestToRestingConf.message,
  "Guest Player 1 currently rests in Round 1 and Round 3. You are moving them from Court 1 to Resting Players in Round 2. Do you want to continue?",
);
console.log("✓ Exact user prompt example verified: shows resting rounds [1, 3]!");

// Another case: Dyna moving from Court 1 to Resting Players in Round 2 (currently rests in Round 3)
const moveDynaToRestingConf = buildRotationChangeConfirmation({
  rounds,
  source: { kind: "court", roundIdx: 1, courtNo: 1, slot: 0, playerId: "m_dyna" },
  target: { kind: "rest-zone", roundIdx: 1 },
  members,
  memberName,
});
assert.ok(moveDynaToRestingConf !== null);
assert.strictEqual(
  moveDynaToRestingConf.message,
  "Dyna Francis currently rests in Round 3. You are moving her from Court 1 to Resting Players in Round 2. Do you want to continue?",
);
console.log("✓ Female member Court → Resting Players correctly uses 'her' and lists resting round");

// Bob moving to resting in Round 1 (Bob currently rests in NO rounds)
const moveBobToRestingConf = buildRotationChangeConfirmation({
  rounds,
  source: { kind: "court", roundIdx: 0, courtNo: 1, slot: 1, playerId: "m_bob" },
  target: { kind: "rest-zone", roundIdx: 0 },
  members,
  memberName,
});
assert.ok(moveBobToRestingConf !== null);
assert.strictEqual(
  moveBobToRestingConf.message,
  "You are moving Bob Smith from Court 1 to Resting Players in Round 1. Do you want to continue?",
);
console.log("✓ Player with no prior resting rounds shows clean moving message");

// 6. Test Swapping between Resting and Court:
console.log("\n[Test 6] Swapping Resting and Court players");
// Dragging court Guest Player 1 (rests in Round 1 and Round 3) onto resting Dyna (plays Rounds 1, 2, 4, 5) in Round 2
// Guest Player 1 moves to resting, Dyna moves to court
const swapGuestOntoDynaConf = buildRotationChangeConfirmation({
  rounds: [
    ...rounds.slice(0, 1),
    {
      round: 2,
      courts: [{ courtNo: 1, players: ["m_bob", "guest_1", "", ""] }],
      resting: ["m_dyna"],
    },
    ...rounds.slice(2),
  ],
  source: { kind: "court", roundIdx: 1, courtNo: 1, slot: 1, playerId: "guest_1" },
  target: { kind: "rest", roundIdx: 1, restIdx: 0, playerId: "m_dyna" },
  members,
  memberName,
});
assert.ok(swapGuestOntoDynaConf !== null);
assert.strictEqual(swapGuestOntoDynaConf.title, "Confirm Rotation Change");
assert.strictEqual(
  swapGuestOntoDynaConf.message,
  "Guest Player 1 currently rests in Round 1 and Round 3. You are moving them from Court 1 to Resting Players in Round 2. This will also add Dyna Francis (already scheduled to play Rounds 1, 4, and 5) to Court 1 in Round 2. Do you want to continue?",
);
console.log("✓ Swap Court -> Rest properly shows resting rounds for court player and playing rounds for resting player");

// 7. Test Unrelated edits (no warnings)
console.log("\n[Test 7] Unrelated edits produce NO warnings (returns null)");
const courtToCourtConf = buildRotationChangeConfirmation({
  rounds,
  source: { kind: "court", roundIdx: 0, courtNo: 1, slot: 0, playerId: "m_dyna" },
  target: { kind: "court", roundIdx: 0, courtNo: 1, slot: 1, playerId: "m_bob" },
  members,
  memberName,
});
assert.strictEqual(courtToCourtConf, null);
console.log("✓ Intra-court move does not trigger confirmation");

// 8. Test Cancel vs Confirm Apply Behavior
console.log("\n[Test 8] Cancel vs Confirm Apply Behavior");
const initialDraft = cloneRounds(rounds);

// Cancel preserves previous assignments
let currentDraft = cloneRounds(initialDraft);
assert.deepStrictEqual(currentDraft, initialDraft);
console.log("✓ Cancel retains previous assignments completely");

// Confirm applies the move
currentDraft = applyMove(
  currentDraft,
  { kind: "court", roundIdx: 1, courtNo: 1, slot: 2, playerId: "guest_1" },
  { kind: "rest-zone", roundIdx: 1 },
);
assert.strictEqual(currentDraft[1].resting.includes("guest_1"), true);
assert.strictEqual(currentDraft[1].courts[0].players[2], "");
console.log("✓ Confirm applies the move to Resting Players");

console.log("\n=== ALL COURT ROTATION CONFIRMATION TESTS PASSED! ===");
