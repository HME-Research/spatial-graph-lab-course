---
name: create-toolkit
description: Create a whole new student toolkit folder (toolkits/<toolkit-id>/) — Functions, custom attributes, algorithms and a default design — from the starter, on the branch toolkit/<toolkit-id>, checked and committed but not pushed.
---
# Create a toolkit

Follow `docs/ai-kit/toolkit/PROMPT.md` (Route A) exactly; `docs/TOOLKITS.md` is the student guide it refers to.

1. Read `docs/TOOLKITS.md`, `docs/ai-kit/toolkit/PROMPT.md`, `docs/STUDENT-API.md`, the starter `docs/templates/toolkit/my-toolkit/` and the reference toolkit `toolkits/house/`.
2. Ask the student only for what is missing, in one message: toolkit id (suggest their initials + a word, e.g. `hk-library`), the idea in one or two sentences, the Functions and what they record, the algorithms, the example design. Offer the simplest choice for anything they leave open.
3. Branch: run `git status` and `git branch --show-current`. On `main` or detached, `git switch -c toolkit/<toolkit-id>`. If changes exist outside `toolkits/<toolkit-id>/`, stop and ask. If `toolkits/<toolkit-id>/` already exists and is not theirs, stop and ask for another id.
4. Copy the starter to `toolkits/<toolkit-id>/` and change it to the student's toolkit (keep the folder READMEs; fill in the top README). Write only inside that folder. Never edit `toolkits/house/`, `core/`, `app/`, `student-api/`, `docs/`, `.claude/`, `.github/` or root files.
5. Run `npm run check:toolkit -- -t <toolkit-id>` and `npm run typecheck`; fix inside the folder until both pass. Report the real output.
6. Show `git status` (only the toolkit folder may change) and a short summary, then commit only that folder: `git add toolkits/<toolkit-id>`, `git commit -m "feat(<toolkit-id>): …"`. Do not push unless the student asks; then push only `toolkit/<toolkit-id>`, never `main`.
7. Tell the student how to try it: `npm run dev`, `http://localhost:5173/?toolkit=<toolkit-id>`, Open example…, which algorithm to run and what it should show.
