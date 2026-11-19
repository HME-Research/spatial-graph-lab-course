# Prompt: write a graph analysis for Spatial Graph Lab

Copy everything between the lines into an AI assistant, then replace the last line with your own idea.

---

Write ONE TypeScript file: a graph analysis for the app *Spatial Graph Lab*. Follow these rules exactly.

**What the file looks like**

```ts
import { defineGraphAlgorithm, neighbours } from '@student-api';

export default defineGraphAlgorithm({
  id: 'my-analysis',              // lowercase letters, digits and "-", starting with a letter
  label: 'My analysis',           // short button text
  description: 'One plain sentence on what the answer tells you.', // optional
  inputs: [{ kind: 'node', label: 'Node' }],
  run({ graph, inputs }) {
    const node = inputs[0]!;
    const around = neighbours(graph, node);
    return { kind: 'analysis', value: around.length, highlightNodes: around };
  },
});
```

**Inputs** (required, in order; they decide where the analysis appears):
- `[]` → *Network*: the whole graph, no picking.
- exactly one `{ kind: 'node', label }` → *Node*: runs on the selected node.
- exactly one `{ kind: 'edge', label }` → *Edge*: runs on the selected edge.
- anything else → *Queries*: the student picks each node/edge in turn and types numbers.
- A number input: `{ kind: 'number', label, min?, max?, default? }`. At most 8 inputs.
- `inputs` in `run` holds the picked values in the same order: node ids, edge ids or numbers.

**What `run` sees** — only ids and endpoints:
- `graph.nodes`: `{ id }[]`; `graph.edges`: `{ id, source, target }[]` (ids are whole numbers; edges have no direction).
- No functions, names, positions, sizes or custom attributes. Do not invent them.
- Helpers you may import from `'@student-api'`: `neighbours(graph, id)`, `incidentEdges(graph, id)`, `edgesBetween(graph, a, b)`, `getNode(graph, id)`, `getEdge(graph, id)`, `opposite(edge, id)`.

**What `run` returns**: `{ kind: 'analysis', … }` with at least one of:
- `value`: a number (shown big), `text`: one short line (at most 300 characters),
- `highlightNodes` / `highlightEdges`: ids to highlight, `nodeValues`: `{ [nodeId]: number | text | true/false }` (shown as colours).
- Every id must exist in the graph.

**Rules**
- Import ONLY from `'@student-api'`. No other imports, no other files, no `fetch`, no randomness, no timers.
- Use `defineGraphAlgorithm` (never `defineSpatialAlgorithm`): an analysis only reads the graph and never changes it.
- It must finish quickly (the app stops it after 3 seconds). Loops must always end.
- Keep it simple and short; the file must be under 100 KB.
- I am a beginner: add a short comment above each step, in plain English.

**My idea:** (describe what your analysis should find, e.g. "the nodes that have exactly one neighbour")

---

Save the answer as a `.ts` file and upload it in **Analyse › + › Upload your own (.ts)…**, or put it in `toolkits/<your-toolkit>/algorithms/`. If the app refuses it, paste the app's message back to the assistant.
