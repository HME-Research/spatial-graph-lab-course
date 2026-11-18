# Student briefing — Level 2: Function-based growth

**Question:** How can the *type of an existing room* affect where and what grows?

**Inputs:** The same starting house, a list of function rules, and a maximum number of new rooms.

**Explicit rules (in order):**
1. Add a **study** adjacent to a **living** room, with an Access edge.
2. Add a **pantry** adjacent to a **kitchen**, with an Access edge.
3. Add a **bedroom** adjacent to a **bedroom**, with an Access edge.

For each rule, use the first geometrically free horizontal cell in a fixed search order. If no appropriate position exists, **skip that rule** and explain the failure. The algorithm does not automatically guarantee architectural quality, building compliance, or access to the entrance beyond its created edge.

**Predict first:** Mark where the three new rooms will be placed. Do you expect an algorithm restricted to adjacency to always create a sensible house? Why not?

**Observe:** Compare the outcome to Level 1. Identify what is controlled by room function and what remains arbitrary (the direction preference).

**Experiment:** Change a rule's `anchorType`, `newType` or the order of rules. Test again and explain a case where growth is blocked.

**Evidence:** Exported design, two screenshots, a small rule table, and prediction versus result. No architectural aesthetics are graded.
