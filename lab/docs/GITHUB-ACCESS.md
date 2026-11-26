# GitHub access, the course fork and branch rules

Owner document. Updated 2026-11-25 (public repositories, course fork in an organisation).

## The set-up

| Repository | What it is | Who writes to it |
|---|---|---|
| `heba-eiz/spatial-graph-lab` (public) | the development repository; Vercel production: https://spatial-graph-lab.vercel.app/ | the owner only (no collaborators) |
| `HME-Research/spatial-graph-lab-course` (public fork) | what students clone; their branches `toolkit/<toolkit-id>` live here | students (collaborators with **Write**), the owner as admin |

The course fork is reused every year (see *Yearly reset*). GitHub allows only one fork of a repository per account or organisation, and a fork of a public repository is always public: everything students push is visible to anyone. Owner fixes reach the fork with **Sync fork**.

Because both repositories are public, GitHub Free **enforces** branch rulesets on them. `CODEOWNERS`, CI, `AGENTS.md` and `CLAUDE.md` are guidance and signals only; the rulesets are what stops a push.

## One-time course set-up checklist

Everything below is done by the owner in the browser, or with the `gh` commands given (a coding agent may run them only with the owner's explicit approval).

1. **Fork.** On `heba-eiz/spatial-graph-lab`: **Fork** › Owner `HME-Research`, name `spatial-graph-lab-course`, tick **Copy the `main` branch only**.
2. **Enable Actions in the fork.** Forks start with workflows disabled: fork › **Actions** › *I understand my workflows, go ahead and enable them*. The `quality` workflow then checks every push and, on `toolkit/*` branches, that only that toolkit's folder changed.
3. **Rulesets** (fork › Settings › Rules › Rulesets), or the two `gh api` calls below:
   - **Only toolkit branches**: target every branch except `toolkit/**`; restrict creations, updates and deletions, block force pushes; bypass: Repository admin. Students then cannot push to `main` or create any branch other than `toolkit/…`.
   - **Student branches**: target `toolkit/**`; restrict deletions, block force pushes; bypass: Repository admin. Nobody can delete or overwrite a student's history (they can still add commits to someone else's `toolkit/…` branch: GitHub Free cannot restrict a branch to one person).
4. **Students.** Org base permission stays **No permission**. Invite each student to the fork with role **Write** (fork › Settings › Collaborators and teams), or make an org team `students-<year>` with Write on the fork and add them to it.
5. **Vercel previews of student branches.** In Vercel, **Add New › Project** › import `HME-Research/spatial-graph-lab-course` (framework Vite, all defaults). Every pushed branch then gets its own preview URL. Check two things: that your Vercel plan can deploy a repository owned by an organisation (if not, keep the fork's previews off and test branches locally), and **Settings › Deployment Protection**: with Vercel Authentication on, only members of your Vercel team can open previews.
6. **Test with a student account** (or a second account of your own): clone, push `toolkit/test-xx`, try to push `main` (must be refused), check the Actions run and the preview.

```sh
REPO=HME-Research/spatial-graph-lab-course
# 5 = the built-in "Repository admin" role.
gh api -X POST repos/$REPO/rulesets --input - <<'JSON'
{ "name": "Only toolkit branches", "target": "branch", "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~ALL"], "exclude": ["refs/heads/toolkit/**"] } },
  "rules": [ {"type": "creation"}, {"type": "update"}, {"type": "deletion"}, {"type": "non_fast_forward"} ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ] }
JSON
gh api -X POST repos/$REPO/rulesets --input - <<'JSON'
{ "name": "Student branches", "target": "branch", "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/toolkit/**"], "exclude": [] } },
  "rules": [ {"type": "deletion"}, {"type": "non_fast_forward"} ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ] }
JSON
gh api repos/$REPO/collaborators/<github-username> -X PUT -f permission=push   # invite one student with Write
```

## During the course

- **Owner changes**: develop and push in `heba-eiz/spatial-graph-lab` as usual, then on the fork **Sync fork › Update branch**. Students get them on their own branch with one command, `git pull --no-rebase --no-edit origin main` (the tutorial shows this; they never switch to `main` for it, and `--no-edit` keeps Vim from opening).
- **Reviewing a student**: open the branch's Vercel preview with `?toolkit=<toolkit-id>`, or locally `git fetch` and `git switch toolkit/<toolkit-id>`. The Actions run of the branch shows whether it changed anything outside its folder.
- A student who committed on `main` by mistake cannot push it (the ruleset refuses); they merge `main` into their branch with `git merge --no-edit main` (or create it with `git switch -c toolkit/<toolkit-id>` if it does not exist yet), reset their `main` with `git branch -f main origin/main` and push the branch (tutorial, Git basics › I committed on main).
- **Claiming an id** (owner 2026-11-26, revised): students check that `git status` says `On branch main` (else `git switch main`), run `git pull`, then right after `git switch -c toolkit/<toolkit-id>` students make an empty commit, `git commit --allow-empty -m "chore(<toolkit-id>): claim the toolkit name"`, and push with `git push -u origin toolkit/<toolkit-id>`; they must see `* [new branch]`. Because each claim commit is different, a second student's first push of the same name is always refused (a branch pushed while still equal to `main` was not: the second student got "Everything up-to-date"). The "Student branches" ruleset cannot stop a collaborator adding commits to someone else's `toolkit/…` branch, so the tutorial says that a first push saying **rejected** or **Everything up-to-date** means the name is taken and must never be followed by `git pull`; only a branch the student pushed before is pulled (`git pull --no-rebase --no-edit`). The CI toolkit check skips a branch whose `toolkits/<toolkit-id>/` has no changes yet (the claim commit stays green) and fails when the requested toolkit is not found (`lab/scripts/check-toolkit.mjs`).
- **Public:** the fork is public, so the tutorial asks students to use their GitHub no-reply e-mail and username for git and to put no student number, passwords or keys in their branch or README.
- **Hand-in:** the pushed branch or a zip of `toolkits/<toolkit-id>/` (`<toolkit-id>.zip`); the tutorial's page 10 has a placeholder box for where, the deadline and which counts. Tutor run sheet and marking workflow: owner-local `_planning/tutor-notes.md`.
- **Previews**: until Vercel previews of the fork are confirmed (set-up step 5), the tutorial says the tutor opens a pushed branch on their computer, "and online, once branch previews are set up".

## Yearly reset (option A: one fork per course, reused)

After marking, in a clone of the fork:

```sh
YEAR=2026
git fetch origin --prune
for b in $(git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin/toolkit/); do
  git tag "$YEAR/toolkit/$b" "origin/toolkit/$b"      # keep each student's last commit as a tag
done
git push origin --tags
for b in $(git for-each-ref --format='%(refname:strip=3)' refs/remotes/origin/toolkit/); do
  git push origin --delete "toolkit/$b"               # the admin bypasses the deletion rule
done
```

Then remove the year's collaborators (or the `students-<year>` team), **Sync fork**, and invite the new students. Last year's toolkits stay readable as tags (`git switch --detach 2026/toolkit/<toolkit-id>`).

## Owner-local material

`_planning/`, `CLAUDE.local.md`, `.claude/settings.local.json` and `.claude/skills/owner-*/` are ignored by git and never pushed. Check with `git check-ignore -v <path>` and `git ls-files` before a commit.

References: [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets), [forks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-forks), [code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).
