<?php

namespace Tests\Feature;

use App\Helpers\SessionTimingHelper;
use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Location;
use App\Models\Member;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\Transaction;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression: after Team A grows 2→4, new members get invites and are charged on accept,
 * but Accepted status must persist in Admin/Member portals (no orphan debit).
 */
class GroupTrainingAcceptAfterRosterGrowthTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        Carbon::setTestNow(Carbon::parse('2026-10-01 09:00:00', SessionTimingHelper::clubTimezone()));
        Location::firstOrCreate(['name' => 'Main Hall']);
        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'junior']);

        $this->admin = User::create([
            'id' => 'u_admin_roster',
            'first_name' => 'Admin',
            'last_name' => 'User',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'admin_roster@test.com',
            'mobile' => '+1000000001',
            'address' => 'Test',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'is_super_admin' => true,
            'status' => 'active',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function makeParentAndJunior(string $suffix, float $credit = 500.0): array
    {
        $parentUser = User::create([
            'id' => 'u_p_' . $suffix,
            'first_name' => 'Parent',
            'last_name' => $suffix,
            'sex' => 'female',
            'dob' => '1985-01-01',
            'email' => "parent_{$suffix}@test.com",
            'mobile' => '+1' . substr(crc32($suffix) . '0000000', 0, 10),
            'address' => 'Test',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $parent = Member::create([
            'id' => 'm_p_' . $suffix,
            'user_id' => $parentUser->id,
            'first_name' => 'Parent',
            'last_name' => $suffix,
            'sex' => 'female',
            'dob' => '1985-01-01',
            'email' => "parent_{$suffix}@test.com",
            'mobile' => $parentUser->mobile,
            'address' => 'Test',
            'member_type' => 'adult',
            'membership' => true,
            'training_eligible' => false,
            'grade' => 'Grade A',
            'credit' => $credit,
            'status' => 'active',
            'skip_credit_consumption' => false,
        ]);

        $junior = Member::create([
            'id' => 'm_j_' . $suffix,
            'user_id' => $parentUser->id,
            'parent_member_id' => $parent->id,
            'first_name' => 'Junior',
            'last_name' => $suffix,
            'sex' => 'male',
            'dob' => '2015-01-01',
            'email' => "junior_{$suffix}@test.com",
            'mobile' => $parentUser->mobile,
            'address' => 'Test',
            'member_type' => 'junior',
            'membership' => true,
            'training_eligible' => true,
            'grade' => 'Grade A',
            'credit' => 0,
            'status' => 'active',
            'skip_credit_consumption' => false,
        ]);

        return [$parentUser, $parent, $junior];
    }

    private function makeAdult(string $suffix, bool $trainingEligible, float $credit = 500.0): array
    {
        $user = User::create([
            'id' => 'u_a_' . $suffix,
            'first_name' => 'Adult',
            'last_name' => $suffix,
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => "adult_{$suffix}@test.com",
            'mobile' => '+2' . substr(crc32($suffix) . '0000000', 0, 10),
            'address' => 'Test',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $member = Member::create([
            'id' => 'm_a_' . $suffix,
            'user_id' => $user->id,
            'first_name' => 'Adult',
            'last_name' => $suffix,
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => "adult_{$suffix}@test.com",
            'mobile' => $user->mobile,
            'address' => 'Test',
            'member_type' => 'adult',
            'membership' => true,
            'training_eligible' => $trainingEligible,
            'grade' => 'Grade A',
            'credit' => $credit,
            'status' => 'active',
            'skip_credit_consumption' => false,
        ]);

        return [$user, $member];
    }

    public function test_new_junior_group_members_accept_persists_status_and_debits_once(): void
    {
        [$u1, $p1, $j1] = $this->makeParentAndJunior('one');
        [$u2, $p2, $j2] = $this->makeParentAndJunior('two');
        [$u3, $p3, $j3] = $this->makeParentAndJunior('three');
        [$u4, $p4, $j4] = $this->makeParentAndJunior('four');

        $group = LeagueGroup::create([
            'id' => (string) Str::uuid(),
            'name' => 'Team A',
            'group_type' => 'Junior',
        ]);
        $group->members()->sync([$j1->id, $j2->id]);

        $create = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Team A Training',
            'startDate' => '2026-10-08 14:00:00',
            'endDate' => '2026-10-22',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'slots' => 2,
            'duration' => '1 hour',
            'fees' => 90.0,
            'coach' => 'Coach',
            'location' => 'Main Hall',
            'targetType' => 'junior',
            'isGroupTraining' => true,
            'leagueGroupIds' => [$group->id],
        ]);
        $create->assertStatus(201);
        $parentId = $create->json('id');
        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date')->get();
        $this->assertCount(3, $sessions);
        $this->assertSame(2, (int) $sessions[0]->slots);

        foreach ([$j1, $j2] as $junior) {
            $this->actingAs($this->admin)->postJson("/api/trainings/{$sessions[0]->id}/update-member-invitation", [
                'memberId' => $junior->id,
                'sessionIds' => $sessions->pluck('id')->all(),
            ])->assertOk();
        }

        foreach ([[$u1, $j1], [$u2, $j2]] as [$user, $junior]) {
            $ids = TrainingInvitation::where('member_id', $junior->id)->where('status', 'open')->pluck('id')->all();
            $this->actingAs($user)->postJson('/api/training-invitations/respond-bulk', [
                'inviteIds' => $ids,
                'status' => 'accepted',
            ])->assertOk();
            $this->assertSame(
                3,
                TrainingInvitation::where('member_id', $junior->id)->where('status', 'accepted')->count()
            );
        }

        // Grow Team A 2 → 4 (capacity should become 4; invites for new members)
        $group->members()->sync([$j1->id, $j2->id, $j3->id, $j4->id]);
        $this->assertSame(4, (int) $sessions[0]->fresh()->slots);

        foreach ([$j3, $j4] as $junior) {
            $this->actingAs($this->admin)->postJson("/api/trainings/{$sessions[0]->id}/update-member-invitation", [
                'memberId' => $junior->id,
                'sessionIds' => $sessions->pluck('id')->all(),
            ])->assertOk();
        }

        $creditBefore = (float) $p3->fresh()->credit;
        $ids3 = TrainingInvitation::where('member_id', $j3->id)->where('status', 'open')->pluck('id')->all();
        $this->assertNotEmpty($ids3);

        $res = $this->actingAs($u3)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => $ids3,
            'status' => 'accepted',
        ]);
        $res->assertOk();

        $accepted = TrainingInvitation::where('member_id', $j3->id)->where('status', 'accepted')->count();
        $openLeft = TrainingInvitation::where('member_id', $j3->id)->where('status', 'open')->count();
        $debits = Transaction::where('member_id', $p3->id)->where('type', 'debit')->count();
        $creditAfter = (float) $p3->fresh()->credit;

        $this->assertSame(3, $accepted, 'Accepted status must persist after roster growth accept');
        $this->assertSame(0, $openLeft);
        $this->assertSame(1, $debits, 'Wallet must be debited exactly once');
        $this->assertSame(90.0, round($creditBefore - $creditAfter, 2));

        // Admin sync-data style listing still sees accepted
        $list = $this->actingAs($this->admin)->getJson('/api/training-invitations');
        $list->assertOk();
        $adminAccepted = collect($list->json())->where('memberId', $j3->id)->where('status', 'accepted')->count();
        $this->assertSame(3, $adminAccepted);

        $memberList = $this->actingAs($u3)->getJson('/api/training-invitations');
        $memberAccepted = collect($memberList->json())->where('memberId', $j3->id)->where('status', 'accepted')->count();
        $this->assertSame(3, $memberAccepted);
    }

    public function test_group_adult_accept_with_training_eligible_false_does_not_orphan_debit(): void
    {
        [$u1, $a1] = $this->makeAdult('one', true);
        [$u2, $a2] = $this->makeAdult('two', true);
        [$u3, $a3] = $this->makeAdult('three', false); // group roster allows; sync treats as ineligible
        [$u4, $a4] = $this->makeAdult('four', false);

        $group = LeagueGroup::create([
            'id' => (string) Str::uuid(),
            'name' => 'Team A Adults',
            'group_type' => 'Adult',
        ]);
        $group->members()->sync([$a1->id, $a2->id]);

        $create = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Adult Team Training',
            'startDate' => '2026-10-08 14:00:00',
            'endDate' => '2026-10-22',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'slots' => 2,
            'duration' => '1 hour',
            'fees' => 90.0,
            'coach' => 'Coach',
            'location' => 'Main Hall',
            'targetType' => 'adult',
            'isGroupTraining' => true,
            'leagueGroupIds' => [$group->id],
        ]);
        $create->assertStatus(201);
        $parentId = $create->json('id');
        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date')->get();

        foreach ([$a1, $a2] as $adult) {
            $this->actingAs($this->admin)->postJson("/api/trainings/{$sessions[0]->id}/update-member-invitation", [
                'memberId' => $adult->id,
                'sessionIds' => $sessions->pluck('id')->all(),
            ])->assertOk();
            $ids = TrainingInvitation::where('member_id', $adult->id)->where('status', 'open')->pluck('id')->all();
            $this->actingAs($adult->user_id === $u1->id ? $u1 : $u2)->postJson('/api/training-invitations/respond-bulk', [
                'inviteIds' => $ids,
                'status' => 'accepted',
            ])->assertOk();
        }

        $group->members()->sync([$a1->id, $a2->id, $a3->id, $a4->id]);
        $this->assertSame(4, (int) $sessions[0]->fresh()->slots);

        $this->actingAs($this->admin)->postJson("/api/trainings/{$sessions[0]->id}/update-member-invitation", [
            'memberId' => $a3->id,
            'sessionIds' => $sessions->pluck('id')->all(),
        ])->assertOk();

        $creditBefore = (float) $a3->fresh()->credit;
        $ids = TrainingInvitation::where('member_id', $a3->id)->where('status', 'open')->pluck('id')->all();
        $this->assertCount(3, $ids);

        $res = $this->actingAs($u3)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => $ids,
            'status' => 'accepted',
        ]);
        $res->assertOk();

        $accepted = TrainingInvitation::where('member_id', $a3->id)->where('status', 'accepted')->count();
        $debits = Transaction::where('member_id', $a3->id)->where('type', 'debit')->count();
        $this->assertSame(3, $accepted, 'Group roster members must keep Accepted after wallet debit');
        $this->assertSame(1, $debits);
        $this->assertSame(90.0, round($creditBefore - (float) $a3->fresh()->credit, 2));

        $adminAccepted = collect($this->actingAs($this->admin)->getJson('/api/training-invitations')->json())
            ->where('memberId', $a3->id)
            ->where('status', 'accepted')
            ->count();
        $this->assertSame(3, $adminAccepted);

        $memberAccepted = collect($this->actingAs($u3)->getJson('/api/training-invitations')->json())
            ->where('memberId', $a3->id)
            ->where('status', 'accepted')
            ->count();
        $this->assertSame(3, $memberAccepted);
    }

    public function test_sequential_self_wallet_accept_does_not_orphan_later_sessions(): void
    {
        [$user, $adult] = $this->makeAdult('seq', true);

        $group = LeagueGroup::create([
            'id' => (string) Str::uuid(),
            'name' => 'Team Seq',
            'group_type' => 'Adult',
        ]);
        $group->members()->sync([$adult->id]);

        $create = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Seq Training',
            'startDate' => '2026-10-08 14:00:00',
            'endDate' => '2026-10-22',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'slots' => 1,
            'duration' => '1 hour',
            'fees' => 90.0,
            'coach' => 'Coach',
            'location' => 'Main Hall',
            'targetType' => 'adult',
            'isGroupTraining' => true,
            'leagueGroupIds' => [$group->id],
        ]);
        $create->assertStatus(201);
        $parentId = $create->json('id');
        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date')->get();

        foreach ($sessions as $session) {
            $this->actingAs($this->admin)->postJson("/api/trainings/{$session->id}/release", [
                'memberIds' => [$adult->id],
            ])->assertOk();
        }

        $invites = TrainingInvitation::where('member_id', $adult->id)
            ->get()
            ->sortBy(fn ($inv) => $sessions->search(fn ($s) => $s->id === $inv->training_id))
            ->values();
        $this->assertCount(3, $invites);

        // Accept first session alone, then remaining two — wallet save must not wipe open invites.
        $this->actingAs($user)->postJson('/api/training-invitations/' . $invites[0]->id . '/respond', [
            'status' => 'accepted',
        ])->assertOk();
        $this->assertSame('accepted', $invites[0]->fresh()->status);

        $this->actingAs($user)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$invites[1]->id, $invites[2]->id],
            'status' => 'accepted',
        ])->assertOk();

        $this->assertSame(3, TrainingInvitation::where('member_id', $adult->id)->where('status', 'accepted')->count());
        $this->assertSame(2, Transaction::where('member_id', $adult->id)->where('type', 'debit')->count());
    }

    /**
     * Regression: month bulk-accept must use live roster capacity on finished weekly
     * sessions. Stale trainings.slots (e.g. 4 after roster grew to 6) must not block
     * the 5th/6th member when accepted unique count is still below roster size.
     */
    public function test_month_bulk_accept_allows_new_member_when_finished_sessions_have_stale_slots(): void
    {
        [$u1, $p1, $j1] = $this->makeParentAndJunior('f1');
        [$u2, $p2, $j2] = $this->makeParentAndJunior('f2');
        [$u3, $p3, $j3] = $this->makeParentAndJunior('f3');
        [$u4, $p4, $j4] = $this->makeParentAndJunior('f4');
        [$u5, $p5, $j5] = $this->makeParentAndJunior('f5');
        [$u6, $p6, $j6] = $this->makeParentAndJunior('f6');

        $group = LeagueGroup::create([
            'id' => (string) Str::uuid(),
            'name' => 'Monday 6PM',
            'group_type' => 'Junior',
        ]);
        $group->members()->sync([$j1->id, $j2->id, $j3->id, $j4->id]);

        Carbon::setTestNow(Carbon::parse('2026-11-01 09:00:00', SessionTimingHelper::clubTimezone()));

        $create = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'November 2026(Monday)6:00PM',
            'startDate' => '2026-11-02 19:00:00',
            'endDate' => '2026-11-30',
            'repeatWeeks' => 5,
            'repeatMonths' => 1,
            'slots' => 4,
            'duration' => '1 hour',
            'fees' => 100.0,
            'coach' => 'Coach',
            'location' => 'Main Hall',
            'targetType' => 'junior',
            'isGroupTraining' => true,
            'leagueGroupIds' => [$group->id],
        ]);
        $create->assertStatus(201);
        $parentId = $create->json('id');
        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date')->get();
        $this->assertCount(5, $sessions);
        $this->assertSame(4, (int) $sessions[0]->slots);

        foreach ([$j1, $j2, $j3, $j4] as $junior) {
            $this->actingAs($this->admin)->postJson("/api/trainings/{$sessions[0]->id}/update-member-invitation", [
                'memberId' => $junior->id,
                'sessionIds' => $sessions->pluck('id')->all(),
            ])->assertOk();
        }

        foreach ([[$u1, $j1], [$u2, $j2], [$u3, $j3], [$u4, $j4]] as [$user, $junior]) {
            $ids = TrainingInvitation::where('member_id', $junior->id)->where('status', 'open')->pluck('id')->all();
            $this->actingAs($user)->postJson('/api/training-invitations/respond-bulk', [
                'inviteIds' => $ids,
                'status' => 'accepted',
            ])->assertOk();
        }

        foreach ($sessions as $session) {
            $this->assertSame(
                4,
                TrainingInvitation::where('training_id', $session->id)->where('status', 'accepted')->distinct('member_id')->count('member_id')
            );
        }

        // Roster grows 4 → 6; persist stale column slots=4 to mimic production after growth.
        $group->members()->sync([$j1->id, $j2->id, $j3->id, $j4->id, $j5->id, $j6->id]);
        DB::table('trainings')->whereIn('id', $sessions->pluck('id'))->update(['slots' => 4]);

        // Mid-month: earlier weekly sessions are finished; later ones still upcoming.
        Carbon::setTestNow(Carbon::parse('2026-11-18 13:00:00', SessionTimingHelper::clubTimezone()));

        $finished = $sessions->filter(
            fn (Training $tr) => SessionTimingHelper::trainingSessionPhase($tr->fresh()) === SessionTimingHelper::PHASE_FINISHED
        );
        $upcoming = $sessions->filter(
            fn (Training $tr) => SessionTimingHelper::trainingSessionPhase($tr->fresh()) === SessionTimingHelper::PHASE_UPCOMING
        );
        $this->assertGreaterThanOrEqual(1, $finished->count());
        $this->assertGreaterThanOrEqual(1, $upcoming->count());

        foreach ($finished as $session) {
            $fresh = $session->fresh();
            $this->assertSame(4, (int) $fresh->getRawOriginal('slots'));
            $this->assertSame(6, (int) $fresh->slots, 'Finished sessions must expose live roster capacity');
            $this->assertSame(6, $fresh->resolveGroupRosterCapacity());
        }
        foreach ($upcoming as $session) {
            $fresh = $session->fresh();
            $this->assertSame(6, (int) $fresh->slots, 'Upcoming sessions must expose live roster capacity');
        }

        foreach ([$j5, $j6] as $junior) {
            $this->actingAs($this->admin)->postJson("/api/trainings/{$sessions[0]->id}/update-member-invitation", [
                'memberId' => $junior->id,
                'sessionIds' => $sessions->pluck('id')->all(),
            ])->assertOk();
        }

        $creditBefore = (float) $p5->fresh()->credit;
        $ids5 = TrainingInvitation::where('member_id', $j5->id)->where('status', 'open')->pluck('id')->all();
        $this->assertCount(5, $ids5, 'Open invites must include finished and upcoming sessions');

        $res = $this->actingAs($u5)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => $ids5,
            'status' => 'accepted',
        ]);
        $res->assertOk();
        $res->assertJsonMissing(['message' => 'Maximum players already accepted for this training.']);

        $this->assertSame(
            5,
            TrainingInvitation::where('member_id', $j5->id)->where('status', 'accepted')->count()
        );
        $this->assertSame(1, Transaction::where('member_id', $p5->id)->where('type', 'debit')->count());
        $this->assertSame(100.0, round($creditBefore - (float) $p5->fresh()->credit, 2));

        // 6th member still fits under live capacity of 6.
        $ids6 = TrainingInvitation::where('member_id', $j6->id)->where('status', 'open')->pluck('id')->all();
        $this->actingAs($u6)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => $ids6,
            'status' => 'accepted',
        ])->assertOk();

        foreach ($sessions as $session) {
            $accepted = TrainingInvitation::where('training_id', $session->id)
                ->where('status', 'accepted')
                ->distinct('member_id')
                ->count('member_id');
            $this->assertSame(6, $accepted);
            $this->assertSame(6, (int) $session->fresh()->slots);
        }

        $apiList = $this->actingAs($this->admin)->getJson('/api/trainings');
        $apiList->assertOk();
        $finishedId = $finished->first()->id;
        $apiFinished = collect($apiList->json())->firstWhere('id', $finishedId);
        $apiUpcoming = collect($apiList->json())->firstWhere('id', $upcoming->first()->id);
        $this->assertNotNull($apiFinished);
        $this->assertNotNull($apiUpcoming);
        $this->assertSame(6, (int) $apiFinished['slots'], 'API slots must match live roster for finished sessions');
        $this->assertSame(6, (int) $apiUpcoming['slots'], 'API slots must match live roster for upcoming sessions');
    }
}
