<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('admin_role_id')->nullable()->after('role');
            $table->boolean('is_super_admin')->default(false)->after('admin_role_id');
            $table->string('created_by')->nullable()->after('is_super_admin');

            $table->foreign('admin_role_id')->references('id')->on('admin_roles')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['admin_role_id']);
            $table->dropColumn(['admin_role_id', 'is_super_admin', 'created_by']);
        });
    }
};
