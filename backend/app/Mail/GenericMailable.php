<?php

namespace App\Mail;

use App\Models\Setting;
use Illuminate\Mail\Mailable;

class GenericMailable extends Mailable
{
    public string $customSubject;
    public string $htmlContent;

    public function __construct(string $customSubject, string $htmlContent)
    {
        $this->customSubject = $customSubject;
        $this->htmlContent = $htmlContent;
    }

    public function build()
    {
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubConnect';
        $appLogoText = Setting::where('key', 'app_logo_text')->value('value') ?? 'C';
        $appLogoBase64 = Setting::where('key', 'app_logo_base64')->value('value') ?? null;
        $primaryColor = Setting::where('key', 'email_primary_color')->value('value') ?? '#10B981';

        $logoHtml = '';

        if ($appLogoBase64) {
            if (str_starts_with($appLogoBase64, 'data:image/')) {
                // Inline Base64 image
                $logoHtml = '<img src="' . $appLogoBase64 . '" alt="' . htmlspecialchars($appName) . '" style="max-height: 48px; display: block; margin: 0 auto;" />';
            } else if (str_starts_with($appLogoBase64, 'http://') || str_starts_with($appLogoBase64, 'https://')) {
                // Absolute public URL
                $logoHtml = '<img src="' . htmlspecialchars($appLogoBase64) . '" alt="' . htmlspecialchars($appName) . '" style="max-height: 48px; display: block; margin: 0 auto;" />';
            } else {
                // Local relative path like /logo.png -> resolve to absolute URL
                $fullUrl = url($appLogoBase64);
                $logoHtml = '<img src="' . htmlspecialchars($fullUrl) . '" alt="' . htmlspecialchars($appName) . '" style="max-height: 48px; display: block; margin: 0 auto;" />';
            }
        }

        if (empty($logoHtml)) {
            $logoHtml = '<div style="display: inline-block; padding: 8px 16px; background: ' . $primaryColor . '; color: #000; font-weight: bold; font-size: 20px; border-radius: 4px; font-family: sans-serif;">' . htmlspecialchars($appLogoText) . '</div>';
        }

        $finalHtml = str_replace('<!--APP_LOGO_HTML-->', $logoHtml, $this->htmlContent);

        return $this->subject($this->customSubject)->html($finalHtml);
    }
}
