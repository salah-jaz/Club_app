<?php

use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    /**
     * Previously stripped guests down to schedule capacity.
     * Guests are required to fill courts (courts × 4); repair is handled
     * by PlayScheduleController::ensureRotationGuests on load.
     */
    public function up(): void
    {
        // no-op — guest fillers belong on court rotations
    }

    public function down(): void
    {
        //
    }
};
