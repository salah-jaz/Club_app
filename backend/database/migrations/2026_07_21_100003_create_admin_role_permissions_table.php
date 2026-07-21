<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_role_permissions', function (Blueprint $table) {
            $table->string('admin_role_id');
            $table->string('permission_id');
            $table->primary(['admin_role_id', 'permission_id']);
            $table->foreign('admin_role_id')->references('id')->on('admin_roles')->cascadeOnDelete();
            $table->foreign('permission_id')->references('id')->on('permissions')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_role_permissions');
    }
};
