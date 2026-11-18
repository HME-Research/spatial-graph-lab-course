# Student briefing — Level 1: Basic growth

**Question:** How can a computer add new rooms without overlapping the existing ones?

**Inputs:** An existing house graph, a starting room ID and a number of growth steps.

**Rule:** Find a free horizontal cell face-adjacent to the chosen room. Add a **new room node**, and explicitly create an **Access edge** to the parent room. Continue from newly added nodes until the number of steps is reached, or no more positions can be found.

**Important distinction:** A room can occupy multiple grid cells, but remains ONE node. This exercise adds a new node; it does not resize an existing room. The algorithm checks geometric contact separately from logical access.

**Predict first:** In the supplied example, the living room occupies two cells, and the entry, kitchen and bedroom occupy three of its nearby positions. Where can the first extension go? Predict three placements before running.

**Observe:** Show the before and after. Which nodes and access edges were added? Which original nodes moved? (None.)

**Experiment:** Change the number of steps or direction ordering in the algorithm; explain the differences. No architectural aesthetics are graded.

**Evidence:** Exported design, two screenshots, a short prediction versus observation, and one limitation of the approach.
