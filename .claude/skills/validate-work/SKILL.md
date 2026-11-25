---
name: validate-work
description: Check the current design or code change, run actual tests and identify changes outside the allowed folder.
---
# Validate
1. Check branch and `git status --short`.
2. Inspect actual diff; list changes to `lab/core/`, `lab/app/`, `lab/student-api/`, other toolkits, `.claude/`, `.github/`, root configuration (`package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html`) and docs separately.
3. If student task touched protected files, report and stop before commit. Do not silently revert or delete student changes.
4. Run available `npm run typecheck`, `npm test -- --run`, `npm run build` once scripts exist; report missing commands plainly.
5. Test a relevant boundary case: invalid edge, overlapping room positions, shared-face ownership or JSON invalidity.
6. Report pass/fail evidence; do not claim unseen browser UI verification.
