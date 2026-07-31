<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Member;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class BulkImportMemberMappingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Grade::create(['id' => 'g_adult', 'name' => 'B', 'type' => 'adult']);
        Grade::create(['id' => 'g_junior', 'name' => 'Beginner', 'type' => 'junior']);
    }

    public function test_bulk_import_out_of_order_preserves_adult_identity()
    {
        // Admin user to perform import
        $admin = User::factory()->create([
            'role' => 'admin',
            'status' => 'active',
        ]);

        // CSV content where Junior appears BEFORE Adult
        $csvContent = implode("\n", [
            "first_name,last_name,email,member_type,parent_email,parent_bi_member_id,dob,sex,phone",
            "sheik,ahamed,sheik@testclub.org,junior,irfan@testclub.org,,2015-05-10,male,1234567890",
            "md,irfan,irfan@testclub.org,adult,,,1985-01-01,male,0987654321",
        ]);

        $file = UploadedFile::fake()->createWithContent('members.csv', $csvContent);

        $response = $this->actingAs($admin)
            ->postJson('/api/members/bulk-upload', [
                'file' => $file,
            ]);

        $response->assertStatus(200);

        // Verify Adult user account was created with Adult name
        $adultUser = User::where('email', 'irfan@testclub.org')->first();
        $this->assertNotNull($adultUser);
        $this->assertEquals('md', $adultUser->first_name);
        $this->assertEquals('irfan', $adultUser->last_name);

        // Verify Adult member was created
        $adultMember = Member::where('email', 'irfan@testclub.org')->where('member_type', 'adult')->first();
        $this->assertNotNull($adultMember);
        $this->assertEquals('md', $adultMember->first_name);
        $this->assertEquals($adultUser->id, $adultMember->user_id);

        // Verify Junior member was linked under adult member
        $juniorMember = Member::where('first_name', 'sheik')->where('member_type', 'junior')->first();
        $this->assertNotNull($juniorMember);
        $this->assertEquals($adultMember->id, $juniorMember->parent_member_id);
        $this->assertEquals($adultUser->id, $juniorMember->user_id);

        // Verify login response for Adult returns Adult's own profile, not Junior's
        $meResponse = $this->actingAs($adultUser)->getJson('/api/me');
        $meResponse->assertStatus(200);
        $meResponse->assertJson([
            'firstName' => 'md',
            'lastName' => 'irfan',
        ]);
    }

    public function test_updating_junior_member_does_not_mutate_adult_user_account()
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'status' => 'active',
        ]);

        $adultUser = User::create([
            'id' => 'u_adult123',
            'first_name' => 'md',
            'last_name' => 'irfan',
            'email' => 'irfan@testclub.org',
            'mobile' => '0987654321',
            'address' => '123 Main St',
            'sex' => 'male',
            'dob' => '1985-01-01',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $adultMember = Member::create([
            'id' => 'm_adult123',
            'user_id' => $adultUser->id,
            'first_name' => 'md',
            'last_name' => 'irfan',
            'email' => 'irfan@testclub.org',
            'dob' => '1985-01-01',
            'sex' => 'male',
            'member_type' => 'adult',
            'membership' => true,
            'grade' => 'B',
            'status' => 'active',
        ]);

        $juniorMember = Member::create([
            'id' => 'm_junior123',
            'user_id' => $adultUser->id,
            'parent_member_id' => $adultMember->id,
            'first_name' => 'sheik',
            'last_name' => 'ahamed',
            'email' => 'sheik@testclub.org',
            'dob' => '2015-05-10',
            'sex' => 'male',
            'member_type' => 'junior',
            'membership' => false,
            'grade' => 'Beginner',
            'status' => 'active',
        ]);

        // Admin updates junior member
        $updateResponse = $this->actingAs($admin)
            ->patchJson("/api/members/{$juniorMember->id}", [
                'firstName' => 'sheik updated',
                'lastName' => 'ahamed updated',
            ]);

        $updateResponse->assertStatus(200);

        // Verify Junior member was updated
        $this->assertEquals('sheik updated', $juniorMember->fresh()->first_name);

        // Verify Adult User account was NOT mutated
        $this->assertEquals('md', $adultUser->fresh()->first_name);
        $this->assertEquals('irfan', $adultUser->fresh()->last_name);
    }
}
