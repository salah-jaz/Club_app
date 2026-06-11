<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rotations', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('schedule_id');
            $table->foreign('schedule_id')->references('id')->on('play_schedules')->onDelete('cascade');
            $table->json('rounds');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rotations');
    }
};
