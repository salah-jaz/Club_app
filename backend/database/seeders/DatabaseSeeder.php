<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Location;
use App\Models\Grade;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // 1. Seed Locations
        $locations = ["Main Hall", "North Court", "South Pavilion"];
        $now = now();
        Location::insertOrIgnore(
            collect($locations)->map(fn ($name) => [
                'name' => $name,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all()
        );

        // 2. Seed Grades (rank 1 = strongest within type)
        $adultGrades = ["A", "B", "C", "D"];
        $juniorGrades = ["Beginner", "Intermediate", "Advanced"];
        Grade::insertOrIgnore(
            collect($adultGrades)->map(fn ($name, $index) => [
                'name' => $name,
                'type' => 'adult',
                'rank' => $index + 1,
                'created_at' => $now,
                'updated_at' => $now,
            ])->merge(
                collect($juniorGrades)->map(fn ($name, $index) => [
                    'name' => $name,
                    'type' => 'junior',
                    'rank' => $index + 1,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])
            )->all()
        );

        // 3. Seed permissions and admin roles
        $this->call(PermissionSeeder::class);

        // 4. Seed Admin User
        User::updateOrCreate(['id' => 'u_admin'], [
            'first_name' => 'Club',
            'last_name' => 'Admin',
            'sex' => 'male',
            'dob' => '1985-01-01',
            'email' => 'admin@club.com',
            'mobile' => '+1 555 0100',
            'address' => 'Club HQ',
            'password' => Hash::make('admin123'),
            'role' => 'admin',
            'admin_role_id' => 'ar_super',
            'is_super_admin' => true,
            'status' => 'active',
        ]);
    }
}
