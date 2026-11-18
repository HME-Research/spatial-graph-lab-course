# Expected Level 2 observations

With the example house and the ordered directions `+x, -x, +y, -y`, the rules should add:

1. study `[2,1,0]` from `living` (the first free neighbouring cell across the living room footprint),
2. pantry `[4,0,0]` from `kitchen`,
3. bedroom `[1,2,0]` from `bedroom` (its `+x` neighbour `[2,1,0]` is now occupied).

Expected 6 operations: 3 `add-node` and 3 `add-edge` for `maxNewRooms=3`.

Test cases: (a) default, (b) maxNewRooms=1, (c) change a rule so its source function does not exist, (d) block available cells around an eligible anchor, (e) modify rule order and observe whether occupancy changes later placements.

**Limitations:** Rules only use type and occupancy, not graph distance, accessibility of the whole house, daylight, circulation quality or building regulations.
