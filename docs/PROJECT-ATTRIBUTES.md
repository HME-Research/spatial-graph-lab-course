# Project-wide custom attributes — contract

Status: implemented. Contract and persistence (phase 01); one resolver used by the app and the Student API (phase 02); the **Attributes** manager (Nodes / Edges lists: add, edit, rename, change kind, delete with impact preview, type defaults, own Undo/Redo, export/import, merge/reset) and the schema-driven *Custom attributes* section of Properties for rooms and relationships (phase 03).

**Student-facing presentation (UI refinement, 17 November 2026).** Students see one **Attributes** list per Node | Edge: required attributes first (Node: Function, Level; Edge: Relationship), then custom attributes in project order, then the calculated attributes the project shows, in catalogue order (`app/attributes/attributeList.ts`). The internal distinctions below are unchanged. One "+ Add attribute" opens a dialog: *Custom attribute* (name, type, options, default, description; the `key` is generated from the name by `generateAttributeKey`, valid, unique ignoring case, never reserved, never a former key, and never a key whose leftover stored values would not fit; shown only under Advanced) or *Calculated attribute* (catalogue metrics not yet shown). Renaming changes `label` only, so the key and every stored value stay. One dialog Save is one schema-history step (`editAttributesBatch`), validated against the values of **every scenario** of the open project. Removing a calculated attribute only hides it (`settings.calculatedFields`). The UI says "attribute" and "type" where this document says "field" and "kind".

## Ownership
- The **project** owns the attribute schema: one list of custom **node fields** and a separate list of custom **edge fields**. Every node of every design in the project has the same node fields; every edge has the same edge fields. Access and Open edges have the same fields.
- A **design** owns instance values only. They are stored sparsely in each node's / edge's `custom` map (schema v2), keyed by the field's key. Designs never contain schema definitions, so the v2 design format is unchanged and every design — open, inactive, or exported earlier — shows the current field list when it is opened.
- **Functions** may give a node field a Function-specific default. These defaults never add or remove fields. Edges have schema defaults only, because there is no stable edge type model.
- The Designer's per-design type appearance (window fraction, roof) is unrelated and unchanged.

## Field definition
`app/extensions/projectAttributes.ts`:

| Property | Meaning |
|---|---|
| `id` | Permanent identity, unique in its collection. It does not change on rename. |
| `key` | The JSON attribute name in designs. 1–40 letters, digits or `_`, starting with a letter. It is unique in its collection, ignoring case, and must not equal any other field's former key. |
| `label`, `description` | Display text. |
| `kind` | `text`, `number` (optional `min`/`max`), `boolean` or `enum` (`values`). |
| `default` | Schema default (never `null`). |
| `formerKeys` | Keys the field had before renames, newest first. |

`functionDefaults[function][fieldId]` holds per-Function defaults for node fields.

**Reserved keys** (case-insensitive) are system properties and JavaScript internals: `id`, `displayId`, `function`, `type`, `position`, `size`, `diagram`, `custom`, `source`, `target`, `relationship`, `corridor`, `__proto__`, `constructor`, `prototype`, `toString`, `valueOf`, `hasOwnProperty`. System properties are always shown in Properties; they are never schema fields, so they cannot be deleted or redefined.

## Effective value
`app/extensions/resolveAttributes.ts` is the only resolver. Properties, Graph 2D, conformance, the Student API and transformations all use it. For one field of one instance:
1. A valid stored value. An explicit `null` is an explicit "no value" override, and the effective value is `null`.
2. Otherwise, for nodes, the default of the node's Function.
3. Otherwise the schema default.
4. Otherwise no value (`undefined`).

An invalid stored value is kept and flagged; resolution then continues with steps 2–4. Values are read under the current key first, then under former keys. Writing through a field (`writeFieldValue`) writes the current key and removes the former key the value was read from. A former key that holds a *different*, hidden value is kept and reported (info), never dropped. Other attributes keep their values and order.

## Baseline from the toolkit files (immutable)
`ActiveToolkit.attributeBaseline` (`app/extensions/attributeBaseline.ts`) is built at activation from two sources:
- `defineToolkit({ custom: { nodes, edges } })`: optional, with `label` and `description` per field.
- For nodes, the union of the `custom` attributes declared by the valid functions (`defineFunction`, `functions/`). A function's `default` becomes that function's default.

If two declarations conflict (same key, different kind or limits), the app reports a warning and the first one in file order wins. An unusable key (reserved or malformed) is reported and is not a field; values stored under it are kept as "not in the schema".

