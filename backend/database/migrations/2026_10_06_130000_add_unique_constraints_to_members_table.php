<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Clean up confirmed duplicate test records if they exist in the target database
        // Duplicate Dbl Approve record
        DB::table('play_invitations')->where('member_id', 'm_mUbUXnuM')->delete();
        DB::table('members')->where('id', 'm_mUbUXnuM')->delete();

        // Duplicate QA Registrant record
        DB::table('play_invitations')->where('member_id', 'm_OmJO5sbV')->delete();
        DB::table('members')->where('id', 'm_OmJO5sbV')->delete();

        // Restore m_07ZANW7F email to match its user u_RowfxuGR if it was modified to irfan2
        $irfanUser = DB::table('users')->where('id', 'u_RowfxuGR')->first();
        if ($irfanUser && $irfanUser->email === 'irfan1@gmail.com') {
            DB::table('members')
                ->where('id', 'm_07ZANW7F')
                ->where('email', 'irfan2@gmail.com')
                ->update(['email' => 'irfan1@gmail.com']);
        }

        // 2. Add database-level unique constraints via virtual generated columns
        // Prevents duplicate active adult emails while allowing juniors to share parent family emails
        // and preserving deleted/disabled member email reuse.
        Schema::table('members', function (Blueprint $table) {
            $table->string('active_adult_email')
                ->virtualAs("CASE WHEN member_type = 'adult' AND status = 'active' THEN email ELSE NULL END")
                ->nullable()
                ->unique('members_active_adult_email_unique');

            $table->string('active_adult_user_id')
                ->virtualAs("CASE WHEN member_type = 'adult' AND user_id IS NOT NULL THEN user_id ELSE NULL END")
                ->nullable()
                ->unique('members_active_adult_user_unique');
        });
    }

    public function down(): void
    {
        Schema::table('members', function (Blueprint $table) {
            $table->dropUnique('members_active_adult_email_unique');
            $table->dropColumn('active_adult_email');
            $table->dropUnique('members_active_adult_user_unique');
            $table->dropColumn('active_adult_user_id');
        });
    }
};
