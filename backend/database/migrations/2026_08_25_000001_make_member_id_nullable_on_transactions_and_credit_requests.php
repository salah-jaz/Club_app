<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->string('member_id')->nullable()->change();
        });

        Schema::table('credit_requests', function (Blueprint $table) {
            $table->string('member_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->string('member_id')->nullable(false)->change();
        });

        Schema::table('credit_requests', function (Blueprint $table) {
            $table->string('member_id')->nullable(false)->change();
        });
    }
};
