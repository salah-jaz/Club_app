<?php

namespace Tests\Feature;

use App\Models\Policy;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class PolicyDocumentsTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $member;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::create([
            'id' => 'u_admin_' . Str::random(6),
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'admin_policy_' . Str::random(6) . '@test.com',
            'mobile' => '0871112233',
            'address' => 'Admin HQ',
            'password' => bcrypt('password123'),
            'role' => 'admin',
            'is_super_admin' => true,
            'status' => 'active',
        ]);

        $this->member = User::create([
            'id' => 'u_member_' . Str::random(6),
            'first_name' => 'Regular',
            'last_name' => 'Member',
            'sex' => 'female',
            'dob' => '1995-05-15',
            'email' => 'member_policy_' . Str::random(6) . '@test.com',
            'mobile' => '0879998877',
            'address' => 'Member Home',
            'password' => bcrypt('password123'),
            'role' => 'member',
            'status' => 'active',
        ]);
    }

    public function test_registration_requires_privacy_policy_acceptance(): void
    {
        $payload = [
            'firstName' => 'John',
            'lastName' => 'Doe',
            'sex' => 'male',
            'dob' => '1992-04-10',
            'email' => 'johndoe_' . Str::random(6) . '@test.com',
            'mobile' => '0851234567',
            'address' => '10 Test Street',
            'password' => 'secret123',
        ];

        // 1. Without agreedToPrivacy flag -> fails with 422
        $this->postJson('/api/register', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['agreedToPrivacy']);

        // 2. With agreedToPrivacy: false -> fails with 422
        $this->postJson('/api/register', array_merge($payload, ['agreedToPrivacy' => false]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['agreedToPrivacy']);

        // 3. With agreedToPrivacy: true -> succeeds with 201 Created
        $this->postJson('/api/register', array_merge($payload, ['agreedToPrivacy' => true]))
            ->assertStatus(201)
            ->assertJsonStructure(['message', 'user_id']);

        $this->assertDatabaseHas('users', [
            'email' => $payload['email'],
            'status' => 'created',
        ]);
    }

    public function test_unauthenticated_or_member_cannot_upload_or_replace_policy(): void
    {
        Storage::fake('local');
        $file = UploadedFile::fake()->create('policy.pdf', 300, 'application/pdf');

        // Unauthenticated
        $this->postJson('/api/policies/member_policy', ['file' => $file])
            ->assertStatus(401);

        // Regular Member
        $this->actingAs($this->member)
            ->postJson('/api/policies/member_policy', ['file' => $file])
            ->assertStatus(403);

        $this->actingAs($this->member)
            ->postJson('/api/policies/privacy_policy', ['file' => $file])
            ->assertStatus(403);
    }

    public function test_admin_cannot_upload_invalid_file_types_or_oversized_files(): void
    {
        Storage::fake('local');

        // Text file instead of PDF
        $txtFile = UploadedFile::fake()->create('document.txt', 100, 'text/plain');
        $this->actingAs($this->admin)
            ->postJson('/api/policies/member_policy', ['file' => $txtFile])
            ->assertStatus(422);

        // Oversized file (> 10MB)
        $oversizedFile = UploadedFile::fake()->create('huge.pdf', 11000, 'application/pdf');
        $this->actingAs($this->admin)
            ->postJson('/api/policies/member_policy', ['file' => $oversizedFile])
            ->assertStatus(422);

        // Invalid policy type
        $pdfFile = UploadedFile::fake()->create('valid.pdf', 200, 'application/pdf');
        $this->actingAs($this->admin)
            ->postJson('/api/policies/invalid_policy_type', ['file' => $pdfFile])
            ->assertStatus(422);
    }

    public function test_admin_can_upload_both_policies_and_retrieve_metadata(): void
    {
        Storage::fake('local');

        $memberPolicyPdf = UploadedFile::fake()->create('AeroShuttle_Member_Policy.pdf', 450, 'application/pdf');
        $privacyPolicyPdf = UploadedFile::fake()->create('AeroShuttle_Privacy_Policy.pdf', 320, 'application/pdf');

        // Upload Member Policy
        $resMember = $this->actingAs($this->admin)
            ->postJson('/api/policies/member_policy', ['file' => $memberPolicyPdf])
            ->assertStatus(200)
            ->assertJsonPath('policy.hasDocument', true)
            ->assertJsonPath('policy.fileName', 'AeroShuttle_Member_Policy.pdf');

        // Upload Privacy Policy
        $resPrivacy = $this->actingAs($this->admin)
            ->postJson('/api/policies/privacy_policy', ['file' => $privacyPolicyPdf])
            ->assertStatus(200)
            ->assertJsonPath('policy.hasDocument', true)
            ->assertJsonPath('policy.fileName', 'AeroShuttle_Privacy_Policy.pdf');

        $this->assertDatabaseHas('policies', [
            'type' => 'member_policy',
            'file_name' => 'AeroShuttle_Member_Policy.pdf',
        ]);
        $this->assertDatabaseHas('policies', [
            'type' => 'privacy_policy',
            'file_name' => 'AeroShuttle_Privacy_Policy.pdf',
        ]);

        // Verify GET /api/policies returns both
        $listRes = $this->getJson('/api/policies')
            ->assertStatus(200)
            ->assertJsonPath('member_policy.hasDocument', true)
            ->assertJsonPath('privacy_policy.hasDocument', true);

        // Verify GET /api/settings includes policies
        $settingsRes = $this->getJson('/api/settings')
            ->assertStatus(200)
            ->assertJsonPath('policies.member_policy.hasDocument', true)
            ->assertJsonPath('policies.privacy_policy.hasDocument', true);
    }

    public function test_document_replacement_updates_record_without_duplicates_and_removes_old_file(): void
    {
        Storage::fake('local');

        $fileV1 = UploadedFile::fake()->create('Policy_v1.pdf', 200, 'application/pdf');
        $this->actingAs($this->admin)
            ->postJson('/api/policies/member_policy', ['file' => $fileV1])
            ->assertStatus(200);

        $policyV1 = Policy::where('type', 'member_policy')->first();
        $this->assertNotNull($policyV1);
        $v1Path = $policyV1->file_path;
        Storage::disk('local')->assertExists($v1Path);

        // Replace with v2
        $fileV2 = UploadedFile::fake()->create('Policy_v2.pdf', 350, 'application/pdf');
        $this->actingAs($this->admin)
            ->postJson('/api/policies/member_policy', ['file' => $fileV2])
            ->assertStatus(200)
            ->assertJsonPath('policy.fileName', 'Policy_v2.pdf');

        // Exactly 1 policy record in database
        $this->assertEquals(1, Policy::where('type', 'member_policy')->count());

        $policyV2 = Policy::where('type', 'member_policy')->first();
        $this->assertEquals('Policy_v2.pdf', $policyV2->file_name);
        $this->assertNotEquals($v1Path, $policyV2->file_path);

        // New file exists, old file is cleaned up
        Storage::disk('local')->assertExists($policyV2->file_path);
        Storage::disk('local')->assertMissing($v1Path);
    }

    public function test_preview_and_download_access_rules(): void
    {
        Storage::fake('local');

        $memberPdf = UploadedFile::fake()->create('Member_Policy.pdf', 250, 'application/pdf');
        $privacyPdf = UploadedFile::fake()->create('Privacy_Policy.pdf', 280, 'application/pdf');

        $this->actingAs($this->admin)->postJson('/api/policies/member_policy', ['file' => $memberPdf])->assertStatus(200);
        $this->actingAs($this->admin)->postJson('/api/policies/privacy_policy', ['file' => $privacyPdf])->assertStatus(200);

        // Privacy Policy: preview & download are publicly accessible without authentication
        $this->get('/api/policies/privacy_policy/preview')
            ->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');

        $this->get('/api/policies/privacy_policy/download')
            ->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');

        // Member Policy: authenticated member preview & download -> 200
        $this->actingAs($this->member)
            ->get('/api/policies/member_policy/preview')
            ->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');

        $this->actingAs($this->member)
            ->get('/api/policies/member_policy/download')
            ->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_unauthenticated_user_cannot_access_member_policy(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('policies/member_test.pdf', 'dummy pdf content');
        Policy::create([
            'type' => 'member_policy',
            'title' => 'Member Policy',
            'file_path' => 'policies/member_test.pdf',
            'file_name' => 'Member_Policy.pdf',
            'file_size' => 1234,
            'mime_type' => 'application/pdf',
        ]);

        $this->getJson('/api/policies/member_policy/preview')
            ->assertStatus(401);

        $this->getJson('/api/policies/member_policy/download')
            ->assertStatus(401);
    }

    public function test_missing_document_returns_404_not_500(): void
    {
        Storage::fake('local');

        $this->getJson('/api/policies/privacy_policy/preview')
            ->assertStatus(404)
            ->assertJsonPath('message', 'Document not found.');

        $this->getJson('/api/policies/privacy_policy/download')
            ->assertStatus(404)
            ->assertJsonPath('message', 'Document not found.');
    }

    public function test_admin_can_delete_member_policy_safely(): void
    {
        Storage::fake('local');
        $file = UploadedFile::fake()->create('Member_Policy.pdf', 300, 'application/pdf');

        $this->actingAs($this->admin)
            ->postJson('/api/policies/member_policy', ['file' => $file])
            ->assertStatus(200);

        $policy = Policy::where('type', 'member_policy')->first();
        $this->assertNotNull($policy);
        $filePath = $policy->file_path;
        Storage::disk('local')->assertExists($filePath);

        // Delete policy document
        $this->actingAs($this->admin)
            ->deleteJson('/api/policies/member_policy')
            ->assertStatus(200)
            ->assertJsonPath('policy.hasDocument', false)
            ->assertJsonPath('policy.fileName', null);

        // Database record and storage file removed
        $this->assertDatabaseMissing('policies', ['type' => 'member_policy']);
        Storage::disk('local')->assertMissing($filePath);

        // Metadata list reflects empty state
        $this->getJson('/api/policies')
            ->assertStatus(200)
            ->assertJsonPath('member_policy.hasDocument', false);

        // Preview returns 404
        $this->actingAs($this->member)
            ->getJson('/api/policies/member_policy/preview')
            ->assertStatus(404);
    }

    public function test_admin_can_delete_privacy_policy_safely_and_registration_still_enforces_agreement(): void
    {
        Storage::fake('local');
        $file = UploadedFile::fake()->create('Privacy_Policy.pdf', 280, 'application/pdf');

        $this->actingAs($this->admin)
            ->postJson('/api/policies/privacy_policy', ['file' => $file])
            ->assertStatus(200);

        $policy = Policy::where('type', 'privacy_policy')->first();
        $this->assertNotNull($policy);
        $filePath = $policy->file_path;
        Storage::disk('local')->assertExists($filePath);

        // Delete Privacy Policy
        $this->actingAs($this->admin)
            ->deleteJson('/api/policies/privacy_policy')
            ->assertStatus(200)
            ->assertJsonPath('policy.hasDocument', false);

        $this->assertDatabaseMissing('policies', ['type' => 'privacy_policy']);
        Storage::disk('local')->assertMissing($filePath);

        // Registration MUST still enforce Privacy Policy acceptance
        $payload = [
            'firstName' => 'Bob',
            'lastName' => 'Smith',
            'sex' => 'male',
            'dob' => '1991-03-12',
            'email' => 'bob_smith_' . Str::random(6) . '@test.com',
            'mobile' => '0876543210',
            'address' => '22 Oak Lane',
            'password' => 'secret123',
        ];

        // Without agreement -> fails with 422 validation error
        $this->postJson('/api/register', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['agreedToPrivacy']);

        // With agreement -> succeeds
        $this->postJson('/api/register', array_merge($payload, ['agreedToPrivacy' => true]))
            ->assertStatus(201);
    }

    public function test_non_admin_cannot_delete_policy(): void
    {
        // Unauthenticated
        $this->deleteJson('/api/policies/member_policy')
            ->assertStatus(401);

        // Regular Member
        $this->actingAs($this->member)
            ->deleteJson('/api/policies/member_policy')
            ->assertStatus(403);

        $this->actingAs($this->member)
            ->deleteJson('/api/policies/privacy_policy')
            ->assertStatus(403);
    }

    public function test_delete_handles_missing_document_and_invalid_type_gracefully(): void
    {
        Storage::fake('local');

        // Deleting when no document exists returns 200 with empty state
        $this->actingAs($this->admin)
            ->deleteJson('/api/policies/member_policy')
            ->assertStatus(200)
            ->assertJsonPath('policy.hasDocument', false);

        // Deleting invalid type returns 422
        $this->actingAs($this->admin)
            ->deleteJson('/api/policies/invalid_type')
            ->assertStatus(422);
    }

    public function test_admin_can_upload_again_after_deletion(): void
    {
        Storage::fake('local');
        $file1 = UploadedFile::fake()->create('Initial.pdf', 200, 'application/pdf');

        $this->actingAs($this->admin)
            ->postJson('/api/policies/member_policy', ['file' => $file1])
            ->assertStatus(200);

        // Delete
        $this->actingAs($this->admin)
            ->deleteJson('/api/policies/member_policy')
            ->assertStatus(200);

        // Upload new document
        $file2 = UploadedFile::fake()->create('Replaced_After_Delete.pdf', 250, 'application/pdf');
        $this->actingAs($this->admin)
            ->postJson('/api/policies/member_policy', ['file' => $file2])
            ->assertStatus(200)
            ->assertJsonPath('policy.hasDocument', true)
            ->assertJsonPath('policy.fileName', 'Replaced_After_Delete.pdf');

        $this->assertDatabaseHas('policies', [
            'type' => 'member_policy',
            'file_name' => 'Replaced_After_Delete.pdf',
        ]);
    }

    public function test_admin_can_save_google_docs_url_and_switch_sources_without_duplicates(): void
    {
        $googleDocUrl = 'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit';

        // 1. Admin saves Google Docs URL for privacy_policy
        $res = $this->actingAs($this->admin)
            ->putJson('/api/policies/privacy_policy', [
                'source_type' => 'google_doc',
                'google_docs_url' => $googleDocUrl,
            ]);

        $res->assertStatus(200)
            ->assertJsonPath('policy.sourceType', 'google_doc')
            ->assertJsonPath('policy.googleDocsUrl', $googleDocUrl)
            ->assertJsonPath('policy.hasDocument', true)
            ->assertJsonPath('policy.externalUrl', $googleDocUrl);

        // Ensure exactly 1 record in database
        $this->assertEquals(1, Policy::where('type', 'privacy_policy')->count());

        // 2. Upload a PDF for privacy_policy -> source_type automatically becomes upload
        Storage::fake('local');
        $pdfFile = UploadedFile::fake()->create('privacy.pdf', 150, 'application/pdf');

        $uploadRes = $this->actingAs($this->admin)
            ->postJson('/api/policies/privacy_policy', [
                'file' => $pdfFile,
            ]);

        $uploadRes->assertStatus(200)
            ->assertJsonPath('policy.sourceType', 'upload')
            ->assertJsonPath('policy.fileName', 'privacy.pdf')
            ->assertJsonPath('policy.hasDocument', true);

        // Still exactly 1 record in database
        $this->assertEquals(1, Policy::where('type', 'privacy_policy')->count());

        // 3. Switch back to Google Docs URL without re-uploading
        $switchRes = $this->actingAs($this->admin)
            ->putJson('/api/policies/privacy_policy', [
                'source_type' => 'google_doc',
            ]);

        $switchRes->assertStatus(200)
            ->assertJsonPath('policy.sourceType', 'google_doc')
            ->assertJsonPath('policy.googleDocsUrl', $googleDocUrl)
            ->assertJsonPath('policy.hasDocument', true);

        $this->assertEquals(1, Policy::where('type', 'privacy_policy')->count());

        // 4. Switch back to Upload
        $switchBack = $this->actingAs($this->admin)
            ->putJson('/api/policies/privacy_policy', [
                'source_type' => 'upload',
            ]);

        $switchBack->assertStatus(200)
            ->assertJsonPath('policy.sourceType', 'upload')
            ->assertJsonPath('policy.fileName', 'privacy.pdf')
            ->assertJsonPath('policy.hasDocument', true);

        $this->assertEquals(1, Policy::where('type', 'privacy_policy')->count());
    }

    public function test_google_docs_url_validation(): void
    {
        // Missing URL when switching to google_doc without prior URL
        $this->actingAs($this->admin)
            ->putJson('/api/policies/member_policy', [
                'source_type' => 'google_doc',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['google_docs_url']);

        // Invalid URL string
        $this->actingAs($this->admin)
            ->putJson('/api/policies/member_policy', [
                'source_type' => 'google_doc',
                'google_docs_url' => 'not-a-valid-url',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['google_docs_url']);

        // Non Google Docs domain
        $this->actingAs($this->admin)
            ->putJson('/api/policies/member_policy', [
                'source_type' => 'google_doc',
                'google_docs_url' => 'https://example.com/document/123',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['google_docs_url']);

        // Valid Google Docs URL succeeds
        $this->actingAs($this->admin)
            ->putJson('/api/policies/member_policy', [
                'source_type' => 'google_doc',
                'google_docs_url' => 'https://docs.google.com/document/d/1XYZ/edit',
            ])
            ->assertStatus(200)
            ->assertJsonPath('policy.sourceType', 'google_doc');
    }

    public function test_external_link_for_google_doc_and_upload(): void
    {
        Storage::fake('local');
        $googleDoc = 'https://docs.google.com/document/d/1TestDoc/preview';

        // 1. Configure privacy policy with Google Doc
        $this->actingAs($this->admin)
            ->putJson('/api/policies/privacy_policy', [
                'source_type' => 'google_doc',
                'google_docs_url' => $googleDoc,
            ])
            ->assertStatus(200);

        // Public external link for privacy policy redirects away
        $this->get('/api/policies/privacy_policy/external')
            ->assertStatus(302)
            ->assertRedirect($googleDoc);

        // 2. Configure member policy with uploaded PDF
        $file = UploadedFile::fake()->create('MemberTerms.pdf', 300, 'application/pdf');
        $this->actingAs($this->admin)
            ->postJson('/api/policies/member_policy', ['file' => $file])
            ->assertStatus(200);

        // Authenticated member access to member policy external link succeeds
        $this->actingAs($this->member)
            ->get('/api/policies/member_policy/external')
            ->assertStatus(200)
            ->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_unauthenticated_cannot_access_member_policy_external(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('policies/member_ext.pdf', 'pdf content');
        Policy::create([
            'type' => 'member_policy',
            'title' => 'Member Policy',
            'source_type' => 'upload',
            'file_path' => 'policies/member_ext.pdf',
            'file_name' => 'member_ext.pdf',
            'file_size' => 1234,
            'mime_type' => 'application/pdf',
        ]);

        $this->getJson('/api/policies/member_policy/external')
            ->assertStatus(401);
    }
}
