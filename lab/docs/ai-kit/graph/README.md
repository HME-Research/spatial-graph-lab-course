# Graph kit: write a graph analysis with an AI assistant

This folder is everything an AI assistant needs to write a **graph analysis** for *Spatial Graph Lab*: one that reads only the nodes' ids and the edges between them, so it works in any project. Download it from the app: the ⓘ beside **Upload your own (.ts)** in **Analyse**, tab **Any project**, with **Include node basics** off (or **Guide › Toolkits & JSON › Write your own analysis**).

1. Open an AI assistant that accepts files (for example Claude) and **attach the zip**.
2. Write your prompt: your idea, the input (what you select before it runs) and how the answer should show. The app shows how, with a starting text to copy, under the download.
3. Save the answer as a `.ts` file (the name the assistant suggests).
4. In the app, open **Analyse** and choose **Upload your own (.ts)**, the button at the very top of the tab. It appears in Node, Edge, Network or Queries, depending on its input, tagged **Yours**.
5. If the app refuses the file, paste the app's message back to the assistant and ask it to fix exactly that.

What's inside:

| File | What it is |
|---|---|
| `PROMPT.md` | the detailed instructions the assistant follows |
| `student-api.d.ts` | the exact functions a graph analysis may use |
| `examples/shortest-route.ts` | a Query with two rooms (From, To) |
| `examples/exactly-k-steps.ts` | a Query with a room and a number |

A graph analysis only **reads** the graph: room ids and the relationships between them. It cannot see room functions, sizes or positions (the design kit can), and it never changes your design.

For maintainers: the app builds this zip from `lab/docs/ai-kit/graph/` when it is downloaded (`lab/app/ui/guide/aiKits.ts`); `lab/app/analysis/aiKit.test.ts` runs its examples through the real upload pipeline.
