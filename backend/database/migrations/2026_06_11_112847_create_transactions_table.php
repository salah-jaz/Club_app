<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('member_id');
            $table->foreign('member_id')->references('id')->on('members')->onDelete('cascade');
            $table->string('type'); // 'credit' or 'debit'
            $table->decimal('amount', 10, 2);
            $table->string('description');
            $table->timestamp('date');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
