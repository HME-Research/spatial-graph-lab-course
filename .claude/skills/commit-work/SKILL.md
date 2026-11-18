---
name: commit-work
description: Review, stage and create one focused git commit safely; never push without the user's explicit approval.
---
# Commit workflow
1. Run `git status -sb` and `git diff --stat`; verify intended branch. In student mode, if on `main` or detached HEAD, stop.
2. Review staged and unstaged changes. Verify owner-private `_planning/`, `CLAUDE.local.md`, `.claude/settings.local.json`, and owner skills are not tracked.
3. In student mode, require only paths inside the student's own `toolkits/<toolkit-id>/` folder changed. Do not commit protected files.
4. Run the appropriate available validation checks; disclose failures.
5. Show proposed commit message `type(scope): brief summary` and file list; ask approval to commit.
6. Stage explicit paths; create the commit only after approval. Do not automatically push. If requested to push, confirm remote and branch first; never push student work to main.
