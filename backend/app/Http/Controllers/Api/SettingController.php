<?php

namespace App\Http\Controllers\Api;

use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\Member;
use App\Models\Transaction;
use App\Helpers\FeeHelper;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Models\Grade;
use App\Models\Holiday;
use App\Models\PlayerPosition;
use App\Models\Setting;
use App\Helpers\MailHelper;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    private $settingKeys = [
        'appName' => 'app_name',
        'appLogoText' => 'app_logo_text',
        'appLogoBase64' => 'app_logo_base64',
        'currency' => 'currency',
        'skipCreditConsumption' => 'skip_credit_consumption',
        'mailHost' => 'mail_host',
        'mailPort' => 'mail_port',
        'mailUsername' => 'mail_username',
        'mailPassword' => 'mail_password',
        'mailEncryption' => 'mail_encryption',
        'mailFromAddress' => 'mail_from_address',
        'mailFromName' => 'mail_from_name',
        'emailPrimaryColor' => 'email_primary_color',
        'emailBgColor' => 'email_bg_color',
        'emailTextColor' => 'email_text_color',
        'emailCardBgColor' => 'email_card_bg_color',
        'emailFooterText' => 'email_footer_text',
        'cancellationLockHours' => 'cancellation_lock_hours',
        'debitTimingHours' => 'debit_timing_hours',
        'showGradeInCourtRotation' => 'show_grade_in_court_rotation',
        'adultDiscountPercent' => 'adult_discount_percent',
        'adultDiscountAmount' => 'adult_discount_amount',
        'adultDiscountMode' => 'adult_discount_mode',
        'juniorDiscountPercent' => 'junior_discount_percent',
        'juniorDiscountAmount' => 'junior_discount_amount',
        'juniorDiscountMode' => 'junior_discount_mode',
        'timezone' => 'timezone',
    ];

    public function index()
    {
        $dbSettings = Setting::all()->pluck('value', 'key');

        $data = [
            'locations'       => Location::pluck('name')->toArray(),
            'grades'          => Grade::orderBy('rank')->orderBy('name')->pluck('name')->toArray(),
            'adultGrades'     => Grade::where('type', 'adult')->orderBy('rank')->orderBy('name')->pluck('name')->toArray(),
            'juniorGrades'    => Grade::where('type', 'junior')->orderBy('rank')->orderBy('name')->pluck('name')->toArray(),
            'holidays'        => Holiday::pluck('date')->toArray(),
            'holidayItems'    => Holiday::orderBy('date')->get()->map(fn ($h) => [
                'name' => $h->name ?? '',
                'date' => $h->date,
            ])->values()->all(),
            'playerPositions' => PlayerPosition::orderBy('name')->pluck('name')->toArray(),
            'playerPositionItems' => PlayerPosition::orderBy('name')->get()->map(fn ($p) => [
                'name' => $p->name,
                'skipLeagueFee' => (bool) $p->skip_league_fee,
            ])->values()->all(),
        ];

        foreach ($this->settingKeys as $camel => $snake) {
            $val = $dbSettings->get($snake);
            if ($camel === 'skipCreditConsumption') {
                $data[$camel] = $val === 'true';
            } else if ($camel === 'showGradeInCourtRotation') {
                $data[$camel] = $val === 'true';
            } else if ($camel === 'cancellationLockHours' || $camel === 'debitTimingHours') {
                $data[$camel] = $val !== null ? (int)$val : null;
            } else if (in_array($camel, ['adultDiscountPercent', 'adultDiscountAmount', 'juniorDiscountPercent', 'juniorDiscountAmount'], true)) {
                $data[$camel] = $val !== null && $val !== '' ? (float)$val : 0;
            } else {
                $data[$camel] = $val;
            }
        }

        // Apply fallback defaults if not set in DB
        if (empty($data['appName'])) $data['appName'] = 'Connect App';
        if (empty($data['appLogoText'])) $data['appLogoText'] = 'C';
        if (empty($data['appLogoBase64'])) $data['appLogoBase64'] = '/logo.png';
        if (empty($data['currency'])) $data['currency'] = '$';
        if (empty($data['timezone'])) $data['timezone'] = 'Asia/Kolkata';
        if ($data['cancellationLockHours'] === null) $data['cancellationLockHours'] = 24;
        if ($data['debitTimingHours'] === null) $data['debitTimingHours'] = 24;
        foreach (['adultDiscountPercent', 'adultDiscountAmount', 'juniorDiscountPercent', 'juniorDiscountAmount'] as $discountKey) {
            if (!isset($data[$discountKey])) $data[$discountKey] = 0;
        }
        foreach (['adultDiscountMode', 'juniorDiscountMode'] as $modeKey) {
            if (($data[$modeKey] ?? null) !== 'percent' && ($data[$modeKey] ?? null) !== 'amount') {
                $amountKey = str_replace('Mode', 'Amount', $modeKey);
                $percentKey = str_replace('Mode', 'Percent', $modeKey);
                $data[$modeKey] = (($data[$amountKey] ?? 0) > 0 && ($data[$percentKey] ?? 0) <= 0) ? 'amount' : 'percent';
            }
        }

        return response()->json($data);
    }

    public function update(Request $request)
    {
        // 1. Save standard settings
        foreach ($this->settingKeys as $camel => $snake) {
            if ($request->has($camel)) {
                $val = $request->input($camel);
                if ($camel === 'skipCreditConsumption' || $camel === 'showGradeInCourtRotation') {
                    $val = filter_var($val, FILTER_VALIDATE_BOOLEAN) ? 'true' : 'false';
                }
                if (in_array($camel, ['adultDiscountMode', 'juniorDiscountMode'], true)) {
                    $val = $val === 'amount' ? 'amount' : 'percent';
                }
                Setting::updateOrCreate(['key' => $snake], ['value' => $val]);
            }
        }

        // 2. Save lists if provided
        if ($request->has('locations')) {
            $newLocations = $request->locations ?? [];
            Location::whereNotIn('name', $newLocations)->delete();
            $now = now();
            foreach ($newLocations as $loc) {
                Location::firstOrCreate(['name' => $loc], ['created_at' => $now, 'updated_at' => $now]);
            }
        }

        if ($request->has('adultGrades')) {
            $newAdultGrades = array_values(array_filter($request->adultGrades ?? [], fn($g) => is_string($g) && $g !== ''));
            Grade::where('type', 'adult')->whereNotIn('name', $newAdultGrades)->delete();
            $now = now();
            foreach ($newAdultGrades as $index => $g) {
                $rank = $index + 1;
                $grade = Grade::firstOrNew(['name' => $g]);
                $grade->type = 'adult';
                $grade->rank = $rank;
                if (!$grade->exists) {
                    $grade->created_at = $now;
                }
                $grade->updated_at = $now;
                $grade->save();
            }
        }

        if ($request->has('juniorGrades')) {
            $newJuniorGrades = array_values(array_filter($request->juniorGrades ?? [], fn($g) => is_string($g) && $g !== ''));
            Grade::where('type', 'junior')->whereNotIn('name', $newJuniorGrades)->delete();
            $now = now();
            foreach ($newJuniorGrades as $index => $g) {
                $rank = $index + 1;
                $grade = Grade::firstOrNew(['name' => $g]);
                $grade->type = 'junior';
                $grade->rank = $rank;
                if (!$grade->exists) {
                    $grade->created_at = $now;
                }
                $grade->updated_at = $now;
                $grade->save();
            }
        }

        $savedHolidayDates = [];
        if ($request->has('holidayItems')) {
            Holiday::truncate();
            $now = now();
            foreach ($request->holidayItems as $h) {
                if (is_array($h)) {
                    $date = $h['date'] ?? null;
                    $name = trim($h['name'] ?? '');
                } else {
                    $date = $h;
                    $name = '';
                }
                if ($date) {
                    Holiday::create(['date' => $date, 'name' => $name, 'created_at' => $now, 'updated_at' => $now]);
                    $savedHolidayDates[] = \Carbon\Carbon::parse($date)->toDateString();
                }
            }
        } elseif ($request->has('holidays')) {
            Holiday::truncate();
            $now = now();
            foreach ($request->holidays as $h) {
                if (is_array($h)) {
                    $date = $h['date'] ?? null;
                    $name = trim($h['name'] ?? '');
                } else {
                    $date = $h;
                    $name = '';
                }
                if ($date) {
                    Holiday::create(['date' => $date, 'name' => $name, 'created_at' => $now, 'updated_at' => $now]);
                    $savedHolidayDates[] = \Carbon\Carbon::parse($date)->toDateString();
                }
            }
        }

        $allHolidayDates = Holiday::pluck('date')->toArray();
        if (!empty($allHolidayDates)) {
            $this->processHolidayRefunds($allHolidayDates);
        }

        if ($request->has('playerPositionItems')) {
            $items = $request->playerPositionItems ?? [];
            $names = [];
            $now = now();
            foreach ($items as $item) {
                if (is_string($item)) {
                    $name = trim($item);
                    $skip = false;
                } elseif (is_array($item)) {
                    $name = trim((string) ($item['name'] ?? ''));
                    $skip = filter_var($item['skipLeagueFee'] ?? false, FILTER_VALIDATE_BOOLEAN);
                } else {
                    continue;
                }
                if ($name === '') {
                    continue;
                }
                $names[] = $name;
                $pos = PlayerPosition::firstOrNew(['name' => $name]);
                $pos->skip_league_fee = $skip;
                if (!$pos->exists) {
                    $pos->created_at = $now;
                }
                $pos->updated_at = $now;
                $pos->save();
            }
            if (!empty($names)) {
                PlayerPosition::whereNotIn('name', $names)->delete();
            } else {
                PlayerPosition::query()->delete();
            }
        } elseif ($request->has('playerPositions')) {
            // Legacy: name list only — preserve skip_league_fee for existing names
            $newPositions = array_values(array_filter(
                $request->playerPositions ?? [],
                fn($p) => is_string($p) && $p !== ''
            ));
            PlayerPosition::whereNotIn('name', $newPositions)->delete();
            $now = now();
            foreach ($newPositions as $pos) {
                PlayerPosition::firstOrCreate(
                    ['name' => $pos],
                    ['skip_league_fee' => false, 'created_at' => $now, 'updated_at' => $now]
                );
            }
        }

        return $this->index();
    }

    public function testSmtp(Request $request)
    {
        $request->validate([
            'mailHost' => 'required|string',
            'mailPort' => 'required',
            'mailUsername' => 'nullable|string',
            'mailPassword' => 'nullable|string',
            'mailEncryption' => 'nullable|string',
            'mailFromAddress' => 'required|email',
            'mailFromName' => 'required|string',
            'testEmail' => 'sometimes|email',
        ]);

        try {
            MailHelper::applySmtpSettings([
                'mailHost' => $request->mailHost,
                'mailPort' => $request->mailPort,
                'mailEncryption' => $request->mailEncryption,
                'mailUsername' => $request->mailUsername,
                'mailPassword' => $request->mailPassword,
                'mailFromAddress' => $request->mailFromAddress,
                'mailFromName' => $request->mailFromName,
            ]);

            $to = $request->input('testEmail', $request->user()->email);
            $subject = "SMTP Test Connection Success";
            $content = "
                <h2 style=\"color: #34D399; font-size: 18px; margin-top: 0;\">SMTP Connection Successful!</h2>
                <p>Hello,</p>
                <p>This is a test email sent from the club portal settings panel.</p>
                <p>If you are reading this email, it means your SMTP server configurations are correct and working perfectly.</p>
            ";

            MailHelper::sendEmail($to, $subject, $content);

            return response()->json([
                'status' => 'success',
                'message' => 'Test email sent successfully to ' . $to,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function processHolidayRefunds(array $holidayDates): void
    {
        $holidayDates = array_values(array_unique(array_filter($holidayDates)));
        if (empty($holidayDates)) {
            return;
        }

        foreach ($holidayDates as $hDate) {
            $scheduleDateStr = \Carbon\Carbon::parse($hDate)->toDateString();

            $schedules = PlaySchedule::whereDate('date', $scheduleDateStr)->get();

            foreach ($schedules as $schedule) {
                $memberIdsToRefund = [];

                $invitations = PlayInvitation::where('schedule_id', $schedule->id)->get();
                foreach ($invitations as $invite) {
                    if ($invite->debited && is_string($invite->member_id) && !str_starts_with($invite->member_id, 'guest_')) {
                        $memberIdsToRefund[$invite->member_id] = $invite;
                    }
                }

                $debitTxns = Transaction::where('type', 'debit')
                    ->where(function ($q) use ($schedule) {
                        $q->where('description', 'Play session: ' . $schedule->name)
                          ->orWhere('description', 'like', '%' . $schedule->name . '%');
                    })
                    ->get();

                foreach ($debitTxns as $dt) {
                    if ($dt->member_id && !str_starts_with($dt->member_id, 'guest_')) {
                        if (!isset($memberIdsToRefund[$dt->member_id])) {
                            $memberIdsToRefund[$dt->member_id] = null;
                        }
                    }
                }

                foreach ($memberIdsToRefund as $memberId => $invite) {
                    $member = Member::find($memberId);
                    if (!$member) {
                        continue;
                    }

                    if ($member->skip_credit_consumption || $this->memberSkipsLeagueFee($schedule, $member->id)) {
                        if ($invite) {
                            $invite->debited = false;
                            $invite->save();
                        }
                        continue;
                    }

                    $desc = 'Refund – Club Holiday: ' . $scheduleDateStr;
                    $descHyphen = 'Refund - Club Holiday: ' . $scheduleDateStr;

                    $alreadyRefunded = Transaction::where('member_id', $member->id)
                        ->where('type', 'credit')
                        ->where(function ($q) use ($desc, $descHyphen, $scheduleDateStr) {
                            $q->where('description', $desc)
                              ->orWhere('description', $descHyphen)
                              ->orWhere('description', 'like', 'Refund%Club Holiday%' . $scheduleDateStr . '%');
                        })
                        ->exists();

                    if (!$alreadyRefunded) {
                        $debitTxn = Transaction::where('member_id', $member->id)
                            ->where('type', 'debit')
                            ->where(function ($q) use ($schedule) {
                                $q->where('description', 'Play session: ' . $schedule->name)
                                  ->orWhere('description', 'like', '%' . $schedule->name . '%');
                            })
                            ->latest()
                            ->first();

                        $refundAmount = $debitTxn ? (float) $debitTxn->amount : FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);

                        if ($refundAmount > 0) {
                            $member->credit += $refundAmount;
                            $member->save();

                            $transaction = Transaction::create([
                                'id' => 't_' . Str::random(8),
                                'member_id' => $member->id,
                                'type' => 'credit',
                                'amount' => $refundAmount,
                                'description' => $desc,
                                'date' => now(),
                            ]);

                            try {
                                MailHelper::sendTransactionEmail($member, $transaction);
                            } catch (\Exception $e) {
                                logger()->error("Holiday refund email failed for member {$member->id}: " . $e->getMessage());
                            }
                        }
                    }

                    if ($invite) {
                        $invite->debited = false;
                        $invite->save();
                    }
                }
            }
        }
    }

    private function memberSkipsLeagueFee(PlaySchedule $schedule, string $memberId): bool
    {
        if (!$schedule->is_league_match || empty($schedule->league_group_ids)) {
            return false;
        }

        $positions = DB::table('league_group_member')
            ->whereIn('league_group_id', $schedule->league_group_ids)
            ->where('member_id', $memberId)
            ->whereNotNull('position')
            ->pluck('position')
            ->unique()
            ->filter()
            ->values()
            ->all();

        if (empty($positions)) {
            return false;
        }

        return PlayerPosition::whereIn('name', $positions)
            ->where('skip_league_fee', true)
            ->exists();
    }
}
