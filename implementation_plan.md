# Shared Wallet Per Adult Account

## Summary

Currently, the system stores a `credit` balance on **every** member record (both adults and juniors). The `TrainingController` has a partial `getWalletMember()` helper that *tries* to use the parent's wallet when a junior has insufficient credit, but this is an opt-in fallback — juniors still have their own `credit` column that can hold a balance, and the play-session debit/refund logic in `PlayScheduleController` hits the junior's own `credit` directly.

The goal: **juniors have no independent wallet**. When any fee is charged for a junior (play session, training), it is always debited from their parent adult member's wallet. Credit/debit/refund requests targeted at a junior are also redirected to the parent. The `credit` column on junior rows should stay at `0.00` at all times (it remains in the schema for structural simplicity; we just don't use it).

---

## Design Decisions

> [!IMPORTANT]
> **No DB migration needed** — the `credit` column stays on all member rows. Junior rows will simply always have `0.00` (enforced in code). This avoids data loss for any existing junior balances that need to be migrated to parents first.

> [!WARNING]
> **Existing junior balances** — any existing non-zero junior `credit` amounts need to be migrated to their parent at deploy time. A one-time PHP migration script is included.

---

## Proposed Changes

### Backend — Core helper (shared wallet resolution)

The `getWalletMember()` in `TrainingController` already does *partial* wallet-sharing but only as a fallback. We'll harden it to **always** return the parent for a junior, regardless of balance.

#### [MODIFY] [TrainingController.php](file:///d:/Jaz%20Project/Club_app/backend/app/Http/Controllers/Api/TrainingController.php)

Change `getWalletMember()` at line 766:
- **Before**: Returns the member if they have enough credit, else tries the parent.
- **After**: If the member is a junior AND has a `parent_member_id`, always return the parent. Adults always return themselves.

---

### Backend — Play session debit/refund (PlayScheduleController)

The `debitPlayInvite()` and `refundPlayInvite()` methods directly modify `$member->credit`. They need to be updated to resolve the wallet member (parent if junior) before deducting/refunding.

#### [MODIFY] [PlayScheduleController.php](file:///d:/Jaz%20Project/Club_app/backend/app/Http/Controllers/Api/PlayScheduleController.php)

- `debitPlayInvite()` — resolve wallet member via parent lookup; debit wallet member; record transaction against wallet member; check balance against wallet member.
- `refundPlayInvite()` — refund to wallet member (parent if junior).
- `acceptNewlyEnrolledInvite()` — check credit against wallet member, not the junior directly.
- `acceptInvite()` (the RSVP endpoint) — same credit check fix.

---

### Backend — Credit Request Controller

The `CreditRequestController` handles manual credit/debit/refund. When `memberId` refers to a junior, all balance operations must flow through the parent.

#### [MODIFY] [CreditRequestController.php](file:///d:/Jaz%20Project/Club_app/backend/app/Http/Controllers/Api/CreditRequestController.php)

- Add a `resolveWalletMember(string $memberId): Member` helper.
- In `store()`, `approve()`, `destroy()` — resolve wallet member and apply balance changes there.
- In `storeDebit()` / `storeRefund()` — same.
- Transaction records still use the `walletMember->id` (the parent), so transaction history shows on the parent's wallet.
- The `CreditRequest` record itself keeps the *originally requested* `member_id` (the junior or adult as submitted) for auditability, but the balance change and transaction go to the parent.

---

### Backend — TransactionController

The `destroy()` (delete-transaction reversal) currently looks up `member_id` from the transaction and adjusts that member's credit. Since we now record transactions against the parent, this already works correctly — no change needed here for new transactions. Existing reversed transactions for junior rows may be stale but the controller handles that too.

---

### Backend — One-time data migration

#### [NEW] `2026_08_13_000001_migrate_junior_credit_to_parent.php`

A database migration that:
1. Finds all junior members with `credit > 0`.
2. Transfers that credit to their `parent_member_id`'s wallet.
3. Sets junior `credit = 0`.
4. Creates a transaction record for the transfer on the parent.

---

### Frontend — credits.tsx (Wallet page)

Currently when adding credit/debit/refund, the member combobox shows all members including juniors. When a junior is selected for a credit/debit/refund operation, the admin picks the junior but the backend now redirects to the parent. We need to:

- In the member combobox (when admin targets a member for credit/debit), show **only adult members** (since juniors share their parent's wallet).
- When viewing a junior's member page → Wallet, redirect to the parent's wallet instead.
- The "balance" shown for a junior in member cards/lists should display the parent's credit (since that is the effective wallet).

#### [MODIFY] [credits.tsx](file:///d:/Jaz%20Project/Club_app/src/routes/_authenticated/credits.tsx)

- Filter `addMembers` to **only adults** (juniors have no independent wallet).
- Update the member balance stat card: when `focusMember` is a junior, display the parent member's credit.

#### [MODIFY] [members.tsx](file:///d:/Jaz%20Project/Club_app/src/routes/_authenticated/members.tsx)

- The balance column for a junior row should show the parent's balance (with a note like "shared wallet").
- Or, optionally, show `—` for juniors since they don't have independent wallets.

#### [MODIFY] [transactions.tsx](file:///d:/Jaz%20Project/Club_app/src/routes/_authenticated/transactions.tsx)

- Filter member dropdown to adults only (transaction history for juniors now lives on the parent).

---

## Verification Plan

### Automated Tests
- `php artisan migrate` — runs the new migration.

### Manual Verification
1. Create a junior with a parent adult.
2. Enroll the junior in a play session and accept → debit should appear on the **parent's** wallet, not the junior's.
3. Cancel the accepted play session → refund should go to the **parent's** wallet.
4. Enroll the junior in training → debit on parent's wallet.
5. Admin adds credit/debit/refund targeting the junior → balance change on parent, transaction recorded on parent.
6. Transaction history for the parent shows all junior activity.
7. Junior member's `credit` column stays at `0.00`.

---

## Open Questions

> [!NOTE]
> **What to show for junior's balance in the UI?** Options:
> - A) Show `—` (no wallet) with a tooltip saying "Shared with parent"
> - B) Show the parent's wallet balance on the junior's row (could be confusing if parent has other juniors)
> - C) Hide balance column for juniors entirely
>
> The current plan implements option A (show `—` for juniors) as the cleanest UX. Let me know if you prefer B or C.
