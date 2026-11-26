# Transform kit: write a transform with an AI assistant

This folder is everything an AI assistant needs to write a **transform** for *Spatial Graph Lab*: a file that proposes changes to your design (add nodes, add edges, move or resize rooms, set values). Download it from the app: the ⓘ beside **Upload your own (.ts)** in **Transform** (or **Guide › Toolkits & JSON › Write your own transform**):

- tab **Any project**: this kit as it is. The transform works in every project.
- tab **This project**: this kit plus `PROJECT.md`, which lists your project's Functions and custom fields (from its toolkit and your own). The transform may use them, and then works only in projects that have them.
- tab **Template**: `transform-template.ts`, to change by hand instead.

1. Open an AI assistant that accepts files (for example Claude) and **attach the zip**.
2. Write your prompt: your idea, the parameters you want to set before it runs, and what it should change. The app shows how, with a starting text to copy, under the download. The assistant reads the kit first and asks you its questions before it writes any code.
3. Save the answer as a `.ts` file (the name the assistant suggests).
4. In the app, open **Transform** and choose **Upload your own (.ts)**. It is listed under **Yours**. Choose it, set its parameters and press **Run**.
5. Read the preview: nothing has changed yet. **Apply** changes the design (one **Undo** reverses all of it); **Discard** drops it.
6. If the app refuses the file, or the preview shows an error, paste the app's message back to the assistant and ask it to fix exactly that.

Your uploads are saved with the project (also in **Export project**).

What's inside:

| File | What it is |
|---|---|
| `PROMPT.md` | the detailed instructions the assistant follows |
| `PROJECT.md` | only in the kit for a project: its Functions, custom fields and calculated values |
| `student-api.d.ts` | the exact functions and operations a transform may use |
| `examples/connect-touching-rooms.ts` | adds an edge between rooms that touch; any project |
| `examples/grow-in-one-direction.ts` | grows rooms by one row of cells; any project |
| `examples/priority-from-missing-area.ts` | sets a project field (`priority` of the House toolkit) |

A transform only **proposes**: the app checks every change, and your design changes only when you press Apply. The kit never contains your design itself.

For maintainers: the app builds this zip from `lab/docs/ai-kit/transform/` when it is downloaded (`lab/app/ui/guide/aiKits.ts`), adding `PROJECT.md` for the This project kit; `lab/app/session/transformKit.test.ts` runs its examples and the template through the real upload pipeline.
