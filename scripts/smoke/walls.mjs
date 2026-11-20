#!/usr/bin/env node
// Spatial Graph Lab — shared wall ↔ graph interactions and "Remove invalid connections". See scripts/smoke/README.md.
//
// Drives the REAL app with real pointer input (CDP Input.dispatchMouseEvent) on the built-in example
// house plus one added room (room 6 at [0,0,0], beside the Kitchen and in front of the Entrance), so
// that the Kitchen | room 6 wall is a free shared wall:
//   building-add-access   Building: hover/click that wall → Add relationship → Access → the edge is in
//                         Graph 2D, the door is on THAT wall (wall panel + status legend) and in the Plan
//                         (opening on the same face id); one Undo removes it everywhere.
//   plan-add-access       The same from the Plan; the Building's panel then offers change/remove only.
//   remove-invalid        Three unresolved relationships → Graph 2D "Remove invalid connections" review →
//                         uncheck one → only the checked ones are removed (Graph 2D, Building, Graph 3D,
//                         Voxels legends agree); ONE Undo restores both.
//   no-invalid-explained  With nothing unresolved the Graph 2D canvas menu explains it.
//   i2/*                  A wall click selects the owner room; "Remove relationship" leaves no edge
//                         selected; five-view sync of one wall-added Access edge through Undo, a room move
//                         (kept, unresolved: "no longer shared"), Remove invalid connections and one Undo.
//   graph2d-legend-4-viewports  Layout 4: the Graph 2D legend starts folded with no node under it.
//
// Same safety rules as smoke.mjs: never starts/stops Node or Vite, never writes into the repository
// (output defaults to the OS temp dir), only closes the private browser it launched.
//
//   node scripts/smoke/walls.mjs --url http://localhost:5306/ [--viewport 1280x720] [--out DIR]

import { createRunner, delay, expect, openRail, redo, runScript, selectNode, setLayout, setViewMode, openBuiltInExample, undo } from './app.mjs';

const USAGE = `Spatial Graph Lab wall ↔ graph check (built-in example house + one added room).

Usage: node scripts/smoke/walls.mjs --url http://localhost:5306/ [--viewport 1280x720] [--out DIR] [--browser PATH] [--headed]
The app must already be running; this script never starts or stops servers.
Exit code: 0 = all PASS, 1 = a FAIL, 2 = could not run.`;

/** Screen point of a world point in a canvas with pose `pose` (from data-camera-pose; Y up). */
function project(pose, rect, q) {
  const [projection, ps, ts, extra] = pose.split('|');
  const p = ps.split(',').map(Number);
  const t = ts.split(',').map(Number);
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => {
    const l = Math.hypot(...a);
    return a.map((v) => v / l);
  };
  const f = norm(sub(t, p));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(q, p);
  const aspect = rect.width / rect.height;
  let nx;
  let ny;
  if (projection === 'orthographic') {
    const h = Number(extra) / 2;
    nx = dot(d, r) / (h * aspect);
    ny = dot(d, u) / h;
  } else {
    const k = Math.tan((Number(extra) * Math.PI) / 180 / 2);
    const z = dot(d, f);
    nx = dot(d, r) / (z * k * aspect);
    ny = dot(d, u) / (z * k);
  }
  return { x: rect.x + ((nx + 1) / 2) * rect.width, y: rect.y + ((1 - ny) / 2) * rect.height };
}

