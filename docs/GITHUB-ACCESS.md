# GitHub privacy, roles and branch safety

## Current plan: GitHub Free + private personal repository
GitHub docs state protected branches are available on GitHub Free for **public** repos, but private repo protection requires Pro/Team/Enterprise. Thus on your intended **private GitHub Free** repository, granting students write access means you **cannot guarantee** owner-only `main` pushes through branch-protection rules. `CODEOWNERS`, CI, `.claude` instructions and local hooks are not substitutes for server-side policy enforcement.

## Owner development — now
1. Create a private GitHub repository with no student collaborators. The owner develops locally and pushes `main` deliberately.
2. Test whether the site and app work before inviting students. Do not state branch protection is active.
3. Keep `_planning/` and `CLAUDE.local.md` ignored and verify `git ls-files` never lists them.

## Before class — choose one
- **Recommended if requiring one private shared repo:** upgrade eligible account/org plan to allow branch protection, configure `main` to require PR approval, code-owner review where supported, status checks, disallow direct/force pushes for students, and verify with a student test account.
- **Without upgrading:** retain private owner-controlled canonical repository and distribute per-student copies with separate write permissions; collect via PRs in student repos or exported submissions. This is safer than giving collaborators write permissions to an unprotected private `main`.
- **If public source is acceptable:** public repo on Free supports branch protection; students can use forks and PRs, but the code is public. Do not publish owner planning materials.

## Code ownership
Once supported and enforced, make the owner a required reviewer for `core/`, `.claude/`, `.github/`, root config, `docs/` and CLAUDE.md. A CODEOWNERS file alone is advisory unless branch rules require code-owner review.

## CI
CI can flag student modifications to core, run tests and builds; with private Free and no branch-protection enforcement, CI cannot physically stop a collaborator's push to main. Do not rely on CI alone to protect your work.

## Operational rule
Git push, merge, remote/permission changes and deployment require explicit human approval. Claude skills must check branch and diff and refuse student-mode commits on main. This is a workflow safeguard, not an access-control guarantee.

References:
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
