# designs/ — your designs (JSON)

Your designs go here, one schema-v2 `.json` file each. They are yours to draw: for now this folder holds only this README (a zip or a commit cannot carry an empty folder).

**Add a design**

1. Draw it in the app with this toolkit: open `http://localhost:5173/?toolkit=u150-my-studentaccom` and **Create project**, then place Bedrooms, Ensuites, a Living room, a Dining kitchen and a Laundry, and join each Bedroom to its Ensuite.
2. **Project › Export project** gives a `.project.json` file. Ask your AI: "Take the design of the scenario *name* from this project file and give me it as `designs/<name>.json` for my toolkit, with a `metadata.name` and `metadata.description`."
3. Save it here as `designs/<name>.json`. Run `npm run check:toolkit -- -t u150-my-studentaccom` again: it now runs the Ensuite check on your first design.

Its file name (without `.json`) is its design id; `metadata.name` and `metadata.description` are what **Open toolkit design…** shows under *Toolkit: Student accommodation*.

- Optional: name one design as `defaultDesign` in `toolkit.ts`; new projects then start from it and the checks run every algorithm on it. Keep it small and valid.
- Every node's `"function"` should be one of this toolkit's Function ids (`bedroom`, `ensuite`, `living-room`, `dining-kitchen`, `laundry`); custom values go under `"custom"`.

Format: `lab/docs/STUDENT-API.md` › Designs and `lab/docs/CONTRACTS-V2.md` §1. This README is ignored by the app.
