<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('policies', function (Blueprint $table) {
            $table->string('source_type')->default('upload')->after('title');
            $table->text('google_docs_url')->nullable()->after('source_type');
            $table->string('file_path')->nullable()->change();
            $table->string('file_name')->nullable()->change();
            $table->unsignedBigInteger('file_size')->nullable()->change();
            $table->string('mime_type')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('policies', function (Blueprint $table) {
            $table->dropColumn(['source_type', 'google_docs_url']);
        });
    }
};
