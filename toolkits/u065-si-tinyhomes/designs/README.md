# designs/ — your designs (JSON)

Your tiny-home designs go here, one schema-v2 `.json` file each. For now this folder has only this README (a zip or a commit cannot carry an empty folder).

**Add a design**

1. Draw it in the app with this toolkit: open `http://localhost:5173/?toolkit=u065-si-tinyhomes` and **Create project** (or give an open project the toolkit with **Project › Toolkit › Add a toolkit…**).
2. **Project › Export project** gives a `.project.json` file. Ask your AI: "Take the design of the scenario *name* from this project file and give me it as `designs/<name>.json` for my toolkit, with a `metadata.name` and `metadata.description`."
3. Save it here as `designs/<name>.json` and run `npm run check:toolkit -- -t u065-si-tinyhomes` again: it now runs every algorithm on your first design.

Its file name (without `.json`) is its design id; `metadata.name` and `metadata.description` are what **Open toolkit design…** shows under *Toolkit: Tiny homes*. Every node's `"function"` should be one of `bedroom`, `couch`, `dining-table`, `washroom`, `kitchen`. Optional: name one design as `defaultDesign` in `toolkit.ts`.

Format: `lab/docs/STUDENT-API.md` › Designs. This README is ignored by the app.
