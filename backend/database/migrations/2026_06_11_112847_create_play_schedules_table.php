<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('play_schedules', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->timestamp('date');
            $table->integer('courts');
            $table->integer('players');
            $table->decimal('slot_hours', 5, 2);
            $table->string('slot_duration');
            $table->decimal('session_rate', 10, 2);
            $table->decimal('hall_rate', 10, 2);
            $table->string('location');
            $table->string('status')->default('open'); // 'open', 'released', 'rotated', 'closed'
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('play_schedules');
    }
};
