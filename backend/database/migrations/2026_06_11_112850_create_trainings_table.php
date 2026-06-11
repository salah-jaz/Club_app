<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trainings', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->date('start_date');
            $table->date('end_date');
            $table->integer('sessions');
            $table->integer('slots');
            $table->string('duration');
            $table->decimal('fees', 10, 2);
            $table->string('coach');
            $table->string('location');
            $table->string('status')->default('open'); // 'open', 'released', 'closed'
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('trainings');
    }
};
