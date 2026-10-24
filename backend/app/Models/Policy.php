<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Policy extends Model
{
    protected $table = 'policies';

    public const TYPE_MEMBER_POLICY = 'member_policy';
    public const TYPE_PRIVACY_POLICY = 'privacy_policy';

    public const SOURCE_UPLOAD = 'upload';
    public const SOURCE_GOOGLE_DOC = 'google_doc';

    protected $fillable = [
        'type',
        'title',
        'source_type',
        'google_docs_url',
        'file_path',
        'file_name',
        'file_size',
        'mime_type',
        'uploaded_by',
    ];

    protected $casts = [
        'file_size' => 'integer',
    ];

    public static function supportedTypes(): array
    {
        return [
            self::TYPE_MEMBER_POLICY => 'Member Policy',
            self::TYPE_PRIVACY_POLICY => 'Privacy Policy',
        ];
    }

    public static function supportedSources(): array
    {
        return [
            self::SOURCE_UPLOAD,
            self::SOURCE_GOOGLE_DOC,
        ];
    }

    public static function formatBytes(?int $bytes, int $precision = 1): string
    {
        if (!$bytes || $bytes <= 0) {
            return '0 B';
        }
        $units = ['B', 'KB', 'MB', 'GB'];
        $power = min((int) floor(log($bytes, 1024)), count($units) - 1);
        return round($bytes / pow(1024, $power), $precision) . ' ' . $units[$power];
    }

    public function hasUploadedFile(): bool
    {
        return !empty($this->file_path) && Storage::disk('local')->exists($this->file_path);
    }

    public function hasGoogleDocsUrl(): bool
    {
        return !empty($this->google_docs_url);
    }

    public function toResponseArray(): array
    {
        $hasFile = $this->hasUploadedFile();
        $hasGoogleDoc = $this->hasGoogleDocsUrl();
        $sourceType = $this->source_type ?: self::SOURCE_UPLOAD;
        $hasDocument = $sourceType === self::SOURCE_GOOGLE_DOC ? $hasGoogleDoc : $hasFile;

        $externalUrl = null;
        if ($sourceType === self::SOURCE_GOOGLE_DOC && $hasGoogleDoc) {
            $externalUrl = $this->google_docs_url;
        } elseif ($hasFile) {
            $externalUrl = url("/api/policies/{$this->type}/preview");
        }

        return [
            'id' => $this->id,
            'type' => $this->type,
            'title' => $this->title,
            'sourceType' => $sourceType,
            'googleDocsUrl' => $this->google_docs_url,
            'externalUrl' => $externalUrl,
            'fileName' => $this->file_name,
            'fileSize' => (int) $this->file_size,
            'formattedSize' => $this->file_size ? self::formatBytes((int) $this->file_size) : null,
            'mimeType' => $this->mime_type,
            'uploadedBy' => $this->uploaded_by,
            'hasDocument' => $hasDocument,
            'hasFile' => $hasFile,
            'hasGoogleDoc' => $hasGoogleDoc,
            'updatedAt' => $this->updated_at ? $this->updated_at->toISOString() : null,
            'previewUrl' => $hasFile ? url("/api/policies/{$this->type}/preview") : null,
            'downloadUrl' => $hasFile ? url("/api/policies/{$this->type}/download") : null,
        ];
    }
}
