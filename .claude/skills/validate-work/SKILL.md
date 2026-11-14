---
name: validate-work
description: Check the current design or code change, run actual tests and identify changes outside the allowed folder.
---
# Validate
1. Check branch and `git status --short`.
2. Inspect actual diff; list changes to `core/`, `.claude/`, `.github/`, root configuration and docs separately.
3. If student task touched protected files, report and stop before commit. Do not silently revert or delete student changes.
4. Run available `npm run typecheck`, `npm test -- --run`, `npm run build` once scripts exist; report missing commands plainly.
5. Test a relevant boundary case: invalid edge, duplicate grid coordinate, shared-face ownership or JSON invalidity.
6. Report pass/fail evidence; do not claim unseen browser UI verification.
