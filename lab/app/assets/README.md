# app/assets — imported 3DM façade modules

Pure layer (no React, Three.js or DOM) between `building`/`metrics` and `extensions`/`project`
(`app/boundary.test.ts`). Decisions D1–D9: `docs/DECISIONS.md`; contracts: CONTRACTS-V2 §1,
CONTRACTS-V3 §2.

| File | What it does |
|---|---|
| `facadeAdapter.ts` | Source meshes (source units, Z-up) → panel frame in metres via `zUpToYUp`; Repeat (bay) and Stretch (wall run) targets and fitted matrices. Promoted from the wave2-G spike. |
| `facadeAsset.ts` | `FacadeAssetV1`: the normalised mesh as stored in the project file; encode, full validation, decode (cached by hash), limits. |
| `binary.ts` | Synchronous SHA-256 and base64 (the project-file reader is synchronous). |
| `placement.ts` | Which exterior walls get a module and their matrices, from building faces and the design's façade settings. |
| `importFacade.ts` | Pipeline: reader → adapter → asset. Takes the rhino3dm module as a parameter (Node tests run what the browser runs). |
| `rhino/reader.ts`, `rhino/loader.ts` | 3DM reader and lazy rhino3dm loader. |
| `rhino/tessellate.ts` | Meshes geometry without a saved render mesh: Brep faces (trimmed, planar and curved), surfaces, SubD (Catmull–Clark from the control net). Uses `earcut` (exact pin). |
| `rhino/browser.ts` | Browser entry (WASM URL). Load ONLY with `import()`; `lazyLoading.test.ts` enforces it. |
| `__fixtures__/` | Test `.3dm` files: synthetic (`generate-fixtures.cjs`) plus one genuine Rhinoceros 8 file. |

## Code adapted from SpatialCore (maintenance)
`rhino/reader.ts` and `rhino/loader.ts` adapt the owner's SpatialCore package
`@spatialcore/rhino3dm-import@0.3.0` (`packages/rhino3dm-import/src/import3dm.ts`, `loader.ts`),
reused with the owner's approval; SpatialCore is not a dependency. Each file's header lists what
was taken over and what was added. When SpatialCore's importer changes (e.g. a rhino3dm upgrade or
a binding fix), compare those functions: `free`, the header check, `mapUnitSystem`, `is`,
`meshTriangles` (SpatialCore `meshToTriangles`), the Brep/Extrusion render-mesh path and the
colour rule. `GeometryTest-v1.3dm` in `__fixtures__` is copied from SpatialCore's `example/`.

## Upgrading rhino3dm
Pin the exact version in `package.json`, update `RHINO3DM_VERSION` in `rhino/loader.ts` (a test
checks they match the installed package), run `npx vitest --run app/assets app/session/facadeAssets.test.ts`,
`npm run build`, and import a `.3dm` in the production preview (the WASM must load only then).
