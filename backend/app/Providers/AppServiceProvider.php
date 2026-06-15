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
            if (\Schema::hasTable('settings')) {
                $settings = \App\Models\Setting::all()->pluck('value', 'key');
                
                if (isset($settings['mail_host']) && !empty($settings['mail_host'])) {
                    config([
                        'mail.default' => 'smtp',
                        'mail.mailers.smtp.host' => $settings['mail_host'],
                        'mail.mailers.smtp.port' => $settings['mail_port'] ?? 587,
                        'mail.mailers.smtp.username' => $settings['mail_username'] ?? null,
                        'mail.mailers.smtp.password' => $settings['mail_password'] ?? null,
                        'mail.mailers.smtp.encryption' => $settings['mail_encryption'] ?? 'tls',
                        'mail.from.address' => $settings['mail_from_address'] ?? 'no-reply@clubconnect.com',
                        'mail.from.name' => $settings['mail_from_name'] ?? config('app.name'),
                    ]);
                }
            }
        } catch (\Exception $e) {
            // Avoid failing if migration/database hasn't been set up yet
        }
    }
}
