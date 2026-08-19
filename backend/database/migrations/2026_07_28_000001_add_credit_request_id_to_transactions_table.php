<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            if (!Schema::hasColumn('transactions', 'credit_request_id')) {
                $table->string('credit_request_id')->nullable()->after('member_id');
                $table->foreign('credit_request_id')->references('id')->on('credit_requests')->onDelete('cascade');
            }
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            if (Schema::hasColumn('transactions', 'credit_request_id')) {
                $table->dropForeign(['credit_request_id']);
                $table->dropColumn('credit_request_id');
            }
        });
    }
};
