# Club Connect / Badminton Club — E2E QA Audit Report

**Date:** 28 Sep 2026  
**Scope:** Full production-style audit (Admin + Member roles, financial workflows, permissions)  
**Environment:** Vite `http://localhost:8080`, Laravel API `http://127.0.0.1:8000`  
**Constraint:** Testing only — **no application code or intentional data fixes**  
**Method:** Live Sanctum API E2E with dual-cycle reproduction for critical paths; frontend route/source review for Dashboard, Privacy UI, MobileBottomNav; `php artisan test` smoke

**Accounts used:** `admin@club.com` / `admin123`; QA adult members with password `member123`

Interactive version: open the Canvas report beside chat.

---

## 1. Tested & Working

| Module             | Field/Feature tested        | Test scenario                       | Current behavior/result                   | Verification cycles |
| ------------------ | --------------------------- | ----------------------------------- | ----------------------------------------- | ------------------- |
| Registration/Login | Login validation            | Invalid password                    | 422 credentials mismatch                  | 2                   |
| Registration/Login | Session `/me`               | Bearer token as admin               | `role=admin`                              | 2                   |
| Registration/Login | Pending approval gate       | Login before approve                | 422 pending message                       | 2                   |
| Registration/Login | Register validation         | Missing fields / password &lt; 6    | 422                                       | 2                   |
| Registration/Login | Duplicate register email    | Existing `users.email`              | 422 unique                                | 2                   |
| Registration/Login | Member login                | Adult `createLogin`                 | Token issued                              | 2                   |
| Members            | Create adult + login        | Admin POST `/members`               | 201; login works                          | 2                   |
| Members            | Duplicate login email       | Second `createLogin` same email     | 422                                       | 2                   |
| Members            | Parent-child junior         | `parentMemberId` set                | Link OK; junior credit 0                  | 2                   |
| Members            | Edit + persistence          | PATCH then GET                      | Fields persist                            | 2                   |
| Members            | Delete member               | DELETE twice                        | Removed; 2nd fails                        | 2                   |
| Members            | Member-added junior         | Member creates junior               | `status=pending`                          | 2                   |
| Wallet/Credits     | Admin credit                | `type=credit` + `date`              | Balance ↑; credit txn                     | 2                   |
| Wallet/Credits     | Admin debit                 | Debit + reason                      | Balance ↓; debit txn                      | 1+                  |
| Wallet/Credits     | Insufficient debit          | Amount 999999 ×2                    | Rejected; balance unchanged               | 2                   |
| Wallet/Credits     | Admin refund type           | `type=refund`                       | Balance ↑; refund txn                     | 1+                  |
| Wallet/Credits     | Junior → parent wallet      | Credit junior id                    | Parent ↑; junior stays 0                  | 1+                  |
| Wallet/Credits     | Member pending credit       | Member POST credit                  | `status=created`                          | 2                   |
| Approvals          | Approve credit              | Admin approve pending               | Wallet ↑ by amount                        | 1+                  |
| Approvals          | Approve junior              | Admin approve pending junior        | `status=active`                           | 1+                  |
| Transactions       | Expense                     | `type=expense` + reason             | Ledger only; wallet unchanged             | 1+                  |
| Transactions       | Delete restrictions         | DELETE credit/debit `/transactions` | Rejected; expense deletable               | 2                   |
| Transactions       | Credit-request reverse      | DELETE approved credit-request      | Wallet reversed                           | 1+                  |
| Play Schedules     | Create / release / enroll   | Full required fields                | Schedule + invites                        | 2                   |
| Play Schedules     | Accept + debit              | Member accept                       | `sessionRate` debited; `debited=true`     | 1+                  |
| Play Schedules     | Double-accept               | Accept twice                        | No second debit                           | 2                   |
| Play Schedules     | Decline refund              | Decline accepted (unlocked)         | Fee refunded                              | 1+                  |
| Play Schedules     | Cancel refund once          | Cancel ×2 after accept              | One refund only                           | 2                   |
| Play Schedules     | Rotate + publish            | Full accept → rotate → publish      | Published; decline locked                 | 2                   |
| League Groups      | CRUD + league release       | Groups + `isLeagueMatch` release    | Invites to group members                  | 1+                  |
| Trainings          | Create + release            | slots/duration/targetType/endDate   | Series + invitations                      | 2                   |
| Trainings          | Duplicate attendance refund | `process-refund` twice              | 2nd → 422 already refunded                | 2                   |
| Trainings          | Cancel already-cancelled    | Cancel training twice               | 2nd → already cancelled                   | 2                   |
| Settings           | Read + member write ACL     | GET settings; member POST           | `cancellationLockHours=24`; member denied | 2                   |
| Email Templates    | Templates payload           | `settings.emailTemplates`           | Registration template present             | 1+                  |
| Club Admin/Profile | Profile + roles ACL         | PATCH profile; GET admin-roles      | Update OK; member denied roles            | 2                   |
| Frontend shell     | Public routes               | `/login`, `/register`, `/`          | HTTP 200                                  | 1+                  |
| Mobile nav         | MobileBottomNav             | Source: `md:hidden`, role menus     | Wired for Admin/Member/Volunteer          | 1 (static)          |
| Dashboard          | Cards / View All            | Source links to modules             | Navigation present                        | 1 (static)          |

---

## 2. Issues Found

