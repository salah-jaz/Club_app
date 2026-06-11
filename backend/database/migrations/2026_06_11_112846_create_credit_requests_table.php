<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('credit_requests', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('member_id');
            $table->foreign('member_id')->references('id')->on('members')->onDelete('cascade');
            $table->decimal('amount', 10, 2);
            $table->date('date');
            $table->string('status')->default('created'); // 'created', 'approved', 'rejected'
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_requests');
    }
};
