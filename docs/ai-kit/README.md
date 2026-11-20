# Write your own graph analysis with an AI assistant

This folder is everything an AI assistant needs to write an analysis for *Spatial Graph Lab*. Download it as one zip from the app (or take `public/downloads/spatial-graph-lab-ai-kit.zip` from the repository).

1. Open an AI assistant that accepts files (for example Claude) and **attach the zip**.
2. Write your prompt: your idea, what you will pick, and how the answer should show. The app shows how, with a starting text to copy: the ⓘ beside **Upload your own (.ts)** in Analyse, or **Guide › Toolkits & JSON › Write your own analysis**.
3. Save the answer as a `.ts` file (the name the assistant suggests).
4. In the app, open **Analyse** and choose **Upload your own (.ts)**, the button at the very top of the tab. It appears in Node, Edge, Network or Queries, depending on what it asks you to pick, tagged **Yours**.
5. If the app refuses the file, paste the app's message back to the assistant and ask it to fix exactly that.

What's inside:

| File | What it is |
|---|---|
| `PROMPT.md` | the detailed instructions the assistant follows |
| `student-api.d.ts` | the exact functions an uploaded analysis may use |
| `examples/shortest-route.ts` | a Query with two rooms (From, To) |
| `examples/exactly-k-steps.ts` | a Query with a room and a number |

An analysis only **reads** the graph: room ids and the relationships between them. It cannot see room functions, sizes or positions, and it never changes your design.

For maintainers: edit the files here, then run `npm run build:ai-kit` to rebuild the zip. A test (`app/analysis/aiKit.test.ts`) fails if the zip is out of date.
