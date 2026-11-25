// Regenerates the synthetic 3DM façade fixtures in this folder with the installed rhino3dm:
//   node app/assets/__fixtures__/generate-fixtures.cjs
// The committed files were written with rhino3dm 8.17.0 (2026-11-17) and are read by the pinned
// version, so the tests also cover files from an older library. Regenerating rewrites them.
// Source convention used by every sample: X along the façade, Z up, Y = depth; the exterior faces
// −Y (Rhino Front view). F1–F6 reproduce the wave2-G spike samples byte for byte in content
// (spike harness gen.cjs); F7–F8 were added for the implementation (2026-11-17).
// `GeometryTest-v1.3dm` is NOT generated: it is a genuine Rhinoceros 8 file copied from the
// owner's SpatialCore repository (example/GeometryTest-v1.3dm).
const fs = require('fs');
const path = require('path');
const rhino3dm = require('rhino3dm');
const out = __dirname;

function boxMesh(r, x0, y0, z0, x1, y1, z1) {
  const m = new r.Mesh();
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  for (const p of v) m.vertices().add(p[0], p[1], p[2]);
  const q = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  for (const f of q) m.faces().addQuadFace(f[0], f[1], f[2], f[3]);
  m.normals().computeNormals();
  return m;
}
function addLayer(doc, r, name, rgb, visible = true) {
  const l = new r.Layer();
  l.name = name;
  l.color = { r: rgb[0], g: rgb[1], b: rgb[2], a: 255 };
  l.visible = visible;
  return doc.layers().add(l);
}
function attrs(r, layerIndex, name) {
  const a = new r.ObjectAttributes();
  a.layerIndex = layerIndex;
  a.name = name;
  return a;
}

/** Window panel: frame members around an opening + glass, all as meshes. s = units per metre. */
function windowPanel(r, doc, { s, ox = 0, oy = 0, oz = 0, width = 3, height = 3, depth = 0.2 }) {
  const frame = addLayer(doc, r, 'Frame', [120, 120, 120]);
  const glass = addLayer(doc, r, 'Glass', [150, 200, 230]);
  const W = width * s, H = height * s, D = depth * s;
  const wx0 = 0.6 * s, wx1 = W - 0.6 * s, wz0 = 0.9 * s, wz1 = H - 0.4 * s;
  const B = (a, b, c, d, e, f) => boxMesh(r, ox + a, oy + b, oz + c, ox + d, oy + e, oz + f);
  const o = doc.objects();
  o.add(B(0, 0, 0, wx0, D, H), attrs(r, frame, 'Pier_L'));
  o.add(B(wx1, 0, 0, W, D, H), attrs(r, frame, 'Pier_R'));
  o.add(B(wx0, 0, 0, wx1, D, wz0), attrs(r, frame, 'Spandrel'));
  o.add(B(wx0, 0, wz1, wx1, D, H), attrs(r, frame, 'Head'));
  o.add(B(wx0, 0.08 * s, wz0, wx1, 0.1 * s, wz1), attrs(r, glass, 'Glass'));
}

