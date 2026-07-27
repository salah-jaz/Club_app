<?php

namespace Tests\Feature;

use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\User;
use App\Models\Member;
use App\Models\Transaction;
use App\Models\Location;
use App\Models\Grade;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class ManualMemberTrainingWalletTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        Grade::firstOrCreate(['name' => 'Beginner'], ['type' => 'junior']);
        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Training::query()->delete();

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_manual_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_manual@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );
    }

    public function test_manually_created_junior_member_with_parent_wallet_deduction_on_acceptance()
    {
        // 1. Create Parent Member manually
        $parentUser = User::create([
            'id' => 'u_manual_parent',
            'first_name' => 'ManualParent',
            'last_name' => 'Owner',
            'sex' => 'female',
            'dob' => '1985-04-04',
            'email' => 'manual_parent@test.com',
            'mobile' => '+1122334455',
            'address' => 'Parent Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $parentRes = $this->actingAs($this->admin)->postJson('/api/members', [
            'firstName' => 'ManualParent',
            'lastName' => 'Owner',
            'dob' => '1985-04-04',
            'email' => 'manual_parent@test.com',
            'sex' => 'female',
            'memberType' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
            'userId' => $parentUser->id,
            'membership' => true,
        ]);
        $parentRes->assertStatus(201);
        $parentMemberId = $parentRes->json('id');
        $parentMember = Member::findOrFail($parentMemberId);
        $parentMember->update(['credit' => 100.00]);

        // 2. Create Junior Member manually linked to Parent
        $juniorRes = $this->actingAs($this->admin)->postJson('/api/members', [
            'firstName' => 'ManualJunior',
            'lastName' => 'Player',
            'dob' => '2016-06-06',
            'email' => 'manual_junior@test.com',
            'sex' => 'male',
            'memberType' => 'junior',
            'grade' => 'Beginner',
            'status' => 'active',
            'parentMemberId' => $parentMemberId,
            'membership' => false,
        ]);
        $juniorRes->assertStatus(201);
        $juniorMemberId = $juniorRes->json('id');
        $juniorMember = Member::findOrFail($juniorMemberId);

        // Verify required values were auto-initialized
        $this->assertNotEmpty($juniorMember->bi_member_id);
        $this->assertEquals($parentUser->id, $juniorMember->user_id);
        $this->assertEquals($parentMemberId, $juniorMember->parent_member_id);
        $this->assertTrue($juniorMember->training_eligible);
        $this->assertFalse($juniorMember->skip_credit_consumption);

        // 3. Create Training Program
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Masterclass',
            'startDate' => '2026-08-01 10:00:00',
            'endDate' => '2026-08-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100, // Per week fee = $25
            'coach' => 'Head Coach',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $training = Training::where('name', 'Junior Masterclass')->firstOrFail();
        $this->actingAs($this->admin)->postJson("/api/trainings/{$training->id}/release", [
            'selectedWeeks' => ['2026-08-01'],
        ]);

        $invitation = TrainingInvitation::where('training_id', $training->id)
            ->where('member_id', $juniorMemberId)
            ->firstOrFail();

        // 4. Respond to invitation as Parent User
        $respondRes = $this->actingAs($parentUser)->postJson("/api/training-invitations/{$invitation->id}/respond", [
            'status' => 'accepted',
        ]);

        $respondRes->assertStatus(200);
        $respondRes->assertJson(['status' => 'accepted']);

        // 5. Verify Parent Wallet was debited by $25 (100 - 25 = 75)
        $parentMember->refresh();
        $this->assertEquals(75.00, $parentMember->credit);

        // Verify Debit transaction entry
        $txn = Transaction::where('member_id', $parentMember->id)->where('type', 'debit')->first();
        $this->assertNotNull($txn);
        $this->assertEquals(25.00, $txn->amount);
        $this->assertStringContainsString('Junior Masterclass', $txn->description);
    }
}
