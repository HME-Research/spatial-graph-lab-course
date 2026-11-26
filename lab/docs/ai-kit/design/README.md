# Design kit: write a design analysis with an AI assistant

This folder is everything an AI assistant needs to write a **design analysis** for *Spatial Graph Lab*: one that reads the rooms themselves (Function, position, size, relationship kind, calculated values such as area), not only the graph. Download it from the app: the ⓘ beside **Upload your own (.ts)** in **Analyse** (or **Guide › Toolkits & JSON › Write your own analysis**):

- tab **Any project**, with **Include node basics** on: this kit as it is. The analysis works in every project.
- tab **This project**: this kit plus `PROJECT.md`, which lists your project's Functions and custom fields (from its toolkit and your own). The analysis may use them, and then works only in projects that have them.

1. Open an AI assistant that accepts files (for example Claude) and **attach the zip**.
2. Write your prompt: your idea, the input (what you select before it runs) and how the answer should show. The app shows how, with a starting text to copy, under the download. The assistant reads the kit first and asks you its questions before it writes any code.
3. Save the answer as a `.ts` file (the name the assistant suggests).
4. In the app, open **Analyse** and choose **Upload your own (.ts)**. It appears in Node, Edge, Network or Queries, depending on its input, tagged **Yours** and **Any project** or **This project**.
5. If the app refuses the file, paste the app's message back to the assistant and ask it to fix exactly that.

What's inside:

| File | What it is |
|---|---|
| `PROMPT.md` | the detailed instructions the assistant follows |
| `PROJECT.md` | only in the kit for a project: its Functions, custom fields and calculated values |
| `student-api.d.ts` | the exact functions a design analysis may use |
| `examples/largest-room-per-level.ts` | no input, any project |
| `examples/same-function-neighbours.ts` | one room as input, any project |
| `examples/below-target-area.ts` | uses a project field (`targetArea` of the House toolkit) |

An analysis only **reads**: it never changes your design. The kit never contains your design itself.

For maintainers: the app builds this zip from `lab/docs/ai-kit/design/` when it is downloaded (`lab/app/ui/guide/aiKits.ts`), adding `PROJECT.md` for the This project kit; `lab/app/analysis/aiKit.test.ts` runs its examples through the real upload pipeline.
