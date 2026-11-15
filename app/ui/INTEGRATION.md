# Stage 05 (app UI): integration handoff

Owner of `app/ui/**` and `app/inspector/**`: branch `work/05-app-ui`. This branch does **not** edit
`App.tsx`, `Workspace.tsx`, `app.css`, `views/contracts.ts` or history. This file says what the
integration owner wires.

## What works without any wiring

`Workspace.tsx` still imports `Inspector` from `./inspector/Inspector`. That component is now the
**Properties** panel, under the same name and props:

- a real node-type `<select>`;
- position x/y/z committed on Enter or on leaving the group; Esc restores; no Apply button;
- plain-language errors with "Technical details";
- "Remove connection" and "Delete room" with an undo hint.

The v2 controls appear automatically once `ViewProps.design` (the `DesignPort`) is passed. They are
size, Access/Open, corridor style, spatial status, and the corridor-clash confirmation.

## 1. Workspace: vertical navigation + "Building" label (patch)

`integration/workspace-wiring.patch` was generated against `e9692b5`, and `git apply --check`
passes. It was checked in a real browser at 1280×720 and 1366×768: no page scroll, keyboard
section navigation, and collapse/expand all worked.

```powershell
git apply app/ui/integration/workspace-wiring.patch
```

It changes:

- **`Workspace.tsx`**
  - Replaces the horizontal tabs with `SidebarNav` (Properties / Algorithms / Designer).
  - Uses `ViewModeSelect` in panel headers, which shows `architecture` as "Building".
  - Adds the optional prop `designer?: ReactNode`. Without it, `DesignerPlaceholder` is shown with a
    "soon" badge.
- **`app.css`**
  - `--sidebar-width` changes from 320px to 380px; collapsed width from 36px to 54px.
  - The stacked small-screen rule also caps `.sgl-sidenav-panel`.
  - The old `.sidebar*` rules become unused. They are left in place; delete them at will.

Recommended one-line follow-up in the frozen `views/contracts.ts`:
`architecture: 'Building'` in `VIEW_MODE_LABELS`. `VIEW_LABELS` already overrides it, so the two
can never disagree. `ArchitectureView`'s `ariaLabel="Architecture view"` would also become
"Building view".

## 2. App: v2 port and Designer

- Pass `design={port}` to `Workspace` (the same port as the views). Properties then sends **every**
  command through `design.onCommand` and previews moves/resizes with `design.proposeEdit`:
  - `ok`: one `set-node-geometry` (one history step).
  - `rejected`: nothing is sent; "This room overlaps room 03".
  - `needs-confirmation`: inline "Cancel" / "Move anyway and recalculate". Cancel sends nothing.
    Confirm sends one `set-node-geometry` with `confirmRouteDisplacement: true`.
- When 06 is merged, pass `designer={<DesignerPanel … />}` to `Workspace`.

## 3. Optional: friendlier load errors

`LoadFailureNotice` can replace the `failure` section in `App.tsx`:

```tsx
{failure && (
  <LoadFailureNotice source={failure.source} issues={failure.issues} kept={current !== null}
    onDismiss={() => setState((s) => ({ ...s, failure: null }))} />
)}
```

Project activation problems stay in `ProjectBar` (persistent). Properties feedback is transient,
per selection.

## Component contracts

| Export | Props / behaviour |
|---|---|
| `SidebarNav` | `{ tabs: SidebarNavTab[]; active; onActive(id); collapsed; onCollapsedChange(b); label? }`. All panels stay mounted (hidden), so drafts and algorithm results survive. `role=tablist`, `aria-orientation=vertical`, roving tabindex, ArrowUp/Down/Home/End. When collapsed: icons only, with an accessible name and a tooltip each. |
| `SidebarNavTab` | `{ id; label; description (tooltip); icon; content; badge? }` |
| `ViewModeSelect` | `{ mode; onMode(mode); panel (1-based) }` |
| `Feedback` / `IssueFeedback` | Message first; codes and paths under `<details>Technical details`. Errors use `role=alert`; warnings and notes use `role=status`. |
| `RouteConfirm` | `{ relationships: string[]; action?: 'move'\|'resize'; onCancel; onConfirm }` |
| `LoadFailureNotice` | `{ source; issues; kept; onDismiss }` |
| `PropertiesPanel` (= `Inspector`) | `InspectorProps` (= `ViewProps`). v2 features are gated on `design !== undefined`. |
| `friendlyMessages(issues, ctx)` | `ctx = { roomLabel?, relationshipLabel?, subjectNodeId?, nodeIdAt? }` |
| `describeResolution(r)` | `{ title, detail, tone: 'ok'\|'warning' }`. Unresolved is always a warning. |

## Not done here (owners elsewhere)

- History labels say "Delete edge …" / "Move store to …" (`app/session/history*`, integration).
  Suggest "Remove connection …" / "Move room …".
- The Graph 2D connection hint says "Change its kind in the inspector" (`views/graph2d/diagram.ts`,
  01). Suggest "in Properties".
