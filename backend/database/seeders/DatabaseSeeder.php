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

        /*
        // 5. Seed Member Users
        $memberUsers = [
            [
                'id' => 'u_member01',
                'first_name' => 'John',
                'last_name' => 'Doe',
                'email' => 'member@club.com',
                'sex' => 'male',
                'dob' => '1992-05-15',
                'mobile' => '+1 555 0101',
                'address' => '123 Main St',
                'password' => Hash::make('member123'),
                'role' => 'member',
                'status' => 'active',
                'member_id' => 'm_member01',
                'bi_member_id' => 'BI001',
                'grade' => 'A',
            ],
            [
                'id' => 'u_member02',
                'first_name' => 'Sarah',
                'last_name' => 'Smith',
                'email' => 'sarah@club.com',
                'sex' => 'female',
                'dob' => '1995-08-20',
                'mobile' => '+1 555 0102',
                'address' => '456 Oak Ave',
                'password' => Hash::make('member123'),
                'role' => 'member',
                'status' => 'active',
                'member_id' => 'm_member02',
                'bi_member_id' => 'BI002',
                'grade' => 'B',
            ],
        ];

        foreach ($memberUsers as $uData) {
            $user = User::updateOrCreate(['id' => $uData['id']], [
                'first_name' => $uData['first_name'],
                'last_name' => $uData['last_name'],
                'sex' => $uData['sex'],
                'dob' => $uData['dob'],
                'email' => $uData['email'],
                'mobile' => $uData['mobile'],
                'address' => $uData['address'],
                'password' => $uData['password'],
                'role' => $uData['role'],
                'status' => $uData['status'],
            ]);

            \App\Models\Member::updateOrCreate(['id' => $uData['member_id']], [
                'user_id' => $user->id,
                'first_name' => $uData['first_name'],
                'last_name' => $uData['last_name'],
                'dob' => $uData['dob'],
                'email' => $uData['email'],
                'mobile' => $uData['mobile'],
                'sex' => $uData['sex'],
                'member_type' => 'adult',
                'membership' => true,
                'training_eligible' => false,
                'play_eligible' => true,
                'grade' => $uData['grade'],
                'bi_member_id' => $uData['bi_member_id'],
                'status' => 'active',
                'credit' => 100.00,
            ]);
        }
        */
    }
}
