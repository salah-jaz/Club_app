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
            if ($policy) {
                $result[$type] = $policy->toResponseArray();
            } else {
                $result[$type] = [
                    'id' => null,
                    'type' => $type,
                    'title' => $defaultTitle,
                    'sourceType' => Policy::SOURCE_UPLOAD,
                    'googleDocsUrl' => null,
                    'externalUrl' => null,
                    'fileName' => null,
                    'fileSize' => null,
                    'formattedSize' => null,
                    'mimeType' => null,
                    'uploadedBy' => null,
                    'hasDocument' => false,
                    'hasFile' => false,
                    'hasGoogleDoc' => false,
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

        // Support switching source or updating doc URL through the POST endpoint as well
        if (!$request->hasFile('file') && ($request->has('google_docs_url') || $request->has('source_type'))) {
            return $this->updateSource($request, $type);
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
                'source_type' => Policy::SOURCE_UPLOAD,
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
     * Update policy source configuration (e.g. Google Docs URL or source type switcher).
     * Admin-only (settings.edit permission).
     */
    public function updateSource(Request $request, string $type): JsonResponse
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'settings.edit')) {
            return $response;
        }

        $supported = Policy::supportedTypes();
        if (!array_key_exists($type, $supported)) {
            return response()->json(['message' => 'Invalid policy type.'], 422);
        }

        $existing = Policy::where('type', $type)->first();
        $sourceType = $request->input('source_type', $existing?->source_type ?: Policy::SOURCE_UPLOAD);

        if (!in_array($sourceType, Policy::supportedSources(), true)) {
            return response()->json(['message' => 'Invalid source type specified.'], 422);
        }

        $rules = [
            'source_type' => 'required|in:upload,google_doc',
            'title' => 'nullable|string|max:255',
        ];

        if ($sourceType === Policy::SOURCE_GOOGLE_DOC) {
            $hasExistingDocUrl = !empty($existing?->google_docs_url);
            $rules['google_docs_url'] = [
                $hasExistingDocUrl && !$request->has('google_docs_url') ? 'nullable' : 'required',
                'string',
                'url',
                'max:1000',
                function ($attribute, $value, $fail) {
                    if (!empty($value)) {
                        $host = strtolower((string) parse_url($value, PHP_URL_HOST));
                        if (!$host || (!str_contains($host, 'docs.google.com') && !str_contains($host, 'drive.google.com'))) {
                            $fail('The document URL must be a valid Google Docs or Google Drive link (docs.google.com).');
                        }
                    }
                },
            ];
        }

        $request->validate($rules, [
            'google_docs_url.required' => 'Please enter a Google Docs URL.',
            'google_docs_url.url' => 'Please enter a valid Google Docs URL.',
        ]);

        $policy = Policy::firstOrNew(['type' => $type]);
        $policy->title = $request->input('title') ?: ($policy->title ?: $supported[$type]);
        $policy->source_type = $sourceType;
        if ($request->has('google_docs_url')) {
            $policy->google_docs_url = trim((string) $request->input('google_docs_url'));
        }
        $policy->uploaded_by = $request->user()?->id ?: $policy->uploaded_by;
        $policy->save();

        return response()->json([
            'message' => "{$policy->title} updated successfully.",
            'policy' => $policy->toResponseArray(),
        ], 200);
    }

    /**
     * Directly open or redirect to the policy document in external tab.
     */
    public function external(Request $request, string $type)
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
        if (!$policy) {
            return response()->json(['message' => 'Document not found.'], 404);
        }

        $sourceType = $policy->source_type ?: Policy::SOURCE_UPLOAD;
        if ($sourceType === Policy::SOURCE_GOOGLE_DOC) {
            if (empty($policy->google_docs_url)) {
                return response()->json(['message' => 'Google Docs URL not configured.'], 404);
            }
            return redirect()->away($policy->google_docs_url);
        }

        // Uploaded PDF
        if (!$policy->hasUploadedFile()) {
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
                'sourceType' => Policy::SOURCE_UPLOAD,
                'googleDocsUrl' => null,
                'externalUrl' => null,
                'fileName' => null,
                'fileSize' => null,
                'formattedSize' => null,
                'mimeType' => null,
                'uploadedBy' => null,
                'hasDocument' => false,
                'hasFile' => false,
                'hasGoogleDoc' => false,
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
