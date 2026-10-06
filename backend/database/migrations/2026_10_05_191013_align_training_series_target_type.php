<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use App\Services\InvitationSyncService;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        $children = \App\Models\Training::whereNotNull('parent_id')
            ->whereColumn('parent_id', '!=', 'id')
            ->get();
        foreach ($children as $child) {
            $parent = \App\Models\Training::find($child->parent_id);
            if ($parent && !empty($parent->target_type) && $child->target_type !== $parent->target_type) {
                $child->target_type = $parent->target_type;
                $child->save();
            }
        }

        try {
            InvitationSyncService::syncAllTrainingInvitations(true);
        } catch (\Throwable $e) {
            // Ignore if in test environment without full tables
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No-op
    }
};
