# designs/ — your designs (JSON)

Your designs go here, one schema-v2 `.json` file each. There are none yet: you draw them in the app.

**Add a design**

1. Open the app with `http://localhost:5173/?toolkit=u367-wy-family-houses` and **Create project**, then draw your house with this toolkit's Functions.
2. **Project › Export project** gives a `.project.json` file. Ask your AI: "Take the design of the scenario *name* from this project file and give me it as `designs/<name>.json` for my toolkit, with a `metadata.name` and `metadata.description`."
3. Save it here as `designs/<name>.json` and run `npm run check:toolkit -- -t u367-wy-family-houses` again: it now runs every algorithm on your first design.

Its `metadata.name` and `metadata.description` are what **Open toolkit design…** shows under *Toolkit: Family house*. Optional: name one design as `defaultDesign` in `toolkit.ts`.

Format: `lab/docs/STUDENT-API.md` › Designs. This README is ignored by the app.
