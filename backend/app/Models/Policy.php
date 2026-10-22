<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Policy extends Model
{
    protected $table = 'policies';

    protected $fillable = [
        'type',
        'title',
        'file_path',
        'file_name',
        'file_size',
        'mime_type',
        'uploaded_by',
    ];

    public const TYPE_MEMBER_POLICY = 'member_policy';
    public const TYPE_PRIVACY_POLICY = 'privacy_policy';

    public static function supportedTypes(): array
    {
        return [
            self::TYPE_MEMBER_POLICY => 'Member Policy',
            self::TYPE_PRIVACY_POLICY => 'Privacy Policy',
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

    public function toResponseArray(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'title' => $this->title,
            'fileName' => $this->file_name,
            'fileSize' => (int) $this->file_size,
            'formattedSize' => self::formatBytes((int) $this->file_size),
            'mimeType' => $this->mime_type,
            'uploadedBy' => $this->uploaded_by,
            'hasDocument' => !empty($this->file_path),
            'updatedAt' => $this->updated_at ? $this->updated_at->toISOString() : null,
            'previewUrl' => url("/api/policies/{$this->type}/preview"),
            'downloadUrl' => url("/api/policies/{$this->type}/download"),
        ];
    }
}
