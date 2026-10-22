<?php

namespace App\Http\Controllers\Api;

use App\Helpers\PermissionHelper;
use App\Http\Controllers\Controller;
use App\Models\Policy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class PolicyController extends Controller
{
    /**
     * Get all supported policy documents metadata.
     */
    public static function getAllPoliciesData(): array
    {
        $supported = Policy::supportedTypes();
        $policies = Policy::whereIn('type', array_keys($supported))->get()->keyBy('type');

        $result = [];
        foreach ($supported as $type => $defaultTitle) {
            $policy = $policies->get($type);
            if ($policy && !empty($policy->file_path) && Storage::disk('local')->exists($policy->file_path)) {
                $result[$type] = $policy->toResponseArray();
            } else {
                $result[$type] = [
                    'id' => $policy?->id,
                    'type' => $type,
                    'title' => $policy?->title ?: $defaultTitle,
                    'fileName' => null,
                    'fileSize' => null,
                    'formattedSize' => null,
                    'mimeType' => null,
                    'uploadedBy' => null,
                    'hasDocument' => false,
                    'updatedAt' => null,
                    'previewUrl' => null,
                    'downloadUrl' => null,
                ];
            }
        }

        return $result;
    }

    /**
     * List all policy documents metadata (publicly accessible).
     */
    public function index(): JsonResponse
    {
        return response()->json(self::getAllPoliciesData());
    }

    /**
     * Get single policy metadata.
     */
    public function show(string $type): JsonResponse
    {
        $supported = Policy::supportedTypes();
        if (!array_key_exists($type, $supported)) {
            return response()->json(['message' => 'Invalid policy type.'], 404);
        }

        $all = self::getAllPoliciesData();
        return response()->json($all[$type]);
    }

    /**
     * Upload or replace a policy document.
     * Admin-only (settings.edit permission).
     */
    public function upload(Request $request, string $type): JsonResponse
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'settings.edit')) {
            return $response;
        }

        $supported = Policy::supportedTypes();
        if (!array_key_exists($type, $supported)) {
            return response()->json(['message' => 'Invalid policy type.'], 422);
        }

        $request->validate([
            'file' => [
                'required',
                'file',
                'mimes:pdf',
                'max:10240', // 10MB limit
            ],
            'title' => 'nullable|string|max:255',
        ], [
            'file.required' => 'Please select a PDF file to upload.',
            'file.file' => 'The uploaded file is invalid.',
            'file.mimes' => 'The document must be a PDF file (.pdf).',
            'file.max' => 'The PDF file cannot exceed 10 MB in size.',
        ]);

        $file = $request->file('file');
        if (!$file || !$file->isValid()) {
            return response()->json(['message' => 'File upload failed. Please try again.'], 422);
        }

        // Secondary verification of MIME type and extension
        $ext = strtolower($file->getClientOriginalExtension());
        $mime = strtolower((string) $file->getMimeType());
        if ($ext !== 'pdf' && !str_contains($mime, 'pdf')) {
            return response()->json(['message' => 'Only PDF documents are allowed.'], 422);
        }

        $disk = Storage::disk('local');
        $originalName = $file->getClientOriginalName();
        $storedName = "{$type}_" . time() . '_' . Str::random(8) . '.pdf';

        // 1. Store new file on disk first
        $storedPath = $disk->putFileAs('policies', $file, $storedName);

        if (!$storedPath || !$disk->exists($storedPath)) {
            return response()->json(['message' => 'Failed to save the policy document on the server.'], 500);
        }

        // 2. Fetch existing policy to track old file
        $existing = Policy::where('type', $type)->first();
        $oldPath = $existing?->file_path;

        // 3. Update or create the policy record (ensures single record per policy type)
        $policy = Policy::updateOrCreate(
            ['type' => $type],
            [
                'title' => $request->input('title') ?: ($existing?->title ?: $supported[$type]),
                'file_path' => $storedPath,
                'file_name' => $originalName,
                'file_size' => $file->getSize(),
                'mime_type' => 'application/pdf',
                'uploaded_by' => $request->user()?->id,
            ]
        );

        // 4. Clean up previous file only after database record has been safely updated
        if ($oldPath && $oldPath !== $storedPath && $disk->exists($oldPath)) {
            $disk->delete($oldPath);
        }

        return response()->json([
            'message' => "{$policy->title} uploaded successfully.",
            'policy' => $policy->toResponseArray(),
        ], 200);
    }

    /**
     * Delete a policy document and its database reference.
     * Admin-only (settings.edit permission).
     */
    public function destroy(Request $request, string $type): JsonResponse
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'settings.edit')) {
            return $response;
        }

        $supported = Policy::supportedTypes();
        if (!array_key_exists($type, $supported)) {
            return response()->json(['message' => 'Invalid policy type.'], 422);
        }

        $policy = Policy::where('type', $type)->first();
        $disk = Storage::disk('local');

        if ($policy && !empty($policy->file_path) && $disk->exists($policy->file_path)) {
            $disk->delete($policy->file_path);
        }

        if ($policy) {
            $policy->delete();
        }

        return response()->json([
            'message' => "{$supported[$type]} deleted successfully.",
            'policy' => [
                'id' => null,
                'type' => $type,
                'title' => $supported[$type],
                'fileName' => null,
                'fileSize' => null,
                'formattedSize' => null,
                'mimeType' => null,
                'uploadedBy' => null,
                'hasDocument' => false,
                'updatedAt' => null,
                'previewUrl' => null,
                'downloadUrl' => null,
            ],
        ], 200);
    }

    /**
     * Preview policy PDF in browser.
     */
    public function preview(Request $request, string $type)
    {
        $supported = Policy::supportedTypes();
        if (!array_key_exists($type, $supported)) {
            return response()->json(['message' => 'Invalid policy type.'], 404);
        }

        if ($type === Policy::TYPE_MEMBER_POLICY) {
            $authCheck = $this->authorizeMemberAccess($request);
            if ($authCheck instanceof JsonResponse) {
                return $authCheck;
            }
        }

        $policy = Policy::where('type', $type)->first();
        if (!$policy || empty($policy->file_path) || !Storage::disk('local')->exists($policy->file_path)) {
            return response()->json(['message' => 'Document not found.'], 404);
        }

        $disk = Storage::disk('local');
        $fullPath = $disk->path($policy->file_path);

        return response()->file($fullPath, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="' . addslashes($policy->file_name) . '"',
            'Cache-Control' => 'no-cache, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /**
     * Download policy PDF.
     */
    public function download(Request $request, string $type)
    {
        $supported = Policy::supportedTypes();
        if (!array_key_exists($type, $supported)) {
            return response()->json(['message' => 'Invalid policy type.'], 404);
        }

        if ($type === Policy::TYPE_MEMBER_POLICY) {
            $authCheck = $this->authorizeMemberAccess($request);
            if ($authCheck instanceof JsonResponse) {
                return $authCheck;
            }
        }

        $policy = Policy::where('type', $type)->first();
        if (!$policy || empty($policy->file_path) || !Storage::disk('local')->exists($policy->file_path)) {
            return response()->json(['message' => 'Document not found.'], 404);
        }

        $disk = Storage::disk('local');
        $fullPath = $disk->path($policy->file_path);

        return response()->download($fullPath, $policy->file_name, [
            'Content-Type' => 'application/pdf',
        ]);
    }

    /**
     * Verify caller is authenticated for member policy access.
     */
    private function authorizeMemberAccess(Request $request): ?JsonResponse
    {
        $user = $request->user('sanctum') ?? $request->user();

        if (!$user && $request->filled('token')) {
            $token = PersonalAccessToken::findToken($request->query('token'));
            if ($token && (!$token->expires_at || $token->expires_at->isFuture())) {
                $user = $token->tokenable;
            }
        }

        if (!$user) {
            return response()->json(['message' => 'Unauthorized. Please sign in to access Member Policy.'], 401);
        }

        return null;
    }
}
