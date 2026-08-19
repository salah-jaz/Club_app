<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('credit_requests', function (Blueprint $table) {
            $table->string('type')->default('credit')->after('member_id'); // 'credit' | 'debit'
        });
    }

    public function down(): void
    {
        Schema::table('credit_requests', function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }
};
