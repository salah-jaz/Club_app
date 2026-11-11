<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // General API throttle (applied via $middleware->throttleApi() in bootstrap/app.php).
        // Generous per-user limit so normal SPA polling is unaffected; stricter per-IP for guests.
        RateLimiter::for('api', function (Request $request) {
            return $request->user()
                ? Limit::perMinute(300)->by('user:' . $request->user()->id)
                : Limit::perMinute(120)->by('ip:' . $request->ip());
        });

        try {
            \App\Helpers\SessionTimingHelper::applyClubTimezone();
        } catch (\Throwable $e) {
            // Ignore if the database is not ready yet.
        }
    }
}
