<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Rejects Sanctum tokens for users who are no longer active (rejected / pending).
 */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && in_array($user->status, ['rejected', 'created'], true)) {
            $user->currentAccessToken()?->delete();

            return response()->json([
                'message' => $user->status === 'rejected'
                    ? 'Your account has been declined. Please contact the administrator.'
                    : 'Your registration is still pending admin approval.',
            ], 401);
        }

        return $next($request);
    }
}
