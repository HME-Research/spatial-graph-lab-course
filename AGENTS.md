# Instructions for coding agents

You are helping a **student** of the course *Graph, Rules & Space* in the repository of *Spatial Graph Lab*, a browser app that turns a graph of rooms and relationships into architecture. The student is an architecture student and usually a beginner in programming and git. These rules apply to every coding agent (Claude Code, Codex, Copilot, Cursor, …).

## 1. The one folder you may change

The student owns exactly one folder: **`toolkits/<your-toolkit-name>/`** (their toolkit). Their toolkit name looks like `u123-hk-house`: `u`, the last 3 digits of their student number, their initials and a short name. Create, edit and delete files **only** there.

Never create, edit, move, rename, delete, reformat or regenerate anything else, even if a check or a tool suggests it:

| Never touch | What it is |
|---|---|
| `lab/` | the app itself (`core`, `app`, `student-api`, `docs`, `scripts`, `public`), maintained by the course owner |
| `toolkits/house/` | the House example, the owner's reference toolkit (read it, copy from it, never edit it) |
| `tutorial/` | the step-by-step student tutorial and its kits |
| `toolkits/<another-id>/` | other students' toolkits |
| `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `index.html` | the build set-up: never install, add or upgrade a package |
| `README.md`, `AGENTS.md`, `CLAUDE.md`, `LICENSE`, `.claude/`, `.github/`, `.gitignore` | repository instructions and settings |

If the student's idea seems to need a change outside their folder, **stop**, explain why in plain words, and propose the closest thing that can be done inside it. The app reports problems in a toolkit instead of crashing, so a failing check is fixed inside the toolkit, never in `lab/`.

## 2. Git: their own branch, never `main`

- Work only on the branch **`toolkit/<your-toolkit-name>`**. First run `git status` and `git branch --show-current`.
  - On `main` (or a detached HEAD): switch with `git switch toolkit/<your-toolkit-name>` if it exists. Otherwise the student makes the branch and sends it to GitHub first (they push, not you): `git status` (must say `On branch main`, else `git switch main`), `git pull`, `git switch -c toolkit/<your-toolkit-name>`, `git commit --allow-empty -m "chore(<your-toolkit-name>): start my toolkit"`, `git push -u origin toolkit/<your-toolkit-name>`, which must print `* [new branch]`.
  - Uncommitted changes outside `toolkits/<your-toolkit-name>/`: **stop** and ask the student; never discard them yourself.
- Commit only the toolkit folder: `git add toolkits/<your-toolkit-name>`, then `git status` must list nothing outside it. Message: `feat(<your-toolkit-name>): <what changed>` (or `fix(<your-toolkit-name>): …`).
- **Do not push** unless the student asks. Then push only their branch: `git push -u origin toolkit/<your-toolkit-name>`. Never push `main`, never force-push, never merge, rebase or reset someone else's work, never delete a branch.
- A first push of the branch that says **rejected** or **Everything up-to-date** means someone else already has a branch with that name: **stop**, never pull or merge that branch, and help the student change their toolkit name a little. Only when the student pushed this branch before (for example from another computer) bring the remote commits in with `git pull --no-rebase --no-edit`, then push.
- To bring in the owner's updates, on the student's branch (never switch to `main` for this): `git pull --no-rebase --no-edit origin main`. If that conflicts outside the toolkit folder, run `git merge --abort`, stop and ask.
- Never run `git reset --hard`, `git clean`, `git checkout -- .`, `git restore .` or `git stash` on the student's work: they also wipe the toolkit folder. To undo a change outside the folder, restore **only that file** (`git restore --staged <file>`, `git restore <file>`), then show `git status`.

## 3. What to read

| For | Read |
|---|---|
| Making or changing a toolkit (folder, rules, checks, both ways of working) | `lab/docs/TOOLKITS.md` |
| The exact instructions for writing a toolkit (Route A is you) | `lab/docs/ai-kit/toolkit/PROMPT.md` |
| Every definer, field, operation and calculated value toolkit code may use | `lab/docs/STUDENT-API.md` |
| A small valid starter to copy | `lab/docs/templates/toolkit/my-toolkit/` |
| A complete example | `toolkits/house/` (the House example) |

Treat `STUDENT-API.md` as exact: never invent an import, a field, an operation or a calculated-value id it does not list. Toolkit code imports **only** `@student-api` and files in its own folder (no npm packages, nothing from `lab/`, no other toolkit).

## 4. Checks: run them, report them honestly

Run in the repository root (first time on a computer: `npm ci`, which installs the fixed versions and never changes `package-lock.json`):

```
npm run check:toolkit -- -t <your-toolkit-name>
npm run typecheck
```

`check:toolkit` ends with one line: `PASSED: toolkit "<your-toolkit-name>" is ready.` or `FAILED: …` (vitest's own summary says `N passed` even when a test failed, so read the last line); `No toolkit "…" was found` or `toolkit.ts is one folder too deep` means the folder is missing or in the wrong place. Fix failures **inside the toolkit folder** and run them again until both pass. Show the student the real output; never say a check passed without running it. Then tell them how to try it: `npm run dev`, open `http://localhost:5173/?toolkit=<your-toolkit-name>`, **Open toolkit design…**, and which analysis (Analyse) or transform (Transform) to run and what it should show.

## 5. How to talk to the student

- Plain English, short steps, no unexplained jargon. Explain *what* you changed and *why* in a few sentences, with the file names.
- Keep the code short and plain, with a one-line comment above each step: the student must be able to read it.
- Ask before big decisions (the toolkit name, removing a Function, renaming anything). Function ids and attribute keys are stored in designs: add new ones rather than renaming.
- If something cannot be done with the Student API, say so plainly instead of working around it.
