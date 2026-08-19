<?php

namespace Tests\Feature;

use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\TrainingDate;
use App\Models\Transaction;
use App\Models\User;
use App\Models\Member;
use App\Models\Location;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class TrainingAcceptedInvitationLockTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;
    protected Member $member1;
    protected Member $member2;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        $grade = \App\Models\Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'junior']);
        Training::query()->delete();

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_lock_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_lock@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->member1 = Member::firstOrCreate(
            ['id' => 'm_junior_lock_1'],
            [
                'user_id' => $this->admin->id,
                'first_name' => 'Member',
                'last_name' => 'One',
                'sex' => 'male',
                'dob' => '2015-01-01',
                'email' => 'member1@test.com',
                'mobile' => '+1234567891',
                'address' => 'Test Address',
                'member_type' => 'junior',
                'grade' => $grade->name,
                'credit' => 500.0,
                'training_eligible' => true,
                'status' => 'active',
            ]
        );

        $this->member2 = Member::firstOrCreate(
            ['id' => 'm_junior_lock_2'],
            [
                'user_id' => $this->admin->id,
                'first_name' => 'Member',
                'last_name' => 'Two',
                'sex' => 'female',
                'dob' => '2015-02-01',
                'email' => 'member2@test.com',
                'mobile' => '+1234567892',
                'address' => 'Test Address',
                'member_type' => 'junior',
                'grade' => $grade->name,
                'credit' => 500.0,
                'training_eligible' => true,
                'status' => 'active',
            ]
        );
    }

    public function test_accepted_invitation_remains_locked_when_admin_updates_training_config()
    {
        // 1. Admin creates a 2-week training program ($100 fee)
        $createRes = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Summer Junior Camp',
            'startDate' => '2026-07-01 10:00:00',
            'endDate' => '2026-07-01 11:00:00',
            'repeatWeeks' => 2,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);
        $createRes->assertStatus(201);
        $parentTrainingId = $createRes->json('id');

        $initialSessions = Training::where('parent_id', $parentTrainingId)
            ->orWhere('id', $parentTrainingId)
            ->orderBy('start_date', 'asc')
            ->get();
        $this->assertCount(2, $initialSessions);

        $jul1 = $initialSessions[0];
        $jul8 = $initialSessions[1];

        // 2. Admin releases invitations to Member 01 for Jul 1 and Jul 8
        $this->actingAs($this->admin)->postJson("/api/trainings/{$jul1->id}/release", [
            'memberIds' => [$this->member1->id, $this->member2->id],
        ]);
        $this->actingAs($this->admin)->postJson("/api/trainings/{$jul8->id}/release", [
            'memberIds' => [$this->member1->id, $this->member2->id],
        ]);

        // 3. Member 01 accepts the invitations
        $inv1 = TrainingInvitation::where('training_id', $jul1->id)->where('member_id', $this->member1->id)->firstOrFail();
        $inv2 = TrainingInvitation::where('training_id', $jul8->id)->where('member_id', $this->member1->id)->firstOrFail();

        $bulkRes = $this->actingAs($this->admin)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$inv1->id, $inv2->id],
            'status' => 'accepted',
        ]);
        $bulkRes->assertStatus(200);

        // Member 01 balance should be 500 - 100 = 400
        $this->member1->refresh();
        $this->assertEquals(400.0, $this->member1->credit);

        // Verify snapshot values stored on invitations
        $inv1->refresh();
        $inv2->refresh();
        $this->assertEquals(100.0, $inv1->accepted_monthly_fee);
        $this->assertEquals(2, $inv1->accepted_repeat_weeks);
        $this->assertEquals(50.0, $inv1->accepted_per_session_fee);
        $this->assertEquals(50.0, $inv1->accepted_amount);

        // 4. Later, Admin edits Training Program to 4 weeks (repeatWeeks = 4, fees = 100)
        $updateRes = $this->actingAs($this->admin)->patchJson("/api/trainings/{$jul1->id}", [
            'repeatWeeks' => 4,
            'fees' => 100,
        ]);
        $updateRes->assertStatus(200);

        $updatedSessions = Training::where('parent_id', $parentTrainingId)
            ->orWhere('id', $parentTrainingId)
            ->orderBy('start_date', 'asc')
            ->get();
        $this->assertCount(4, $updatedSessions);

        $jul15 = $updatedSessions[2];
        $jul22 = $updatedSessions[3];

        // 5. Verify Member 01's accepted invitation & financial records remain UNCHANGED
        $this->member1->refresh();
        $this->assertEquals(400.0, $this->member1->credit); // No extra deduction

        // Member 01 should STILL have only 2 accepted invitations (Jul 1 & Jul 8)
        $m1Invs = TrainingInvitation::where('member_id', $this->member1->id)->where('status', 'accepted')->get();
        $this->assertCount(2, $m1Invs);
        $this->assertTrue($m1Invs->contains('training_id', $jul1->id));
        $this->assertTrue($m1Invs->contains('training_id', $jul8->id));

        // Member 01 should NOT have invitations for Jul 15 or Jul 22
        $this->assertFalse(TrainingInvitation::where('training_id', $jul15->id)->where('member_id', $this->member1->id)->exists());
        $this->assertFalse(TrainingInvitation::where('training_id', $jul22->id)->where('member_id', $this->member1->id)->exists());

        // 6. Pending Member 02 accepts using the LATEST training configuration (4 weeks @ $25/session = $100 total)
        // Admin releases the new sessions Jul 15 and Jul 22 to Member 02
        $this->actingAs($this->admin)->postJson("/api/trainings/{$jul15->id}/release", [
            'memberIds' => [$this->member2->id],
        ]);
        $this->actingAs($this->admin)->postJson("/api/trainings/{$jul22->id}/release", [
            'memberIds' => [$this->member2->id],
        ]);

        $m2Invs = TrainingInvitation::where('member_id', $this->member2->id)->get();
        $this->assertCount(4, $m2Invs);

        $m2AcceptRes = $this->actingAs($this->admin)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => $m2Invs->pluck('id')->toArray(),
            'status' => 'accepted',
        ]);
        $m2AcceptRes->assertStatus(200);

        // Member 02 should be debited $100 (4 sessions @ $25 = $100) -> 500 - 100 = 400
        $this->member2->refresh();
        $this->assertEquals(400.0, $this->member2->credit);

        // Verify Member 02 snapshot: per-session fee is $25
        $m2InvJul1 = TrainingInvitation::where('training_id', $jul1->id)->where('member_id', $this->member2->id)->first();
        $this->assertEquals(25.0, $m2InvJul1->accepted_per_session_fee);
        $this->assertEquals(25.0, $m2InvJul1->accepted_amount);

        // 7. Admin updates training config decreasing weeks from 4 to 2
        $updateRes2 = $this->actingAs($this->admin)->patchJson("/api/trainings/{$jul1->id}", [
            'repeatWeeks' => 2,
        ]);
        $updateRes2->assertStatus(200);

        // Member 02's accepted sessions (Jul 15 and Jul 22) MUST NOT be deleted because Member 02 accepted them!
        $this->assertTrue(TrainingInvitation::where('training_id', $jul15->id)->where('member_id', $this->member2->id)->where('status', 'accepted')->exists());
        $this->assertTrue(TrainingInvitation::where('training_id', $jul22->id)->where('member_id', $this->member2->id)->where('status', 'accepted')->exists());
    }
}
