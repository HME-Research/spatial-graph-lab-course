# Expected Level 1 observations

Given exact example IDs and the ordered directions `+x, -x, +y, -y`, the first new extension is at `[2,1,0]`, connected to `living`. The second extends from the new room to `[3,1,0]`; the third extends from that room to `[4,1,0]`. The expected result for `steps=3` is six operations: 3 `add-node`, 3 `add-edge`.

Test cases: (a) default, (b) `steps=1`, (c) all horizontal neighbours occupied (requires designing a blocked enclosed test setup), (d) non-existing start room produces zero operations, (e) multi-cell room must check every occupied grid cell.

**Limitation:** The direction order prioritises +x. It is not an optimised or architecturally informed placement method.
