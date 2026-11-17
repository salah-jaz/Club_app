<?php

namespace Tests\Feature;

use App\Models\CreditRequest;
use App\Models\Fixture;
use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Member;
use App\Models\Setting;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Regression coverage for unintended product breaks from security commit a16f105.
 * Intentional ACL hardenings (family-scoped members/credits/transactions, etc.) stay asserted.
 */
class A16f105RegressionFixesTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $memberA;
    private User $memberB;
    private Member $adultA;
    private Member $adultB;
    private LeagueGroup $groupA;
    private LeagueGroup $groupB;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Division 1'], ['type' => 'adult', 'rank' => 1]);
        \App\Models\PlayerPosition::firstOrCreate(['name' => 'Player']);
        Setting::updateOrCreate(['key' => 'currency'], ['value' => '$']);

        $templates = \App\Helpers\MailHelper::getDefaultTemplates();
        $templates['fixture_scheduled']['is_enabled'] = true;
        Setting::updateOrCreate(
            ['key' => 'email_templates'],
            ['value' => json_encode($templates)]
        );

        $this->admin = User::create([
            'id' => 'u_a16_admin',
            'first_name' => 'Admin',
            'last_name' => 'A16',
            'sex' => 'male',
            'dob' => '1985-01-01',
            'email' => 'a16_admin@test.com',
            'mobile' => '200',
            'address' => 'Addr',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'status' => 'active',
            'is_super_admin' => true,
        ]);

        $this->memberA = User::create([
            'id' => 'u_a16_a',
            'first_name' => 'Alpha',
            'last_name' => 'Member',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'a16_a@test.com',
            'mobile' => '201',
            'address' => 'Addr',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->memberB = User::create([
            'id' => 'u_a16_b',
            'first_name' => 'Beta',
            'last_name' => 'Member',
            'sex' => 'female',
            'dob' => '1991-01-01',
            'email' => 'a16_b@test.com',
            'mobile' => '202',
            'address' => 'Addr',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->adultA = Member::create([
            'id' => 'm_a16_a',
            'user_id' => $this->memberA->id,
            'first_name' => 'Alpha',
            'last_name' => 'Member',
            'dob' => '1990-01-01',
            'email' => 'a16_a@test.com',
            'mobile' => '201',
            'sex' => 'male',
            'member_type' => 'adult',
            'membership' => true,
            'grade' => 'Division 1',
            'status' => 'active',
            'credit' => 100,
        ]);

        $this->adultB = Member::create([
            'id' => 'm_a16_b',
            'user_id' => $this->memberB->id,
            'first_name' => 'Beta',
            'last_name' => 'Member',
            'dob' => '1991-01-01',
            'email' => 'a16_b@test.com',
            'mobile' => '202',
            'sex' => 'female',
            'member_type' => 'adult',
            'membership' => true,
            'grade' => 'Division 1',
            'status' => 'active',
            'credit' => 50,
        ]);

        $this->groupA = LeagueGroup::create([
            'id' => 'lg_a16_a',
            'name' => 'Team A',
            'description' => 'A',
            'group_type' => 'Adult',
        ]);
        $this->groupB = LeagueGroup::create([
            'id' => 'lg_a16_b',
            'name' => 'Team B',
            'description' => 'B',
            'group_type' => 'Adult',
        ]);

        $this->groupA->members()->sync([$this->adultA->id => ['position' => 'Player']]);
        $this->groupB->members()->sync([$this->adultB->id => ['position' => 'Player']]);
    }

    public function test_any_group_member_sees_all_fixtures_in_list_show_and_sync(): void
    {
        $fixtureB = Fixture::create([
            'id' => 'fx_a16_b',
            'name' => 'Team B Match',
            'date' => '2026-12-10 10:00:00',
            'league_group_id' => $this->groupB->id,
            'match_type' => 'Friendly',
            'venue_type' => 'Home',
            'opposition_club' => 'Opp',
            'team_name' => 'Team B',
            'grade' => 'Division 1',
            'status' => 'Scheduled',
        ]);

        $list = $this->actingAs($this->memberA)->getJson('/api/fixtures');
        $list->assertOk();
        $this->assertContains($fixtureB->id, collect($list->json())->pluck('id')->all());

        $this->actingAs($this->memberA)->getJson('/api/fixtures/' . $fixtureB->id)->assertOk();

        $sync = $this->actingAs($this->memberA)->getJson('/api/sync-data');
        $sync->assertOk();
        $this->assertContains(
            $fixtureB->id,
            collect($sync->json('fixtures'))->pluck('id')->all()
        );
    }

    public function test_member_can_send_fixture_mail_for_own_group_only(): void
    {
        Mail::fake();

        $own = Fixture::create([
            'id' => 'fx_a16_mail_own',
            'name' => 'Own',
            'date' => '2026-12-11 10:00:00',
            'league_group_id' => $this->groupA->id,
            'match_type' => 'Friendly',
            'venue_type' => 'Home',
            'opposition_club' => 'Opp',
            'team_name' => 'Team A',
            'grade' => 'Division 1',
            'status' => 'Scheduled',
            'opposition_captain_email' => 'opp@test.com',
            'home_captain_email' => 'home@test.com',
        ]);

        $other = Fixture::create([
            'id' => 'fx_a16_mail_other',
            'name' => 'Other',
            'date' => '2026-12-12 10:00:00',
            'league_group_id' => $this->groupB->id,
            'match_type' => 'Friendly',
            'venue_type' => 'Away',
            'opposition_club' => 'Opp2',
            'team_name' => 'Team B',
            'grade' => 'Division 1',
            'status' => 'Scheduled',
            'opposition_captain_email' => 'opp2@test.com',
            'home_captain_email' => 'home2@test.com',
        ]);

        $this->actingAs($this->memberA)
            ->postJson('/api/fixtures/' . $own->id . '/send-mail')
            ->assertOk();

        Mail::fake();
        $this->actingAs($this->memberA)
            ->postJson('/api/fixtures/' . $other->id . '/send-mail')
            ->assertStatus(403);
        Mail::assertNothingSent();

        $this->actingAs($this->admin)
            ->postJson('/api/fixtures/' . $other->id . '/send-mail')
            ->assertOk();
    }

    public function test_intentional_family_scoping_for_members_credits_and_transactions_still_holds(): void
    {
        CreditRequest::create([
            'id' => 'c_a16_b',
            'member_id' => $this->adultB->id,
            'type' => 'credit',
            'amount' => 20,
            'date' => now()->toDateString(),
            'status' => 'created',
        ]);

        Transaction::create([
            'id' => 't_a16_b',
            'member_id' => $this->adultB->id,
            'type' => 'credit',
            'amount' => 20,
            'description' => 'Other member credit',
            'date' => now(),
        ]);

        $credits = $this->actingAs($this->memberA)->getJson('/api/credit-requests');
        $credits->assertOk();
        $this->assertNotContains($this->adultB->id, collect($credits->json())->pluck('memberId')->all());

        $txns = $this->actingAs($this->memberA)->getJson('/api/transactions');
        $txns->assertOk();
        $this->assertNotContains($this->adultB->id, collect($txns->json())->pluck('memberId')->all());

        $members = $this->actingAs($this->memberA)->getJson('/api/members');
        $members->assertOk();
        $ids = collect($members->json())->pluck('id')->all();
        $this->assertContains($this->adultA->id, $ids);
        $this->assertNotContains($this->adultB->id, $ids);
    }

    /**
     * Regression (a16f105): IP-wide login throttle:5,1 blocked legitimate multi-user NAT logins.
     * Successful logins must not trip an IP bucket; failed attempts still rate-limit per email+IP.
     */
    public function test_successful_logins_from_same_ip_are_not_blocked_by_route_throttle(): void
    {
        $users = [];
        for ($i = 0; $i < 7; $i++) {
            $email = "a16_login_{$i}@test.com";
            $users[] = User::create([
                'id' => 'u_a16_login_' . $i,
                'first_name' => 'Login',
                'last_name' => (string) $i,
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => $email,
                'mobile' => '3' . str_pad((string) $i, 2, '0', STR_PAD_LEFT),
                'address' => 'Addr',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]);
        }

        foreach ($users as $user) {
            $this->postJson('/api/login', [
                'email' => $user->email,
                'password' => 'password',
            ])->assertOk();
        }
    }

    public function test_failed_logins_are_still_rate_limited_per_email(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', [
                'email' => $this->memberA->email,
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $this->postJson('/api/login', [
            'email' => $this->memberA->email,
            'password' => 'wrong-password',
        ])->assertStatus(429);
    }

    /**
     * Regression (a16f105): volunteers were family-scoped like members and lost the club roster
     * needed for trainings. Roster is restored with wallet fields redacted.
     */
    public function test_volunteer_sees_club_member_roster_without_wallet_balances(): void
    {
        $volunteer = User::create([
            'id' => 'u_a16_vol',
            'first_name' => 'Vol',
            'last_name' => 'Unteer',
            'sex' => 'female',
            'dob' => '1988-01-01',
            'email' => 'a16_vol@test.com',
            'mobile' => '299',
            'address' => 'Addr',
            'password' => bcrypt('password'),
            'role' => 'volunteer',
            'status' => 'active',
        ]);

        $res = $this->actingAs($volunteer)->getJson('/api/members');
        $res->assertOk();
        $ids = collect($res->json())->pluck('id')->all();
        $this->assertContains($this->adultA->id, $ids);
        $this->assertContains($this->adultB->id, $ids);

        $rowA = collect($res->json())->firstWhere('id', $this->adultA->id);
        $this->assertSame(0.0, (float) ($rowA['credit'] ?? -1));
        $this->assertFalse((bool) ($rowA['skipCreditConsumption'] ?? true));
        $this->assertEquals('Alpha', $rowA['firstName']);

        // Financial ledgers remain family-scoped (volunteer with no family → empty).
        $this->actingAs($volunteer)->getJson('/api/credit-requests')->assertOk()
            ->assertJsonCount(0);
        $this->actingAs($volunteer)->getJson('/api/transactions')->assertOk()
            ->assertJsonCount(0);
    }
}
