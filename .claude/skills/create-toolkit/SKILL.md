---
name: create-toolkit
description: Create or change a student toolkit (toolkits/<toolkit-id>/) — Functions, custom attributes, algorithms and a default design — on the branch toolkit/<toolkit-id>, checked and committed but not pushed.
---
# Create a toolkit

Follow `AGENTS.md` (the one folder, the branch, the checks) and `lab/docs/ai-kit/toolkit/PROMPT.md` (Route A) exactly; `lab/docs/TOOLKITS.md` is the student guide they refer to.

1. Ask the student only for what is missing, in one message: toolkit id (suggest their initials + a word, e.g. `hk-library`), the idea in one or two sentences, the Functions and what they record, the algorithms, the example design. Offer the simplest choice for anything they leave open.
2. Check the branch as `AGENTS.md` §2 says. If `toolkits/<toolkit-id>/` already exists and is not theirs, stop and ask for another id.
3. Write the toolkit as `PROMPT.md` says, only inside `toolkits/<toolkit-id>/`.
4. Run the checks of `AGENTS.md` §4 until they pass; show the real output.
5. Commit only the toolkit folder; do not push unless the student asks. Tell them how to try it in the app.