| Module         | Field/Feature                     | Issue description                                                                                   | Steps to reproduce                                                                                                        | Expected result                   | Actual result                              | Severity     | Reproducibility       |
| -------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------ | ------------ | --------------------- |
| Trainings      | Accept / wallet debit             | Accept crashes: missing `App\Models\Setting` import (`Setting` resolved under controller namespace) | 1. Create+release training with fees. 2. Member `POST /training-invitations/{id}/respond` `{status:accepted}`. 3. Repeat. | Accept + debit fee                | HTTP 500 both times; balance unchanged     | **Critical** | Consistent (2/2)      |
| Trainings      | Attendance refund without payment | Full refund credits wallet even if invite never paid                                                | 1. Release training; do not accept. 2. Mark absent. 3. `process-refund` full                                              | Refund only if previously debited | 200; balance ↑ (e.g. 265→285)              | **Critical** | Consistent            |
| Trainings      | Member `process-refund` ACL       | No admin gate; members can self-refund                                                              | As member: mark absent → `process-refund` full                                                                            | 403 admin-only                    | 200; wallet ↑ (285→305)                    | **Critical** | Consistent            |
| Play Schedules | Invitation IDOR                   | Member B can accept Member C’s invite and debit C                                                   | As B: `POST .../play-invitations/{C_invite}/respond` accepted (×2 patterns)                                               | Ownership enforced                | 200; C balance 300→280                     | **Critical** | Consistent (2 cycles) |
| Wallet/Credits | Credit-request IDOR               | Member can create credit request for any `memberId`                                                 | As A: POST credit-request for B (×2)                                                                                      | Reject other members              | 201/201                                    | **Critical** | Consistent (2/2)      |
| Security       | List / sync-data scoping          | Members get global members/users/credits/schedules                                                  | Member GET `/members`, `/sync-data`, etc.                                                                                 | Family-scoped only                | e.g. sync members=17, users=10, credits=13 | **Critical** | Consistent            |
| Approvals      | Double user approve               | Re-approve creates duplicate Member for same email                                                  | Approve same user twice; count members by email                                                                           | Second rejected; 1 member         | Both 200; count=2                          | **Critical** | Consistent (2/2)      |
| Trainings      | Admin enroll                      | Enroll restricted to caller’s family `user_id` only                                                 | Admin `POST .../enroll` with other memberIds                                                                              | Admin can enroll eligible         | 422 family-only message                    | **High**     | Consistent            |
| Registration   | Privacy Policy                    | Privacy checkbox UI-only; API has no field                                                          | `POST /register` without privacy flag (×2 emails)                                                                         | Server requires acceptance        | 201 Created                                | **High**     | Consistent            |
| Members        | Junior without parent             | Admin can create junior with no `parentMemberId`                                                    | POST junior createLogin, no parent (×2)                                                                                   | 422 parent required               | 201/201                                    | **High**     | Consistent (2/2)      |
| Members        | Duplicate member email            | `members.email` not unique unless login created                                                     | Create overlapping emails without login uniqueness                                                                        | Unique member emails              | Gap confirmed in validation rules          | **High**     | Code + API            |
| Trainings      | Overpayment refund                | Endpoint 500 / unstable; weak ACL in code                                                           | POST `process-overpayment-refund` as member/admin                                                                         | Admin-only stable capped refund   | HTTP 500 observed                          | **High**     | Consistent in session |
| Trainings      | Decline after accept              | Decline allowed without refund pairing                                                              | Accept then decline                                                                                                       | Block or refund                   | 200 `declined`; no refund in respond path  | **High**     | API + code            |
| League Groups  | Cross-group duplicates            | Same member allowed in multiple groups                                                              | Create two groups sharing member                                                                                          | Product rule enforced             | Both succeed                               | **Medium**   | Consistent            |
| Members        | Initial credit on create          | `credit` on create ignored                                                                          | POST member `credit=500`                                                                                                  | Seed wallet or reject field       | credit=0                                   | **Medium**   | Consistent            |
| Trainings      | Bulk respond field                | Expects `inviteIds` not `invitationIds`                                                             | Bulk respond with `invitationIds`                                                                                         | Accept alias or document          | 422 invite ids required                    | **Medium**   | Consistent            |
| Backend tests  | `php artisan test`                | Suite broken on sqlite (missing tables)                                                             | Run feature tests                                                                                                         | Green or clean skip               | 88 failed / 21 passed                      | **Medium**   | Consistent            |

---

## Overall test coverage summary

| Module / area                      | Coverage                                                              |
| ---------------------------------- | --------------------------------------------------------------------- |
| Dashboard                          | Route/card/View All source review; KPIs via sync                      |
| Members                            | CRUD, login, parent/junior, pending, delete — API E2E                 |
| Wallet/Credits                     | Credit/debit/refund/expense, pending approve, junior wallet — API E2E |
| Play Schedules                     | Create/release/enroll/accept/decline/cancel/rotate/publish — API E2E  |
| League Groups                      | Create, cross-group members, league release — API E2E                 |
| Trainings                          | Create/release/accept(crash)/refund/cancel/enroll — API E2E           |
| Transactions                       | Types + delete rules — API E2E                                        |
| Approvals                          | User/credit/junior approve — API E2E                                  |
| Email Templates                    | Via settings payload                                                  |
| Settings                           | Read + ACL + lock hours                                               |
| Club Admin/Profile                 | Profile + admin-roles ACL                                             |
| Member Play / Training / Groups UI | Routes + mobile nav role wiring; money proven via API                 |
| Registration / Privacy / Login     | API + privacy gap; FE pages 200                                       |
| Mobile sidebar/footer              | `MobileBottomNav` structure reviewed                                  |

### Release recommendation

**Not production-ready.** Resolve all **Critical** items (especially training accept 500, unpaid/member refunds, play invite IDOR, credit-request IDOR, sync data leak, double approve) before release. Re-run financial E2E after fixes: accept → debit → attendance refund → cancel remaining refund → verify no double refund.

### Limits

No headed browser device lab in this session; responsive behavior validated via component structure. Training fee math after successful accept could not be completed because accept hard-crashes before debit.
