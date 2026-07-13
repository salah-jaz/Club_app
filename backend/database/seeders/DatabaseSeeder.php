<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Member;
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

        // 2. Seed Grades
        $adultGrades = ["A", "B", "C", "D"];
        $juniorGrades = ["Beginner", "Intermediate", "Advanced"];
        Grade::insertOrIgnore(
            collect($adultGrades)->map(fn ($name) => [
                'name' => $name,
                'type' => 'adult',
                'created_at' => $now,
                'updated_at' => $now,
            ])->merge(
                collect($juniorGrades)->map(fn ($name) => [
                    'name' => $name,
                    'type' => 'junior',
                    'created_at' => $now,
                    'updated_at' => $now,
                ])
            )->all()
        );

        // 3. Seed Users
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
            'status' => 'active',
        ]);

        User::updateOrCreate(['id' => 'u_vol'], [
            'first_name' => 'Vera',
            'last_name' => 'Volunteer',
            'sex' => 'female',
            'dob' => '1990-05-12',
            'email' => 'vera@club.com',
            'mobile' => '+1 555 0101',
            'address' => '12 Court Ave',
            'password' => Hash::make('vera123'),
            'role' => 'volunteer',
            'status' => 'active',
        ]);

        User::updateOrCreate(['id' => 'u_mem'], [
            'first_name' => 'John',
            'last_name' => 'Smith',
            'sex' => 'male',
            'dob' => '1988-03-22',
            'email' => 'john@club.com',
            'mobile' => '+1 555 0102',
            'address' => '44 Smash Rd',
            'password' => Hash::make('john123'),
            'role' => 'member',
            'status' => 'active',
        ]);

        // 4. Seed Members
        /*
        Member::updateOrCreate(['id' => 'm_john'], [
            'user_id' => 'u_mem',
            'first_name' => 'John',
            'last_name' => 'Smith',
            'dob' => '1988-03-22',
            'email' => 'john@club.com',
            'sex' => 'male',
            'member_type' => 'adult',
            'membership' => true,
            'league' => true,
            'training_eligible' => false,
            'grade' => 'A',
            'bi_member_id' => 'BI-1001',
            'status' => 'active',
            'credit' => 80.00,
        ]);

        Member::updateOrCreate(['id' => 'm_mary'], [
            'user_id' => 'u_mem',
            'first_name' => 'Mary',
            'last_name' => 'Smith',
            'dob' => '1990-07-11',
            'email' => 'mary@club.com',
            'sex' => 'female',
            'member_type' => 'adult',
            'membership' => true,
            'league' => false,
            'training_eligible' => false,
            'grade' => 'B',
            'bi_member_id' => 'BI-1002',
            'status' => 'active',
            'credit' => 50.00,
        ]);

        Member::updateOrCreate(['id' => 'm_alex'], [
            'user_id' => 'u_mem',
            'first_name' => 'Alex',
            'last_name' => 'Smith',
            'dob' => '2012-09-30',
            'email' => 'alex@club.com',
            'sex' => 'male',
            'member_type' => 'junior',
            'membership' => true,
            'league' => false,
            'training_eligible' => true,
            'grade' => 'Beginner',
            'bi_member_id' => 'BI-1003',
            'status' => 'active',
            'credit' => 30.00,
        ]);
        */
    }
}
