# Teaching feedback: vocabulary, legends, analysis display and help (Stage 07)

This stage adds read-only presentation helpers, beginner help and a browser smoke harness. It does **not** change the graph, spatial or document models, `ViewProps`, `App.tsx`, `Workspace.tsx`, graph2d or the 3D edge styles. The integration owner wires these pieces in at Gate 1, using the points listed below.

| Path | Layer | Contents |
|---|---|---|
| `app/views/presentation/` | views | Pure vocabulary, line tokens, legends, analysis view model and concise feedback. Also `LegendViews.tsx`, which holds stateless legend components. |
| `app/ui/help/` | shell | Help topics (pure data), a tooltip state reducer, and the `HelpTip` / `HelpLabel` components |
| `scripts/smoke/` | — | Browser smoke harness with no dependencies (see `scripts/smoke/README.md`) |

## 1. One vocabulary

A relationship has a **kind**, which is what the designer intends: **Access** or **Open**. It also has a derived spatial **status**: **Direct**, **Connected via route** or **Unresolved**. The status is never saved and is never a validation error.

| Concept | Label | Line (2D / 3D) |
|---|---|---|
| Direct, same storey | Direct | solid, `#2f5878` |
| Direct, between storeys | Direct | solid, `#d0621b` |
| Routed | Connected via route | solid, ring at the midpoint |
| Unresolved | Unresolved | **thin muted red dashed**, `#a2453f`, 1.5 px, dashes `6 4` |
| Access | Access | thin, 2 px / 0.07 m |
| Open | Open | thick, 4.5 px / 0.12 m |
| Selected | Selected | pink `SELECTION_COLOR`, which always wins |
| Rejected document / import / command | Error tone (`ERROR_TONE`) | not a line colour, never the unresolved red |
| Out-of-date analysis | Warning tone (`WARNING_TONE`) | — |

The tokens are in `vocabulary.ts`: `relationshipLine(kind, status, contact)`, `UNRESOLVED_LINE`, `STATUS_PRESENTATION`, `KIND_PRESENTATION`, `CONNECTOR_PRESENTATION` and `UNRESOLVED_REASON_TEXT`. Tests check that the unresolved colour has at least 4.5:1 contrast on white and on the app background, and that it differs from the selection pink and the error tone.

### Proposal to the Graph UI owner (01) and root: dashes mean Unresolved only

The v1 views currently give dashes two meanings that contradict each other:
- Graph 2D: "dashed = between storeys" (`atrium`, `vertical-access`).
- 3D `edgeStyle.ts`: dashed = `open` / `atrium`.

When v2 is wired, **dashes are reserved for Unresolved**. Kind moves to line width, and storey contact stays a colour family, as in the table above. Adopting this means changing `app/views/graph2d/diagram.ts` (`EDGE_STYLES`) and `app/views/three/edgeStyle.ts` to read `relationshipLine(...)`. Those files belong to 01 and integration, so Stage 07 has not edited them. In v1 mode (no `design` port) the existing styles can stay as they are.

## 2. Relationship presentation (`relationships.ts`)

```ts
presentRelationship(resolution: EdgeResolution): RelationshipPresentation
presentEdgeById(spatial: SpatialResolution, edgeId: string): RelationshipPresentation | null   // unknown id → null
summarizeRelationships(spatial): { total, counts, unresolvedIds, sentence }                  // "5 relationships: 3 direct, 1 via route, 1 unresolved."
connectorStylesInUse(spatial): ConnectorStyle[]
```

`RelationshipPresentation` contains `statusLabel`, `kindLabel`, `line`, `built` (for example "door in the shared wall" or "Covered walkway (4 cells)"), the short `reason`, the engine `detail`, and a one-line `tooltip`. Graph UI edge popovers and the Properties panel should show `tooltip` and put `detail` behind "More details".

## 3. Legends (`legend.ts`, `LegendViews.tsx`)

```ts
relationshipLegend(view: ViewMode, { statusCounts?, connectorStyles?, compact? }): ViewLegend
isCompactPanel(panelWidth)          // < 560 px → compact (laptops in split view)
<RelationshipLegend legend={…} helpDetails={HELP_DETAILS} defaultOpen? />
```

Every view shows the **same** status entries, with the same ids, labels, glyphs and swatches (tested). The views differ as follows:
- Graph views explain line styles, using the status and kind sections.
- Voxels and Architecture explain what is built, using the status and connector-style sections. In full mode they also show the kind section.

The selection entry is hidden in compact mode. Each item shows its one-sentence summary on hover and on keyboard focus, using `tabIndex=0` and `title`. Each section has one "More details" disclosure.

Views must not import the shell layer (`app/boundary.test.ts`). For that reason `RelationshipLegend` receives help text as a prop. The host passes `HELP_DETAILS` from `@app/ui/help`.

