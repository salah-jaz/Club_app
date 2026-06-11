<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('play_invitations', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('schedule_id');
            $table->foreign('schedule_id')->references('id')->on('play_schedules')->onDelete('cascade');
            $table->string('member_id');
            $table->foreign('member_id')->references('id')->on('members')->onDelete('cascade');
            $table->string('status')->default('open'); // 'open', 'accepted', 'declined', 'waiting'
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('play_invitations');
    }
};
