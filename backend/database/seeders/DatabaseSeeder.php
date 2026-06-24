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
        foreach ($locations as $loc) {
            Location::create(['name' => $loc]);
        }

        // 2. Seed Grades
        $grades = ["A", "B", "C", "D", "Beginner", "Intermediate", "Advanced"];
        foreach ($grades as $grade) {
            Grade::create(['name' => $grade]);
        }

        // 3. Seed Users
        User::create([
            'id' => 'u_admin',
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

        User::create([
            'id' => 'u_vol',
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

        User::create([
            'id' => 'u_mem',
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
        Member::create([
            'id' => 'm_john',
            'user_id' => 'u_mem',
            'first_name' => 'John',
            'last_name' => 'Smith',
            'dob' => '1988-03-22',
            'email' => 'john@club.com',
            'sex' => 'male',
            'member_type' => 'adult',
            'membership' => true,
            'league' => true,
            'grade' => 'A',
            'bi_member_id' => 'BI-1001',
            'status' => 'active',
            'credit' => 80.00,
        ]);

        Member::create([
            'id' => 'm_mary',
            'user_id' => 'u_mem',
            'first_name' => 'Mary',
            'last_name' => 'Smith',
            'dob' => '1990-07-11',
            'email' => 'mary@club.com',
            'sex' => 'female',
            'member_type' => 'adult',
            'membership' => true,
            'league' => false,
            'grade' => 'B',
            'bi_member_id' => 'BI-1002',
            'status' => 'active',
            'credit' => 50.00,
        ]);

        Member::create([
            'id' => 'm_alex',
            'user_id' => 'u_mem',
            'first_name' => 'Alex',
            'last_name' => 'Smith',
            'dob' => '2012-09-30',
            'email' => 'alex@club.com',
            'sex' => 'male',
            'member_type' => 'junior',
            'membership' => true,
            'league' => false,
            'grade' => 'Beginner',
            'bi_member_id' => 'BI-1003',
            'status' => 'active',
            'credit' => 30.00,
        ]);
    }
}
