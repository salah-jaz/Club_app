<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Align all Adult members' default configuration with Bulk Upload Adult members:
        // membership = true, skip_credit_consumption = false, training_eligible = false
        DB::table('members')
            ->where('member_type', 'adult')
            ->update([
                'membership' => true,
                'skip_credit_consumption' => false,
                'training_eligible' => false,
            ]);
    }

    public function down(): void
    {
        // No revert operation required as this is a data normalization fix
    }
};
