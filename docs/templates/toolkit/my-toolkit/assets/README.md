# assets/ — façade files (optional)

Rhino `.3dm` façade modules that your designs use (Building Designer › a Function card › Façade › **Import**). Leave this folder empty if your designs use only window fractions.

- Any file name ending in `.3dm`, at most 20 MB, drawn in Rhino's Front view with a unit. Keep files small: every byte is downloaded by everyone who clones the repository.
- A design refers to a file by its **asset id** (`facade-` + 16 hex digits), not by its name. `npm run check:toolkit` fails if a design uses an asset id that no file here gives, and lists the id each file gives.

Steps: `docs/STUDENT-API.md` › Designs › Façade files. This README is ignored by the app.
