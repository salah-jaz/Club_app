<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('training_update_requests', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('training_id');
            $table->foreign('training_id')->references('id')->on('trainings')->onDelete('cascade');
            $table->string('member_id');
            $table->foreign('member_id')->references('id')->on('members')->onDelete('cascade');
            $table->json('existing_session_ids')->nullable();
            $table->json('new_session_ids')->nullable();
            $table->decimal('additional_amount', 10, 2)->default(0.00);
            $table->string('status')->default('pending'); // 'pending', 'accepted', 'declined'
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('training_update_requests');
    }
};
