<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LeagueGroup;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LeagueGroupController extends Controller
{
    public function index()
    {
        $groups = LeagueGroup::with('members')->orderBy('name')->get();
        return response()->json($groups->map(fn($g) => $this->formatGroup($g)));
    }

    public function store(Request $request)
    {
        $request->validate([
            'name'                  => 'required|string|max:255',
            'description'           => 'nullable|string',
            'memberIds'             => 'sometimes|array',
            'memberIds.*'           => 'string|exists:members,id',
            'memberPositions'       => 'sometimes|array',
            'memberPositions.*'     => 'nullable|string|max:255',
        ]);

        $group = LeagueGroup::create([
            'id'          => 'lg_' . Str::random(8),
            'name'        => $request->name,
            'description' => $request->description,
        ]);

        if ($request->has('memberIds')) {
            $syncData = $this->buildSyncData($request->memberIds, $request->memberPositions ?? []);
            $group->members()->sync($syncData);
        }

        return response()->json($this->formatGroup($group->load('members')), 201);
    }

    public function update(Request $request, $id)
    {
        $group = LeagueGroup::findOrFail($id);

        $request->validate([
            'name'                  => 'sometimes|required|string|max:255',
            'description'           => 'nullable|string',
            'memberIds'             => 'sometimes|array',
            'memberIds.*'           => 'string|exists:members,id',
            'memberPositions'       => 'sometimes|array',
            'memberPositions.*'     => 'nullable|string|max:255',
        ]);

        if ($request->has('name'))        $group->name        = $request->name;
        if ($request->has('description')) $group->description = $request->description;
        $group->save();

        if ($request->has('memberIds')) {
            $syncData = $this->buildSyncData($request->memberIds, $request->memberPositions ?? []);
            $group->members()->sync($syncData);
        }

        return response()->json($this->formatGroup($group->load('members')));
    }

    public function destroy($id)
    {
        $group = LeagueGroup::findOrFail($id);
        $group->delete();

        return response()->json(['message' => 'League group deleted successfully.']);
    }

    /**
     * Build the sync array: [ memberId => ['position' => value], ... ]
     */
    private function buildSyncData(array $memberIds, array $memberPositions): array
    {
        $data = [];
        foreach ($memberIds as $memberId) {
            $data[$memberId] = ['position' => $memberPositions[$memberId] ?? null];
        }
        return $data;
    }

    private function formatGroup(LeagueGroup $g): array
    {
        $memberIds       = [];
        $memberPositions = [];

        foreach ($g->members as $member) {
            $memberIds[]                         = $member->id;
            $memberPositions[$member->id]        = $member->pivot->position ?? null;
        }

        return [
            'id'              => $g->id,
            'name'            => $g->name,
            'description'     => $g->description ?? '',
            'memberIds'       => $memberIds,
            'memberPositions' => $memberPositions,
        ];
    }
}