## Persistence: what "saved" means
- The schema **in use** is stored in the browser per project, under `localStorage` key `sgl:project-attributes:<projectId>`, as a versioned record (`format: "spatial-graph-lab/project-attributes"`, `formatVersion: 1`, `projectId`, `schema`, `baseline`). `projectId` is the owner scope: the active toolkit's id, or the saved project's own id when it has no toolkit; the key, format and field name were deliberately kept by the toolkit rename (`docs/DECISIONS.md`, "Toolkit terminology"). Every schema change is written immediately. There is no separate Save step.
- With no stored record, the baseline is used and nothing is stored. Undoing back to the files' version removes the record, unless a different version was exported since (the export state is kept).
- **Export** downloads the record as a file. **Import** reads it only after checking the JSON, format, version, project id and schema. A file from another project is refused unless explicitly allowed. "Modified" means changed since the last export or import.
- The TypeScript source is **never** edited. If the files' baseline changes after a record was stored, the app reports it. "Add fields from toolkit files" merges additively; it adds only missing fields and type defaults. "Reset to toolkit files" replaces the schema; it is undoable.
- If the stored record is unreadable (corrupt, or written by a different app version), it is copied to `…:unreadable` (earlier copies are never overwritten: `…:unreadable-2`, …), an error is shown, and the files' version is used. **Saving is then blocked** so the record is never overwritten, until the user imports an attribute file, resets to the toolkit files, or explicitly discards the unreadable copy. If storage is unavailable (for example in private mode), the schema works in memory with a warning.
- Exported **designs** do not contain the schema. Opening an old design in a project shows the project's fields. Values that no field answers to are kept as "not in the project schema". A design opened in another project resolves against that project's schema.

## Origin: toolkit or yours (Programme P4)
Attributes and Properties show five sections (`app/attributes/sections.ts`); each Custom row carries a tag, `Toolkit: <name>` or `Yours`. The origin is **derived, never stored**: a field is the toolkit's when one of its keys (current or former, ignoring case) is a key of a field of the same collection in the active toolkit's baseline (`isBaselineField`, the same rule `mergeBaseline` uses to decide a baseline field is already present); otherwise it is yours (`customAttributeSource`). No record, project file or export format changed. Because keys are kept by label renames and key renames keep the old key in `formerKeys`, the origin survives renames, reloads, project save/open and attribute export/import. A project without a toolkit has an empty baseline, so all its attributes are yours. Consequences: if a toolkit later declares a key the student added first, that attribute becomes the toolkit's (as "Add toolkit attributes" would treat it); an imported record from another toolkit is judged against the active toolkit.
- **Toolkit attributes cannot be deleted** (the row shows a disabled delete with the reason; the edit dialog's Delete is disabled; a delete edit is refused before it reaches the schema). They can still be renamed and their defaults changed. Yours can be deleted, with the usual confirmation. "Reset to toolkit attributes" and importing an attribute file still replace the whole list (both undoable).

## Edits, impact and undo
`app/extensions/attributeEdits.ts` (`applySchemaEdit`) supports these edits: add, update (label, help, default, choices, limits), rename, change kind, delete, move, and set or remove a type default. Every edit is validated and produces a valid schema or a plain-language refusal.
- **Rename** keeps the identity and every stored value, through `formerKeys`. No design is rewritten.
- **Delete** removes the definition and its type defaults. Stored values stay in the designs, shown as "not in the project schema", and can be adopted again by adding a field with that key.
- **Change kind or narrow limits/choices** is refused while a known stored value or a default would become invalid. Values are never converted automatically. "Known" means the open design plus the toolkit's design files (`designSamples`). Values in other exported files are checked when those files are opened: invalid values are kept and flagged, never dropped.
- **Student code:** `algorithmReferences` searches the loaded algorithm source for the key, quoted or as a property, and reports "may reference" warnings. It is a heuristic: computed keys are missed and unrelated words can match. Algorithms are never edited.
- **Undo:** schema edits have their own undo/redo history (each step also remembers which version of the toolkit files it was based on, so undoing a merge restores the "files changed" warning) (`app/session/projectAttributeStore.ts`). It is independent of the open design's history. Schema edits never change design data, and design edits never change the schema, so the two histories never conflict.

## Not in scope
Integer kind, per-edge-kind defaults, multi-user synchronisation, and writing schema changes back into toolkit TypeScript.
