<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fixtures', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->dateTime('date');
            $table->string('league_group_id');
            $table->foreign('league_group_id')->references('id')->on('league_groups')->onDelete('cascade');
            $table->string('match_type');
            $table->string('venue_type');
            $table->string('opposition_club');
            $table->string('team_name');
            $table->string('grade');
            $table->enum('status', ['Opened', 'In Progress', 'Closed'])->default('Opened');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fixtures');
    }
};
