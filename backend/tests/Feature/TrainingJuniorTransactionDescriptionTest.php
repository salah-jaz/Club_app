<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Location;
use App\Models\Member;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class TrainingJuniorTransactionDescriptionTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;
    protected User $parentUser;
    protected Member $parentMember;
    protected Member $juniorMember;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        $juniorGrade = Grade::firstOrCreate(['name' => 'Junior Beginner'], ['type' => 'junior']);
        $adultGrade = Grade::firstOrCreate(['name' => 'Adult Grade A'], ['type' => 'adult']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_desc_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_desc@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->parentUser = User::create([
            'id' => 'u_parent_desc_' . \Illuminate\Support\Str::random(5),
            'first_name' => 'ParentFirstName',
            'last_name' => 'ParentLastName',
            'sex' => 'female',
            'dob' => '1985-04-04',
            'email' => 'parent_desc_' . \Illuminate\Support\Str::random(5) . '@test.com',
            'mobile' => '+1122334455',
            'address' => 'Parent Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->parentMember = Member::create([
            'id' => 'm_parent_desc_' . \Illuminate\Support\Str::random(5),
            'user_id' => $this->parentUser->id,
            'first_name' => 'ParentFirstName',
            'last_name' => 'ParentLastName',
            'sex' => 'female',
            'dob' => '1985-04-04',
            'email' => $this->parentUser->email,
            'mobile' => '+1122334455',
            'address' => 'Parent Address',
            'member_type' => 'adult',
            'grade' => $adultGrade->name,
            'credit' => 200.0,
            'status' => 'active',
        ]);

        $this->juniorMember = Member::create([
            'id' => 'm_junior_desc_' . \Illuminate\Support\Str::random(5),
            'user_id' => $this->parentUser->id,
            'parent_member_id' => $this->parentMember->id,
            'first_name' => 'LittleJunior',
            'last_name' => 'Player',
            'sex' => 'male',
            'dob' => '2016-06-06',
            'email' => 'junior_desc_' . \Illuminate\Support\Str::random(5) . '@test.com',
            'mobile' => '+1122334466',
            'address' => 'Parent Address',
            'member_type' => 'junior',
            'grade' => $juniorGrade->name,
            'credit' => 0.0,
            'training_eligible' => true,
            'status' => 'active',
            'skip_credit_consumption' => false,
        ]);
    }

    public function test_accepting_training_invitation_for_junior_includes_junior_name_in_transaction_description()
    {
        $startDate = now()->addDays(5)->format('Y-m-d H:i:s');
        $endDate = now()->addDays(5)->addHours(1)->format('Y-m-d H:i:s');

        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Masterclass Program',
            'startDate' => $startDate,
            'endDate' => $endDate,
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100, // Per week fee = $25
            'coach' => 'Head Coach',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $training = Training::where('name', 'Junior Masterclass Program')->firstOrFail();

        $this->actingAs($this->admin)->postJson("/api/trainings/{$training->id}/release", [
            'memberIds' => [$this->juniorMember->id],
        ]);

        $invitation = TrainingInvitation::where('training_id', $training->id)
            ->where('member_id', $this->juniorMember->id)
            ->firstOrFail();

        // Respond to invitation as Parent User
        $respondRes = $this->actingAs($this->parentUser)->postJson("/api/training-invitations/{$invitation->id}/respond", [
            'status' => 'accepted',
        ]);

        $respondRes->assertStatus(200);

        // Verify transaction entry on parent wallet
        $txn = Transaction::where('member_id', $this->parentMember->id)->where('type', 'debit')->first();
        $this->assertNotNull($txn);
        $this->assertEquals(25.00, $txn->amount);
        $this->assertStringContainsString('accepted for ' . $this->juniorMember->name, $txn->description);
        $this->assertStringContainsString('Junior Masterclass Program', $txn->description);
    }
}