await runScript({ name: 'walls', usage: USAGE, url: 'http://localhost:5306/', viewport: '1280x720' }, async (s) => {
  const { step, finish } = createRunner(s, 'walls');
  const B = 1; // panel index (data-panel) of the Building / Plan / 3D views
  const P = (i) => `__sgl.panel(${i})`;
  const G2 = `__sgl.graphPanel()`;
  const buttonIn = (scope, text) => `[...(${scope})?.querySelectorAll('button') ?? []].find((b) => __sgl.visible(b) && b.textContent.trim().startsWith(${JSON.stringify(text)}))`;
  const wallPanel = () => s.evaluate(`__sgl.wallPanel(${B})`);
  const wallButton = (text) => buttonIn(`${P(B)}.querySelector('.sgl-wall-panel')`, text);
  const edgeIds = () => s.evaluate('__sgl.edgeIds()');
  const legendCount = (id) => s.evaluate(`__sgl.legendCount(${B}, '${id}')`);
  const panelRect = () => s.evaluate(`__sgl.rect(${P(B)})`);
  const closeWall = () => s.clickElement(`${P(B)}.querySelector('.sgl-wall-close')`, 'close the wall panel');
  /** Select room `id` and set one Position axis (one command; nothing when it is already there). */
  const setAxis = async (id, axis, value) => {
    await selectNode(s, id);
    if ((await s.evaluate(`__sgl.geo('position.${axis}')?.value`)) === String(value)) return false;
    await s.evaluate(`(() => { const el = __sgl.geo('position.${axis}'); __sgl.setValue(el, ${value}); __sgl.enter(el); return true; })()`);
    await s.waitFor(`__sgl.geo('position.${axis}')?.value === '${value}' && /Move room ${id}/.test(__sgl.undoTitle())`, 10_000, `room ${id} position.${axis} = ${value}`);
    return true;
  };
  /** Undo until the Undo button names `title` again (the base state). */
  const undoTo = async (title) => {
    for (let i = 0; i < 12 && (await s.evaluate('__sgl.undoTitle()')) !== title; i++) {
      const t = await s.evaluate('__sgl.undoTitle()');
      await undo(s);
      await s.waitFor(`__sgl.undoTitle() !== ${JSON.stringify(t)}`, 5000, `undo of "${t}"`);
    }
    expect((await s.evaluate('__sgl.undoTitle()')) === title, `could not undo back to "${title}"`);
  };

  // The free wall: Kitchen (room 3, [1,0,0]) | room 6 at [0,0,0]: face "3:-x", owner room 3.
  // Grid → Three.js: x = 3·gx, z = −3·gy, storey 0 from y 0 to 3; the wall is at x = 1.5, z = 0.
  const WALL = '3:-x';
  const OWNER = '3';
  const WALL_WORLD = [1.5, 0];

  /** Hover around points of the wall until the Building reports it under the pointer; returns that point. */
  async function findWall() {
    const tried = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const pose = await s.evaluate(`__sgl.pose(${B})`);
      const rect = await s.evaluate(`__sgl.rect(__sgl.canvas(${B}))`);
      for (const y of [2.2, 1.6, 2.7, 1.0, 0.6]) {
        for (const dz of [0, -0.6, 0.6, -1.1, 1.1]) {
          const c = project(pose, rect, [WALL_WORLD[0], y, WALL_WORLD[1] + dz]);
          for (const [ox, oy] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
            const x = c.x + ox;
            const yy = c.y + oy;
            if (x < rect.x + 2 || x > rect.x + rect.width - 2 || yy < rect.y + 2 || yy > rect.y + rect.height - 2) continue;
            await s.moveTo(x, yy);
            await delay(40);
            const hit = await s.evaluate(`__sgl.wallHover(${B})`);
            tried.push(hit);
            if (hit === WALL) return { x, y: yy };
          }
        }
      }
      // Not reachable from this side: orbit (real drag on the canvas) and try again.
      await s.drag(rect.x + rect.width * 0.3, rect.y + rect.height * 0.5, Math.round(rect.height * 0.45), Math.round(rect.height * 0.12), { steps: 16 });
      await delay(400);
    }
    throw new Error(`no pointer position over ${WALL} (hover results: ${[...new Set(tried)].join(', ') || 'none'})`);
  }
  async function openWallInBuilding() {
    await setViewMode(s, B, 'architecture');
    const at = await findWall();
    await s.clickAt(at.x, at.y, { settle: 250 });
    return s.waitFor(`(() => { const p = __sgl.wallPanel(${B}); return p && p.face === ${JSON.stringify(WALL)} ? p : null; })()`, 10_000, 'the Building wall panel');
  }
  async function addAccessFromPanel() {
    await s.clickElement(wallButton('Add relationship'), 'Add relationship…');
    await s.clickElement(wallButton('Access'), 'Access');
    return s.waitFor(`(() => { const p = __sgl.wallPanel(${B}); return p && p.state === 'existing' ? p : null; })()`, 10_000, 'the panel to show the new relationship');
  }
  /** Click the Graph 2D background: nothing selected. */
  async function clearSelection() {
    const pane = await s.evaluate(`(() => { const b = ${G2}.querySelector('.react-flow__pane').getBoundingClientRect(); return { x: b.x + b.width - 40, y: b.y + b.height * 0.55 }; })()`);
    await s.clickAt(pane.x, pane.y);
  }
  const roomSelected = (id) => `!!__sgl.geo('position.x') && !!${G2}.querySelector('.react-flow__node.selected[data-id="${id}"]')`;
  const planLine = `${P(B)}.querySelector('.sgl-plan-wall-target[data-face-id="${WALL}"]')`;
  async function clickPlanWall() {
    const c = await s.waitFor(`(() => { const b = ${planLine}?.getBoundingClientRect(); return b && b.width + b.height > 4 ? { x: b.x + b.width / 2, y: b.y + b.height * 0.3 } : null; })()`, 10_000, 'the wall line in the Plan');
    await s.moveTo(c.x, c.y);
    await delay(150);
    const hovered = await s.evaluate(`${planLine}.classList.contains('hovered')`);
    await s.clickAt(c.x, c.y, { settle: 250 });
    const p = await s.waitFor(`(() => { const p = __sgl.wallPanel(${B}); return p && p.face === ${JSON.stringify(WALL)} ? p : null; })()`, 10_000, 'the Plan wall panel');
    return { ...p, hovered };
  }
  /** Status counts of the three 3D views' legends (panel 2 cycles through them). */
  async function legends(status) {
    const out = {};
    for (const mode of ['architecture', 'graph3d', 'voxels']) {
      await setViewMode(s, B, mode);
      out[mode] = await legendCount(`status:${status}`);
    }
    return out;
  }
  const sameCounts = (a, b, d = 0) => Object.keys(a).every((k) => b[k] === a[k] + d);
  /** Pixels of the selection colour (#ff2d95, shaded) in panel B's canvas. */
  async function selectionPixels() {
    await delay(500);
    const rect = await s.evaluate(`__sgl.rect(__sgl.canvas(${B}))`);
    const { data } = await s.page.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } });
    return s.evaluate(`(async () => {
      const img = new Image(); img.src = 'data:image/png;base64,${data}'; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < px.length; i += 4) { const r = px[i], gr = px[i + 1], b = px[i + 2]; if (r > 120 && r > 1.8 * gr + 20 && b > 1.4 * gr + 10 && r > b) n++; }
      return n;
    })()`);
  }
  const reviewRows = (dialog) =>
    s.waitFor(`(() => { const d = ${dialog}; return d ? [...d.querySelectorAll('label[data-edge-id]')].map((l) => ({ id: l.dataset.edgeId, checked: l.querySelector('input').checked, text: l.innerText })) : null; })()`, 10_000, 'the review list');

  const st = {};
  await step('open-example', async () => {
    await openBuiltInExample(s);
    // Room 6: added (the app picks a free cell), then moved to [0, 0, 0] (y first: x = 0 at y = 1 would overlap the Entrance).
    const before = await s.evaluate('__sgl.nodes()');
    await s.click('+ Add node', { within: '.view-panel[data-panel="0"]' });
    await s.waitFor(`__sgl.nodes().length === ${before.length + 1}`, 10_000, 'the new room');
    const id = (await s.evaluate('__sgl.nodes()')).find((x) => !before.includes(x));
    expect(id === '6', `new room id ${id}`);
    await setAxis('6', 'y', 0);
    await setAxis('6', 'x', 0);
    const pos = await s.evaluate(`__sgl.triple('position').join(',')`);
    expect(pos === '0,0,0', `room 6 at ${pos}`);
    st.base = await s.evaluate('__sgl.undoTitle()');
    await clearSelection();
    await setViewMode(s, B, 'architecture');
    // Roofs off (a view cutaway) so the interior wall can be seen from above.
    const roofs = `[...${P(B)}.querySelectorAll('label')].find((l) => /Roofs/.test(l.textContent))?.querySelector('input')`;
    if (await s.evaluate(`${roofs}?.checked`)) await s.clickElement(roofs, 'the Roofs checkbox');
    await s.waitFor(`${roofs}?.checked === false`, 5000, 'roofs hidden');
    await delay(600);
    const edges = await edgeIds();
    expect(edges.join(',') === '1,2,3,4', `example edges: ${edges}`);
    await setViewMode(s, B, 'plan');
    const free = await s.evaluate(`[...${P(B)}.querySelectorAll('.sgl-plan-wall-target')].map((e) => e.dataset.faceId)`);
    expect(free.includes(WALL), `Plan wall targets ${free} lack ${WALL}`);
    await setViewMode(s, B, 'architecture');
    return `example + room 6 at [0,0,0]; Building roofs hidden; edges ${edges}; Plan wall targets ${free.join(', ')}`;
  });

  await step('building-add-access', async () => {
    st.edgesBefore = await edgeIds();
    st.directBefore = await legendCount('status:direct');
    const rect = await panelRect();
    const before = await s.screenshot('01-building-before.png', { clip: rect });
    const at = await findWall();
    const hint = await s.evaluate(`${P(B)}.querySelector('[data-wall-hover]')?.textContent ?? ''`);
    expect(/Wall between/.test(hint), `hover hint: ${hint}`);
    await s.screenshot('02-building-hover.png', { clip: rect });
    await s.clickAt(at.x, at.y, { settle: 250 });
    const panel = await s.waitFor(`(() => { const p = __sgl.wallPanel(${B}); return p && p.face === ${JSON.stringify(WALL)} ? p : null; })()`, 10_000, 'the wall panel');
    expect(panel.state === 'add' && /Add relationship/.test(panel.text), `wall panel ${panel.state}: ${panel.text}`);
    const after = await addAccessFromPanel();
    expect(after.opening === 'here', `door not on the clicked wall: ${after.opening} (${after.text})`);
    st.edge = after.edge;
    const added = (await edgeIds()).filter((e) => !st.edgesBefore.includes(e));
    expect(added.length === 1 && added[0] === st.edge, `Graph 2D new edges ${JSON.stringify(added)} (panel edge ${st.edge})`);
    const label = await s.evaluate('__sgl.undoTitle()');
    await delay(500);
    const directAfter = await legendCount('status:direct');
    expect(directAfter === st.directBefore + 1, `Building legend direct ${st.directBefore} → ${directAfter}`);
    await closeWall();
    await delay(400);
    const shot = await s.screenshot('03-building-door.png', { clip: rect });
    expect(shot.data !== before.data, 'the Building pixels did not change');
    await setViewMode(s, B, 'plan');
    const door = (await s.evaluate(`__sgl.planOpenings(${B})`)).filter((o) => o.edge === st.edge);
    expect(door.length === 1 && door[0].face === WALL && /door/.test(door[0].cls), `Plan openings of ${st.edge}: ${JSON.stringify(door)}`);
    await s.screenshot('04-plan-door.png', { clip: await panelRect() });
    await undo(s);
    await s.waitFor(`__sgl.edgeIds().length === ${st.edgesBefore.length}`, 10_000, 'the edge removed by one Undo');
    expect(!(await s.evaluate(`__sgl.planOpenings(${B})`)).some((o) => o.edge === st.edge), 'the Plan door survived Undo');
    await setViewMode(s, B, 'architecture');
    const directUndo = await legendCount('status:direct');
    expect(directUndo === st.directBefore, `Building legend direct after undo ${directUndo}`);
    return `"${label}"; edge ${st.edge}: Graph 2D +1, Building direct ${st.directBefore} → ${directAfter} (pixels changed), "door on this wall", Plan door on ${WALL}; one Undo removed it everywhere`;
  });

  await step('plan-add-access', async () => {
    await setViewMode(s, B, 'plan');
    const panel = await clickPlanWall();
    expect(panel.hovered, 'the wall is not highlighted on hover');
    expect(panel.state === 'add', `Plan wall panel state ${panel.state}`);
    expect(await s.evaluate(`${planLine}.classList.contains('active')`), 'the open wall is not highlighted');
    const after = await addAccessFromPanel();
    expect(after.opening === 'here', `Plan panel: door ${after.opening}`);
    const door = (await s.evaluate(`__sgl.planOpenings(${B})`)).filter((o) => o.edge === after.edge);
    expect(door.length === 1 && door[0].face === WALL, `Plan door: ${JSON.stringify(door)}`);
    expect(after.edge === st.edge, `edge id not stable across add/undo/add: ${st.edge} then ${after.edge}`);
    await s.screenshot('05-plan-added.png', { clip: await panelRect() });
    // The Building puts the door on the same wall, and a related wall offers change/remove only.
    const b = await openWallInBuilding();
    expect(b.state === 'existing' && b.edge === after.edge && b.opening === 'here', `Building panel: ${JSON.stringify(b)}`);
    expect(!/Add relationship/.test(b.text) && /Change to Open/.test(b.text) && /Remove relationship/.test(b.text), `related wall offers: ${b.text}`);
    await s.screenshot('06-building-existing.png', { clip: await panelRect() });
    await undo(s);
    await s.waitFor(`__sgl.edgeIds().length === ${st.edgesBefore.length}`, 10_000, 'one Undo');
    const p2 = await s.waitFor(`(() => { const p = __sgl.wallPanel(${B}); return p && p.state === 'add' ? p : null; })()`, 10_000, 'the panel to offer Add again after Undo');
    await closeWall();
    return `edge ${after.edge} added from the Plan on ${WALL}; Building panel "door on this wall"; related wall offers change/remove only; one Undo → panel offers ${p2.state} again`;
  });

  await step('remove-invalid', async () => {
    // Three unresolved relationships, one single-axis move each (one undo step each).
    await setAxis('5', 'y', 4); // Bath [0,4,1]: not aligned with the Bedroom → edge 4 unresolved
    await setAxis('3', 'x', 6); // Kitchen [6,0,0]: not aligned with the Living → edge 2 unresolved
    await setAxis('1', 'y', 4); // Entrance [0,4,0]: not aligned with the Living → edge 1 unresolved
    await clearSelection();
    const edges = await edgeIds();
    const button = buttonIn(G2, 'Remove invalid connections');
    const label = await s.waitFor(`${button}?.textContent`, 10_000, 'the Remove invalid connections button');
    expect(/\(3\)/.test(label), `button: ${label}`);
    const unresolved = await legends('unresolved');
    await s.clickElement(button, 'Remove invalid connections');
    const dialog = `${G2}.querySelector('.sgl-invalid-dialog')`;
    const rows = await reviewRows(dialog);
    expect(rows.length === 3 && rows.every((r) => r.checked), `rows ${JSON.stringify(rows)}`);
    const preview = await s.evaluate(`[...${G2}.querySelectorAll('[data-remove-preview]')].map((e) => e.dataset.removePreview).sort()`);
    expect(preview.length === 3, `preview marks ${preview}`);
    const keep = rows[0].id;
    await s.clickElement(`${dialog}.querySelector('label[data-edge-id="${keep}"] input')`, `uncheck ${keep}`);
    await s.waitFor(`!${dialog}.querySelector('label[data-edge-id="${keep}"] input').checked`, 5000, 'the row unchecked');
    const preview2 = await s.evaluate(`[...${G2}.querySelectorAll('[data-remove-preview]')].map((e) => e.dataset.removePreview).sort()`);
    expect(preview2.length === 2 && !preview2.includes(keep), `preview after uncheck ${preview2}`);
    await s.screenshot('07-remove-invalid-review.png');
    await s.clickElement(buttonIn(dialog, 'Remove 2 selected'), 'Remove 2 selected');
    await s.waitFor(`__sgl.edgeIds().length === ${edges.length - 2}`, 10_000, 'two edges removed');
    const left = await edgeIds();
    const removed = rows.map((r) => r.id).filter((id) => id !== keep);
    expect(left.includes(keep) && removed.every((id) => !left.includes(id)), `left ${left}`);
    const undoLabel = await s.evaluate('__sgl.undoTitle()');
    expect(/Remove 2 invalid connections/.test(undoLabel), `undo label ${undoLabel}`);
    const afterCounts = await legends('unresolved');
    expect(sameCounts(unresolved, afterCounts, -2), `unresolved ${JSON.stringify(unresolved)} → ${JSON.stringify(afterCounts)}`);
    await s.screenshot('08-removed.png');
    await undo(s);
    await s.waitFor(`__sgl.edgeIds().length === ${edges.length}`, 10_000, 'both edges back after one Undo');
    expect(JSON.stringify(await edgeIds()) === JSON.stringify(edges), 'edge ids differ after Undo');
    const restored = await legends('unresolved');
    expect(sameCounts(unresolved, restored), `unresolved after undo ${JSON.stringify(restored)}`);
    const label2 = await s.evaluate(`${buttonIn(G2, 'Remove invalid connections')}?.textContent`);
    expect(/\(3\)/.test(label2 ?? ''), `button after undo: ${label2}`);
    return `3 unresolved (Building/Graph 3D/Voxels ${Object.values(unresolved).join('/')}); kept ${keep}, removed ${removed.join(', ')} → ${Object.values(afterCounts).join('/')}; "${undoLabel}"; one Undo restored ${edges.length} edges`;
  });

  await step('no-invalid-explained', async () => {
    await undoTo(st.base);
    await s.waitFor(`!${buttonIn(G2, 'Remove invalid connections')}`, 10_000, 'the contextual button to disappear');
    const pane = await s.evaluate(`(() => { const b = ${G2}.querySelector('.react-flow__pane').getBoundingClientRect(); return { x: b.x + b.width - 30, y: b.y + b.height * 0.45 }; })()`);
    await s.clickAt(pane.x, pane.y, { button: 'right' });
    await s.clickElement(`[...${G2}.querySelectorAll('.sgl-menu button')].find((b) => b.textContent.startsWith('Remove invalid connections'))`, 'the menu item');
    const text = await s.waitFor(`${G2}.querySelector('.sgl-status')?.textContent`, 10_000, 'the explanation');
    expect(/no invalid connections/.test(text), `notice: ${text}`);
    await s.evaluate(`${G2}.querySelector('.sgl-status button[aria-label="Dismiss"]')?.click(); true`);
    return `no button without unresolved relationships; the menu explains: "${text.replace(/\s+/g, ' ').replace(/×$/, '').trim()}"`;
  });

  // ── Integration gate I2 ──────────────────────────────────────────────────────────────────────
  await step('i2/wall-click-selects-owner-room', async () => {
    await clearSelection();
    const panel = await openWallInBuilding();
    expect(panel.state === 'add', `wall panel ${panel.state}: ${panel.text}`);
    await s.waitFor(roomSelected(OWNER), 10_000, `the owner room (${OWNER}) selected`);
    await s.screenshot('10-i2-wall-and-room.png', { clip: await panelRect() });
    await closeWall();
    await clearSelection();
    await setViewMode(s, B, 'plan');
    const p2 = await clickPlanWall();
    await s.waitFor(roomSelected(OWNER), 10_000, 'the owner room selected from the Plan');
    await closeWall();
    return `free wall ${WALL}: Building panel "${panel.state}" + owner room ${OWNER} selected; Plan panel "${p2.state}" + the same room selected`;
  });

  await step('i2/remove-from-wall-panel-clears-edge-selection', async () => {
    const before = await edgeIds();
    await clearSelection();
    await openWallInBuilding();
    const added = await addAccessFromPanel();
    await s.waitFor(`!!${G2}.querySelector('.react-flow__edge.selected[data-id="${added.edge}"]')`, 10_000, 'the new edge selected in Graph 2D');
    await s.clickElement(wallButton('Remove relationship'), 'Remove relationship');
    await s.waitFor(`__sgl.edgeIds().length === ${before.length}`, 10_000, 'the edge removed');
    const p = await s.waitFor(`(() => { const p = __sgl.wallPanel(${B}); return p && p.state === 'add' ? p : null; })()`, 10_000, 'the panel to offer Add again');
    await s.waitFor(roomSelected(OWNER), 10_000, 'the owner room selected after the removal');
    expect(!(await s.evaluate(`!!${G2}.querySelector('.react-flow__edge.selected')`)), 'an edge is still selected in Graph 2D');
    await undo(s);
    await s.waitFor(`__sgl.edgeIds().includes(${JSON.stringify(added.edge)})`, 10_000, 'the edge back after Undo');
    await undo(s);
    await s.waitFor(`__sgl.edgeIds().length === ${before.length}`, 10_000, 'the add undone');
    await closeWall();
    return `edge ${added.edge} added then removed from the wall panel → panel "${p.state}", room ${OWNER} selected, no edge selected in Graph 2D; history back to base`;
  });

  await step('i2/five-view-sync', async () => {
    const log = [];
    await clearSelection();
    const edges0 = await edgeIds();
    const direct0 = await legends('direct');
    const unresolved0 = await legends('unresolved');
    await setViewMode(s, B, 'graph3d');
    const g3None = await selectionPixels();
    await setViewMode(s, B, 'voxels');
    const voxNone = await selectionPixels();
    // 1. Access added by a Building wall click.
    await openWallInBuilding();
    const b = await addAccessFromPanel();
    const E = b.edge;
    expect(b.opening === 'here', `Building: door ${b.opening}`);
    await closeWall();
    const g2 = await edgeIds();
    const sel = await s.evaluate(`!!${G2}.querySelector('.react-flow__edge.selected[data-id="${E}"]')`);
    expect(g2.length === edges0.length + 1 && g2.includes(E) && sel, `Graph 2D: ${g2} (selected ${E}: ${sel})`);
    expect(/Access/.test(await s.evaluate('__sgl.props()')), 'Properties does not show the relationship');
    const direct1 = await legends('direct');
    expect(sameCounts(direct0, direct1, 1), `direct legends ${JSON.stringify(direct0)} → ${JSON.stringify(direct1)}`);
    const vox1 = await selectionPixels();
    await s.screenshot('11-i2-voxels-selected.png', { clip: await panelRect() });
    await setViewMode(s, B, 'graph3d');
    const g31 = await selectionPixels();
    await s.screenshot('12-i2-graph3d-selected.png', { clip: await panelRect() });
    expect(g31 > g3None + 30, `Graph 3D selection pixels ${g3None} → ${g31}`);
    expect(vox1 > voxNone + 30, `Voxels selection pixels ${voxNone} → ${vox1}`);
    await setViewMode(s, B, 'plan');
    const door = (await s.evaluate(`__sgl.planOpenings(${B})`)).filter((o) => o.edge === E);
    expect(door.length === 1 && door[0].face === WALL && /door/.test(door[0].cls), `Plan: ${JSON.stringify(door)}`);
    log.push(`add ${E}: Graph 2D +1 (selected), Building door on ${WALL}, Plan door on ${door[0].face}, direct ${Object.values(direct0).join('/')} → ${Object.values(direct1).join('/')}, selection px Graph 3D ${g3None}→${g31}, Voxels ${voxNone}→${vox1}`);
    // 2. One Undo removes it everywhere.
    await undo(s);
    await s.waitFor(`!__sgl.edgeIds().includes(${JSON.stringify(E)})`, 10_000, 'the edge removed by Undo');
    expect(!(await s.evaluate(`__sgl.planOpenings(${B})`)).some((o) => o.edge === E), 'Plan door survived Undo');
    const directU = await legends('direct');
    expect(sameCounts(direct0, directU), `direct after Undo ${JSON.stringify(directU)}`);
    const voxU = await selectionPixels();
    await setViewMode(s, B, 'graph3d');
    const g3U = await selectionPixels();
    expect(g3U < g31 - 30 && voxU < vox1 - 30, `selection highlight after Undo: Graph 3D ${g3U}, Voxels ${voxU}`);
    log.push(`one Undo: gone from Graph 2D/Plan, direct ${Object.values(directU).join('/')}, highlight px Graph 3D ${g3U} Voxels ${voxU}`);
    // 3. Redo, then move room 6 away: the edge stays, unresolved everywhere.
    await redo(s);
    await s.waitFor(`__sgl.edgeIds().includes(${JSON.stringify(E)})`, 10_000, 'the edge back after Redo');
    await setAxis('6', 'y', 3);
    expect((await edgeIds()).includes(E), 'the edge was removed by moving a room');
    const dash = await s.evaluate(`${G2}.querySelector('.react-flow__edge[data-id="${E}"] path.react-flow__edge-path')?.style.strokeDasharray ?? ''`);
    expect(dash, `Graph 2D: ${E} is not drawn as unresolved`);
    const unresolved2 = await legends('unresolved');
    expect(Object.keys(unresolved0).every((k) => unresolved2[k] >= unresolved0[k] + 1), `unresolved legends ${JSON.stringify(unresolved0)} → ${JSON.stringify(unresolved2)}`);
    await setViewMode(s, B, 'plan');
    expect(!(await s.evaluate(`__sgl.planOpenings(${B})`)).some((o) => o.edge === E), 'Plan still draws a door for the unresolved edge');
    log.push(`room 6 moved to [0,3,0]: ${E} kept, dashed in Graph 2D (${dash}), unresolved ${Object.values(unresolved0).join('/')} → ${Object.values(unresolved2).join('/')}, no Plan opening`);
    // 4. Remove invalid connections lists it ("no longer shared"), checked; remove only it.
    await s.clickElement(buttonIn(G2, 'Remove invalid connections'), 'Remove invalid connections');
    const dialog = `${G2}.querySelector('.sgl-invalid-dialog')`;
    const rows = await reviewRows(dialog);
    const row = rows.find((r) => r.id === E);
    expect(row && row.checked && /no longer shared/.test(row.text), `row for ${E}: ${JSON.stringify(row)} of ${JSON.stringify(rows)}`);
    for (const r of rows.filter((x) => x.id !== E)) await s.clickElement(`${dialog}.querySelector('label[data-edge-id="${r.id}"] input')`, `uncheck ${r.id}`);
    await s.screenshot('13-i2-remove-review.png');
    await s.clickElement(buttonIn(dialog, 'Remove 1 selected'), 'Remove 1 selected');
    await s.waitFor(`!__sgl.edgeIds().includes(${JSON.stringify(E)})`, 10_000, 'the edge removed');
    const left = await edgeIds();
    expect(rows.filter((x) => x.id !== E).every((x) => left.includes(x.id)), `unchecked rows removed too: ${left}`);
    const unresolved3 = await legends('unresolved');
    expect(sameCounts(unresolved2, unresolved3, -1), `unresolved after removal ${JSON.stringify(unresolved3)}`);
    log.push(`review list: ${rows.length} row(s), ${E} checked "${row.text.replace(/\s+/g, ' ').trim()}"; removed only ${E}, unresolved ${Object.values(unresolved3).join('/')}`);
    // 5. One Undo restores it, still unresolved.
    await undo(s);
    await s.waitFor(`__sgl.edgeIds().includes(${JSON.stringify(E)})`, 10_000, 'the edge back after one Undo');
    expect(JSON.stringify(await edgeIds()) === JSON.stringify([...left, E].sort()), 'edge ids after Undo');
    const unresolved4 = await legends('unresolved');
    expect(sameCounts(unresolved2, unresolved4), `unresolved after Undo ${JSON.stringify(unresolved4)}`);
    log.push(`one Undo: ${E} back, unresolved ${Object.values(unresolved4).join('/')}`);
    await undoTo(st.base);
    await s.waitFor(`__sgl.edgeIds().length === ${edges0.length}`, 10_000, 'the base state');
    await setViewMode(s, B, 'architecture');
    return log.join('; ');
  });

  await step('graph2d-legend-4-viewports', async () => {
    await setLayout(s, 4);
    await s.evaluate(`${G2}.querySelector('.sgl-status button[aria-label="Dismiss"]')?.click(); true`);
    await delay(1200);
    const m = await s.evaluate(`(() => {
      const p = ${G2};
      const legend = p.querySelector('.sgl-legend');
      const details = legend?.querySelector('details');
      const lb = legend?.getBoundingClientRect();
      const covered = [...p.querySelectorAll('.react-flow__node')].filter((n) => { const b = n.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2; return lb && x >= lb.x && x <= lb.right && y >= lb.y && y <= lb.bottom; }).map((n) => n.dataset.id);
      const pb = p.getBoundingClientRect();
      return { open: details?.open ?? null, legend: lb ? [Math.round(lb.width), Math.round(lb.height)] : null, panel: [Math.round(pb.width), Math.round(pb.height)], covered };
    })()`);
    await s.screenshot('09-layout4.png');
    expect(m.open === false, `legend open (${m.open}) in a ${m.panel.join('×')} panel`);
    expect(m.covered.length === 0, `nodes under the legend: ${m.covered}`);
    await s.clickElement(`${G2}.querySelector('.sgl-legend summary')`, 'the legend toggle');
    const opened = await s.waitFor(`${G2}.querySelector('.sgl-legend details')?.open`, 5000, 'the legend to open');
    await setLayout(s, 2);
    return `panel ${m.panel.join('×')}: legend folded (${m.legend.join('×')} px), no node under it; opens on click (${opened})`;
  });

  await step('console/no-errors', async () => {
    expect(s.consoleErrors.length === 0, s.consoleErrors.join(' | '));
    return 'no uncaught exceptions or console errors';
  });

  return finish();
});
