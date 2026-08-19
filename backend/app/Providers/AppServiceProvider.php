<?php

namespace App\Providers;

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
        try {
            \App\Helpers\SessionTimingHelper::applyClubTimezone();
        } catch (\Throwable $e) {
            // Ignore if the database is not ready yet.
        }
    }
}