## 4. Analysis results (`analysis.ts`)

```ts
presentAnalysis(input: AnalysisInput): AnalysisPresentation
analysisNodeStyle(nodeId, presentation | null, selection): { fill, fillOpacity, ring, valueLabel, staleBadge }
<AnalysisLegend presentation={…} onClear={…} />
```

Building the input from the existing algorithm session (shell code; `run` is an `AlgorithmRun`):

```ts
const outcome = run.outcome.ok && run.outcome.value.kind === 'analysis' ? run.outcome.value.result : null;
const presentation = outcome && shown ? presentAnalysis({
  title: run.label,
  ...(outcome.summary !== undefined && { summary: outcome.summary }),
  nodeValues: outcome.nodeValues,
  ranOnNodeIds: run.doc.nodes.map((n) => n.id),
  currentNodeIds: currentDoc.nodes.map((n) => n.id),
  stale: isStale(run, version),
}) : null;
```

- **Separate from the document.** Nothing is written to attributes. `presentAnalysis` never mutates its input (tested with frozen input).
- **Separate from the selection.** The analysis only changes the fill. `ring` is always the selection pink when the node is selected and is `null` otherwise.
- **Deterministic colours.** Numbers use the sequential scale already used by colour-by (`numericColor`). Booleans are yes/no. Anything else is categorical, and `1` and `"1"` stay distinct.
- **Missing values.** `null`, unreachable nodes, non-finite numbers and nodes added after the run all show as grey "no value". Unknown ids in `nodeValues` are ignored and listed in `unknownIds`. Deleted nodes are listed in `deletedIds`.
- **Show and clear.** The host holds `presentation | null`. Clear sets it to `null`.
- **Stale results.** When `stale` is true, `staleMessage` is set, opacity drops from 0.9 to 0.45 and `staleBadge` is set.
- **Laptop widths.** Show `AnalysisLegend` in the sidebar or Algorithms tab. Do not stack it over the 3D canvas when `isCompactPanel(width)`. Values appear on hover through `valueLabel`.

## 5. Concise feedback (`feedback.ts`)

`conciseIssues(issues, { action, max = 3, kept = true })` returns a headline such as "Could not load x.json: 5 problems. Your current design was kept unchanged.". It merges repeated hints into one line and adds "…and N more." `ISSUE_HINTS` gives a beginner sentence for every `IssueCode`, including the v2 codes. The exact validator message and path stay available for "More details". `TONE_STYLE` keeps `error`, `warning`, `spatial` and `info` visually distinct.

## 6. Help (`app/ui/help`)

`<HelpTip topicId="access-open" />` and `<HelpLabel topicId="room-size">Size</HelpLabel>` behave as follows:
- Hover or keyboard focus shows a one-sentence tooltip (`role="tooltip"`, linked with `aria-describedby`).
- Click, Enter or Space pins a panel with a "More details" disclosure.
- Escape closes, and so does clicking outside.
- Unknown topic ids render nothing.

The topics are `graph-vs-grid`, `access-open`, `relationship-status`, `unresolved`, `connector-style`, `room-size`, `gizmo-snap`, `designer-windows`, `analysis-results`, `stale-results` and `display-id`.

Suggested placements, to be wired by their owners:

| Topic | Where | Owner |
|---|---|---|
| `graph-vs-grid` | Properties, grid position field; Graph 2D hint | 05 / 01 |
| `access-open`, `relationship-status`, `unresolved` | edge popover, edge Properties, legends | 01 / 05 |
| `room-size`, `display-id` | Properties, size and label fields | 05 |
| `gizmo-snap` | 3D move/resize toolbar | 04 |
| `designer-windows` | Designer type settings | 06 |
| `analysis-results`, `stale-results` | Algorithms panel result header | integration (`app/session`) |

## 7. Integration checklist (Gate 1)

1. Graph 2D and 3D edge renderers: when `props.design` is present, use `presentEdgeById(design.spatial, edge.id).line`. Use `.tooltip` in aria-labels and popovers.
2. Mount `RelationshipLegend` in each view, passing `relationshipLegend(mode, { statusCounts: summarizeRelationships(design.spatial).counts, connectorStyles: connectorStylesInUse(design.spatial), compact: isCompactPanel(width) })`. In v1 mode, keep the existing legends.
3. Add `analysis: AnalysisPresentation | null` to App state, built as in §4. Pass it to the views through a new optional prop or context. That is a root decision, because `ViewProps` is frozen. Renderers use `analysisNodeStyle`.
4. Replace the long load-failure list in `App.tsx` with `conciseIssues(failure.issues, { action: \`load ${failure.source}\` })`, and keep the full list behind "More details".
5. Place `HelpTip`s as in §6. Then run the smoke harness with `--feature help --feature legend --feature analysis-overlay --feature v2`.
