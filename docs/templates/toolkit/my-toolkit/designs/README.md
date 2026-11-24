# designs/ — example designs (JSON)

Each `.json` file here is a schema-v2 design. Its file name (without `.json`) is its design id; `metadata.name` and `metadata.description` are what **Open example…** shows under *Toolkit: <your toolkit name>*.

- **Easiest way to make one:** open the app with your toolkit, draw the design, then **Export JSON** and save the file here as `designs/<name>.json`.
- `toolkit.ts` may name one design as `defaultDesign`: new projects take its Building settings, and `npm run check:toolkit` runs every algorithm on it. Keep it small and valid.
- Every node's `"function"` should be one of your Functions' ids; custom values go under `"custom"`.
- A design names an imported façade by its asset id; the `.3dm` file must then be in `assets/`.

Format: `docs/STUDENT-API.md` › Designs and `docs/CONTRACTS-V2.md` §1. This README is ignored by the app.
