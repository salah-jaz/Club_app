<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('members', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('user_id')->nullable();
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->string('first_name');
            $table->string('last_name');
            $table->date('dob');
            $table->string('email');
            $table->enum('sex', ['male', 'female']);
            $table->string('member_type'); // 'adult' or 'junior'
            $table->boolean('membership')->default(false);
            $table->boolean('league')->default(false);
            $table->string('grade');
            $table->string('bi_member_id')->nullable();
            $table->string('status')->default('active'); // 'active' or 'disabled'
            $table->decimal('credit', 10, 2)->default(0.00);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('members');
    }
};