rhino3dm().then((r) => {
  const write = (name, doc, version) => {
    const bytes = version ? doc.toByteArrayOptions(Object.assign(new r.File3dmWriteOptions(), { version, saveUserData: true })) : doc.toByteArray();
    fs.writeFileSync(path.join(out, name), bytes);
    console.log(name, bytes.length, 'bytes', version ? `v${version}` : 'default');
  };
  const newDoc = (unit) => {
    const d = new r.File3dm();
    d.settings().modelUnitSystem = unit;
    return d;
  };

  // F1: 3 m bay window panel, metres, origin at bay lower-left-front; also as v7 and v6 archives.
  let d = newDoc(r.UnitSystem.Meters); windowPanel(r, d, { s: 1 }); write('F1-bay-window-m.3dm', d);
  d = newDoc(r.UnitSystem.Meters); windowPanel(r, d, { s: 1 }); write('F1-bay-window-m-v7.3dm', d, 7);
  d = newDoc(r.UnitSystem.Meters); windowPanel(r, d, { s: 1 }); write('F1-bay-window-m-v6.3dm', d, 6);
  // F2: same in millimetres, drawn away from the origin (bbox normalisation needed).
  d = newDoc(r.UnitSystem.Millimeters); windowPanel(r, d, { s: 1000, ox: 12000, oy: -500, oz: 3000 }); write('F2-bay-window-mm-offset.3dm', d);
  // F3: Brep + Extrusion frame without render meshes (as rhino3dm / "Save Small" would produce).
  d = newDoc(r.UnitSystem.Meters);
  const bb = (a, b) => new r.BoundingBox(a, b);
  d.objects().add(r.Brep.createFromBoundingBox(bb([0, 0, 0], [0.6, 0.2, 3])), attrs(r, 0, 'BrepPier_L'));
  d.objects().add(r.Brep.createFromBoundingBox(bb([2.4, 0, 0], [3, 0.2, 3])), attrs(r, 0, 'BrepPier_R'));
  const fin = r.Extrusion.create(new r.PolylineCurve([[1.45, 0, 0], [1.55, 0, 0], [1.55, -0.3, 0], [1.45, -0.3, 0], [1.45, 0, 0]]), 3, true);
  d.objects().add(fin, attrs(r, 0, 'ExtrusionFin'));
  write('F3-brep-extrusion-nomesh-m.3dm', d);
  // F4: block — a vertical fin defined once and placed 3 times (instance references) + one plain mesh.
  d = newDoc(r.UnitSystem.Meters);
  const finMesh = boxMesh(r, -0.05, -0.3, 0, 0.05, 0, 3);
  let idef = d.instanceDefinitions().get(d.instanceDefinitions().add('Fin', 'facade fin', '', '', [0, 0, 0], [finMesh], [attrs(r, 0, 'FinGeom')]));
  for (const x of [0.5, 1.5, 2.5]) d.objects().add(new r.InstanceReference(idef.id, r.Transform.translationXYZ(x, 0, 0)), attrs(r, 0, `Fin@${x}`));
  d.objects().add(boxMesh(r, 0, 0, 0, 3, 0.2, 3), attrs(r, 0, 'BackPanel'));
  write('F4-block-fins-m.3dm', d);
  // F5: 9 m × 3 m curtain wall run (for Stretch), metres, 4 mullions + transom + glass.
  d = newDoc(r.UnitSystem.Meters);
  for (const x of [0, 2.95, 5.95, 8.9]) d.objects().add(boxMesh(r, x, 0, 0, x + 0.1, 0.2, 3), attrs(r, 0, `Mullion@${x}`));
  d.objects().add(boxMesh(r, 0, 0, 2.9, 9, 0.2, 3), attrs(r, 0, 'Transom'));
  d.objects().add(boxMesh(r, 0.1, 0.09, 0, 8.9, 0.11, 2.9), attrs(r, 0, 'Glass'));
  write('F5-curtain-run-9m-m.3dm', d);
  // F6: unitless copy of F1 (units unknown).
  d = newDoc(r.UnitSystem.None); windowPanel(r, d, { s: 1 }); write('F6-bay-window-unitless.3dm', d);

  // F7: NESTED blocks. "Fin" (box x −0.05…0.05, y −0.3…0, z 0…2.5) inside "FinPair" (fins
  // translated to x = 0 and x = 1). FinPair is placed twice with  translate(x0, 0, 0.25) × scale(0.5)
  // for x0 = 0.5 and 1.5. Correct composition (parent × child) puts fin centres at x0 + 0.5·{0, 1}
  // = 0.5, 1.0, 1.5, 2.0 (0.05 wide, z 0.25…1.5); the wrong order (child × parent) would give
  // 0.5, 1.5, 1.5, 2.5. Translations alone commute, hence the scale.
  d = newDoc(r.UnitSystem.Meters);
  const finLayer = addLayer(d, r, 'Fins', [90, 60, 40]);
  const inner = d.instanceDefinitions().get(d.instanceDefinitions().add('Fin', '', '', '', [0, 0, 0], [boxMesh(r, -0.05, -0.3, 0, 0.05, 0, 2.5)], [attrs(r, finLayer, 'FinGeom')]));
  const pair = d.instanceDefinitions().get(
    d.instanceDefinitions().add('FinPair', '', '', '', [0, 0, 0], [new r.InstanceReference(inner.id, r.Transform.translationXYZ(0, 0, 0)), new r.InstanceReference(inner.id, r.Transform.translationXYZ(1, 0, 0))], [attrs(r, finLayer, 'A'), attrs(r, finLayer, 'B')]),
  );
  for (const x of [0.5, 1.5]) {
    const placement = r.Transform.multiply(r.Transform.translationXYZ(x, 0, 0.25), r.Transform.scale([0, 0, 0], 0.5));
    d.objects().add(new r.InstanceReference(pair.id, placement), attrs(r, finLayer, `Pair@${x}`));
  }
  d.objects().add(boxMesh(r, 0, 0, 0, 3, 0.2, 3), attrs(r, 0, 'BackPanel'));
  write('F7-nested-blocks-m.3dm', d);

  // F8: one visible panel + things that must be left out: a curve, a point, a hidden mesh and a
  // mesh on a layer that is off.
  d = newDoc(r.UnitSystem.Meters);
  addLayer(d, r, 'Default', [0, 0, 0]); // layer 0, visible (a fresh File3dm has no layers)
  const off = addLayer(d, r, 'Construction', [255, 0, 0], false);
  d.objects().add(boxMesh(r, 0, 0, 0, 3, 0.2, 3), attrs(r, 0, 'Panel'));
  d.objects().add(new r.LineCurve([0, 0, 0], [3, 0, 3]), attrs(r, 0, 'Guide'));
  d.objects().add(new r.Point([1, 1, 1]), attrs(r, 0, 'Pt'));
  const hidden = attrs(r, 0, 'HiddenBox');
  hidden.visible = false;
  d.objects().add(boxMesh(r, 0, 0, 0, 30, 30, 30), hidden);
  d.objects().add(boxMesh(r, 0, 0, 0, 40, 40, 40), attrs(r, off, 'OnOffLayer'));
  write('F8-hidden-and-curves-m.3dm', d);
});
