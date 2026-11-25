# Toolkit kit: make a toolkit with an AI assistant

This kit is everything a **chat assistant** (for example Claude in the browser) needs to write a toolkit for *Spatial Graph Lab*: a folder `toolkits/<toolkit-id>/` with your Functions, custom attributes, algorithms and example designs. Download it from the app: **Guide › Toolkits & JSON › Make your own toolkit › Chat assistant**.

Using a coding agent inside the repository instead (for example Claude Code in VS Code)? You don't need this zip: the agent reads the same files in the repository (`lab/docs/TOOLKITS.md`, Route A).

1. Open a new chat and **attach the zip**.
2. Send the prompt from the app (or from `TOOLKITS.md` › Route B) with the blanks filled in: toolkit id, idea, Functions, algorithms, example design.
3. Save the folder it gives you at `toolkits/<toolkit-id>/` in your copy of the repository, on your branch `toolkit/<toolkit-id>`.
4. Run `npm run check:toolkit -- -t <toolkit-id>` and `npm run typecheck`, try it with `npm run dev`, then commit only your folder and push your branch. The exact commands are in `TOOLKITS.md` › Route B.
5. If a check or the app shows an error, paste the whole message back into the chat and ask it to fix exactly that.

What's inside:

| File | What it is |
|---|---|
| `PROMPT.md` | the instructions the assistant follows |
| `TOOLKITS.md` | the student guide: what goes in each folder, things to consider, both routes, git steps |
| `STUDENT-API.md` | the complete Student API reference |
| `starter/my-toolkit/` | a small valid toolkit to start from, with a README in every folder |
| `examples/house/` | the House toolkit, a complete example (without its façade file) |

For maintainers: the app builds this zip from `lab/docs/ai-kit/toolkit/`, `lab/docs/TOOLKITS.md`, `lab/docs/STUDENT-API.md`, `lab/docs/templates/toolkit/my-toolkit/` and `toolkits/house/` when it is downloaded (`lab/app/ui/guide/aiKits.ts`); `lab/app/ui/guide/toolkitKit.test.ts` checks it and activates the starter as a toolkit.
