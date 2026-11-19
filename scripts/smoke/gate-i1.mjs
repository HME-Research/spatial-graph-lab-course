#!/usr/bin/env node
// Spatial Graph Lab — Integration Gate I1 scenario on the built-in example house (see scripts/smoke/README.md).
//
// Drives the REAL integrated app (dev server or production preview) through five items and records
// PASS/FAIL per check and per item:
//   1. Welcome (no auto-resume) → Create project (empty graph, House toolkit) → Try example, named and
//      saved locally → a second scenario → a different room moved in each (no leak, separate undo) →
//      a custom attribute shared by both scenarios → reload → Recent → everything restored with fresh
//      history → Export project → re-open as a separate copy with separate histories.
//   2. A relationship added in Graph 2D ("Add connection…") between two touching rooms → the Building
//      legend and the Plan door follow; moving a room away keeps it (Unresolved, no door) until Undo.
//   3. A calculated attribute (Exposed façade area) added in Attributes → read-only in Properties,
//      offered by the Voxels "Colour by", refreshed by a resize and by Undo; still there after reload.
//   4. Five view modes (+ Data), layouts 1 | 2 | 4 and maximise/restore without page scroll or clipping.
//   5. Camera target and a saved view per scenario survive a scenario switch and a reload.
//
// Same safety rules as smoke.mjs: never starts/stops Node or Vite, never writes into the
// repository (output defaults to the OS temp dir), only closes the private browser it launched.
//
//   node scripts/smoke/gate-i1.mjs --url http://localhost:5291/ [--viewport 1280x720] [--out DIR]

import {
  createProject,
  createRunner,
  delay,
  dismissNotices,
  ensureGraphEdges,
  expect,
  gotoWelcome,
  nodeCenter,
  openRail,
  runScript,
  selectNode,
  setLayout,
  setViewMode,
  tryExample,
  undo,
  waitForProject,
} from './app.mjs';

const USAGE = `Spatial Graph Lab Gate I1 scenario (projects, scenarios, calculated values, layouts, cameras).

Usage: node scripts/smoke/gate-i1.mjs --url http://localhost:5291/ [--viewport 1280x720] [--out DIR] [--browser PATH] [--headed]
The app must already be running; this script never starts or stops servers.
Exit code: 0 = all PASS, 1 = a FAIL, 2 = could not run.`;

await runScript({ name: 'gate-i1', usage: USAGE, url: 'http://localhost:5291/', viewport: '1280x720' }, async (s) => {
  const { step: run, finish, results } = createRunner(s, 'gate-i1');
  const step = (item, id, fn) => run(id, fn, { item });
  const PROJECT = `I1 Gate ${Date.now().toString(36)}`;
  const st = {};
  const B = 1; // panel index (data-panel) of panel 2

  const scenario = () => s.evaluate(`document.querySelector('.sgl-identity-scenario')?.textContent ?? null`);
  const scenarioNames = () => s.evaluate(`[...document.querySelectorAll('.sgl-scenario .sgl-scenario-name')].map((e) => e.textContent)`);
  const canUndo = () => s.evaluate('__sgl.canUndo()');
  const edgeCount = () => s.evaluate('__sgl.edgeIds().length');
  /**
   * Relationship count of scenario `name` from the stored data (its Scenarios row, "5 nodes · 4 edges"),
   * independent of how many edges Graph 2D has drawn (see the restore step).
   */
  const storedEdgeCount = (name) =>
    s.evaluate(`(() => { const li = [...document.querySelectorAll('.sgl-scenario')].find((l) => l.querySelector('.sgl-scenario-name')?.textContent === ${JSON.stringify(name)}); const m = /(\\d+) edges?/.exec(li?.querySelector('.sgl-scenario-meta')?.textContent ?? ''); return m ? Number(m[1]) : null; })()`);
  const attributesText = () => s.evaluate(`__sgl.railText('attributes')`);
  async function switchScenario(name) {
    await openRail(s, 'Scenarios');
    const ok = await s.evaluate(`(() => { const li = [...document.querySelectorAll('.sgl-scenario')].find((l) => l.querySelector('.sgl-scenario-name')?.textContent === ${JSON.stringify(name)}); const b = li?.querySelector('.sgl-scenario-switch'); if (!b) return false; b.click(); return true; })()`);
    expect(ok, `no scenario row "${name}"`);
    await s.waitFor(`document.querySelector('.sgl-identity-scenario')?.textContent === ${JSON.stringify(name)}`, 10_000, `scenario "${name}" active`);
    await delay(400);
  }
  async function positionOf(id) {
    await selectNode(s, id);
    return s.evaluate(`__sgl.triple('position').join(',')`);
  }
  /** Select room `id` and set one geometry field (`position.x`, `size.x`, …): one command. */
  async function setField(id, field, value) {
    await selectNode(s, id);
    await s.evaluate(`(() => { const el = __sgl.geo('${field}'); __sgl.setValue(el, ${value}); __sgl.enter(el); return true; })()`);
    await s.waitFor(`__sgl.geo('${field}')?.value === '${value}' && /(Move|Resize) room ${id}/.test(__sgl.undoTitle())`, 10_000, `room ${id} ${field} = ${value}`);
  }
  const savedLocally = () =>
    s.waitFor(
      `(() => { const e = document.querySelector('.sgl-save-status'); const st = e?.getAttribute('data-save-state'); if (st === 'blocked') throw new Error('save blocked: ' + e.title); return st === 'saved' && /Saved locally/.test(e.textContent); })()`,
      15_000,
      'the project to be saved locally',
    );
  const canvasPoint = (panel) =>
    s.waitFor(`(() => { const r = __sgl.rect(__sgl.canvas(${panel})); return r && r.width > 50 ? { x: r.x + r.width * 0.42, y: r.y + r.height * 0.62 } : null; })()`, 15_000, `a 3D canvas in panel ${panel}`);
  const planEdgeIds = () => s.evaluate(`(__sgl.planOpenings(${B}) ?? []).map((o) => o.edge)`);
  const legendCount = (id) => s.evaluate(`__sgl.legendCount(${B}, '${id}')`);
  const CALC = 'exposed-facade-area';
  const calcCell = `document.querySelector('#sidebar-panel-properties [data-attribute-kind="calculated"][data-metric="${CALC}"]')`;
  const calcValue = () => s.evaluate(`(${calcCell})?.innerText.split('\\n').filter(Boolean).slice(1).join(' ') ?? null`);

  // ══ Item 1: Welcome, Create, named + saved example, two scenarios ═════════════════════════════
  await step(1, 'welcome-create-empty', async () => {
    await gotoWelcome(s);
    const panels = await s.evaluate(`document.querySelectorAll('.view-panel').length`);
    expect(panels === 0, 'a project was opened automatically');
    const offers = await s.evaluate(`['Create project', 'Open project', 'Try example'].filter((t) => !document.querySelector('.sgl-welcome').innerText.includes(t))`);
    expect(offers.length === 0, `Welcome lacks ${offers}`);
    await createProject(s, { toolkit: 'house' });
    const nodes = await s.evaluate('__sgl.nodes().length');
    const bar = await s.evaluate(`document.querySelector('.project-bar')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
    expect(nodes === 0, `a created project starts with ${nodes} rooms`);
    expect(/House/.test(bar), `header: ${bar}`);
    return `Welcome without auto-resume; Create project (House toolkit): empty graph; header "${bar.slice(0, 80)}"`;
  });

  await step(1, 'example-named-and-saved', async () => {
    await tryExample(s);
    await openRail(s, 'Project');
    await s.evaluate(`(() => { const i = document.querySelector('input[aria-label="Project name"]'); __sgl.setValue(i, ${JSON.stringify(PROJECT)}); __sgl.enter(i); i.blur(); return true; })()`);
    await s.waitFor(`document.querySelector('.sgl-identity-project')?.textContent === ${JSON.stringify(PROJECT)}`, 10_000, 'the new name in the header');
    await s.click('Save locally', { within: '#sidebar-panel-project' });
    await savedLocally();
    await s.screenshot('01-saved.png');
    return `example renamed "${PROJECT}" and saved locally (header "Saved locally")`;
  });

  await step(1, 'two-scenarios-different-geometry', async () => {
    await openRail(s, 'Scenarios');
    await s.waitFor(`document.querySelectorAll('.sgl-scenario').length === 1`, 10_000, 'one scenario');
    await s.click('+ New scenario', { within: '#sidebar-panel-scenarios' });
    await s.click('Create scenario', { within: 'dialog[open]' });
    await s.waitFor(`document.querySelectorAll('.sgl-scenario').length === 2`, 10_000, 'two scenarios');
    st.names = await scenarioNames();
    st.second = await scenario();
    st.first = st.names.find((n) => n !== st.second);
    expect(st.second && st.first, `scenarios ${st.names}, active ${st.second}`);
    // Second (active) scenario: the Kitchen one cell east.
    await setField('3', 'position.x', 2);
    await switchScenario(st.first);
    expect(!(await canUndo()), `${st.first} offers Undo before any edit in it (histories mixed)`);
    const kitchenFirst = await positionOf('3');
    expect(kitchenFirst === '1,0,0', `the Kitchen moved in ${st.first} too: ${kitchenFirst}`);
    // First scenario: the Entrance one cell south, next to the Kitchen (no relationship between them).
    await setField('1', 'position.y', 0);
    await switchScenario(st.second);
    const k = await positionOf('3');
    const e = await positionOf('1');
    expect(k === '2,0,0' && e === '0,1,0', `${st.second}: kitchen ${k}, entrance ${e}`);
    const u = await s.evaluate('__sgl.undoTitle()');
    expect(/Move room 3/.test(u), `${st.second} undo: ${u}`);
    await s.screenshot('02-scenarios.png');
    return `${st.second}: Kitchen → [2,0,0]; ${st.first}: Entrance → [0,0,0]; each switch keeps its own geometry and undo ("${u}")`;
  });

  await step(1, 'shared-custom-attribute', async () => {
    await openRail(s, 'Attributes');
    await s.click('+ Add attribute', { within: '#sidebar-panel-attributes' });
    await s.click('[data-choice="custom"]', { within: 'dialog[open]' });
    await s.waitFor(`!!document.querySelector('dialog[open] input[type="text"]')`, 5000, 'the custom attribute form');
    await s.evaluate(`(() => { const i = document.querySelector('dialog[open] input[type="text"]'); __sgl.setValue(i, 'capacity'); const t = document.querySelector('dialog[open] select'); if (t) __sgl.setValue(t, 'number'); return true; })()`);
    await s.clickElement(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Add attribute')`, 'Add attribute');
    await s.waitFor(`!document.querySelector('dialog[open]') && /capacity/i.test(__sgl.railText('attributes'))`, 10_000, 'the capacity attribute');
    expect(!/capacity|attribute/i.test(await s.evaluate('__sgl.undoTitle()')), 'an attribute edit landed in the design undo history');
    await switchScenario(st.first);
    await openRail(s, 'Attributes');
    expect(/capacity/i.test(await attributesText()), `capacity is not listed in ${st.first}`);
    await selectNode(s, '2');
    expect(/capacity/i.test(await s.evaluate('__sgl.props()')), 'Properties of a room has no capacity field');
    await switchScenario(st.second);
    return `custom node attribute "capacity" (Number) added once; listed in both scenarios and in Properties; not a design undo step`;
  });

  // ══ Item 5 (part 1): camera target + saved view per scenario ═════════════════════════════════
  await step(5, 'save-view-and-switch', async () => {
    await setViewMode(s, B, 'architecture');
    const c = await canvasPoint(B);
    await openRail(s, 'Camera');
    await s.evaluate(`__sgl.setValue(document.querySelector('select[aria-label="Camera target viewport"]'), 'viewport-2'); true`);
    await s.waitFor(`document.querySelector('[data-camera-target]')?.getAttribute('data-camera-target') === 'ready'`, 10_000, 'target ready');
    await s.drag(c.x, c.y, 120, 30);
    st.saved = await s.waitFor(`__sgl.pose(${B})`, 10_000, 'a camera pose');
    await s.evaluate(`__sgl.setValue(document.querySelector('input[aria-label="Name for the saved camera"]'), 'Gate view'); true`);
    await s.click('Save view', { within: '#sidebar-panel-camera' });
    await s.waitFor(`document.querySelector('#sidebar-panel-camera [data-saved-cameras]')?.getAttribute('data-saved-cameras') === '1'`, 10_000, 'one saved camera');
    await switchScenario(st.first);
    await openRail(s, 'Camera');
    const other = await s.evaluate(`document.querySelector('#sidebar-panel-camera [data-saved-cameras]')?.getAttribute('data-saved-cameras')`);
    const target1 = await s.evaluate(`document.querySelector('select[aria-label="Camera target viewport"]')?.value`);
    expect(other === '0', `${st.first} lists ${other} saved cameras (should be per scenario)`);
    expect(target1 === 'viewport-2', `target after switch: ${target1}`);
    await switchScenario(st.second);
    await openRail(s, 'Camera');
    await s.waitFor(`document.querySelector('#sidebar-panel-camera [data-saved-cameras]')?.getAttribute('data-saved-cameras') === '1'`, 10_000, `"Gate view" back in ${st.second}`);
    const c2 = await canvasPoint(B);
    await s.drag(c2.x, c2.y, -160, 20);
    expect((await s.evaluate(`__sgl.pose(${B})`)) !== st.saved, 'orbit did not change the pose');
    await s.click('Recall', { within: '#sidebar-panel-camera' });
    await s.waitFor(`__sgl.pose(${B}) === ${JSON.stringify(st.saved)}`, 10_000, 'the recalled pose');
    await s.screenshot('05-camera.png');
    return `saved "Gate view"; ${st.first} lists 0; target stays viewport-2 across switches; Recall restored the exact pose`;
  });

  // ══ Item 3: calculated attribute → Properties read-only + colour-by + refresh ═══════════════
  await step(3, 'add-calculated-attribute', async () => {
    await openRail(s, 'Attributes');
    expect(/Area/.test(await attributesText()), 'Area is not listed under Calculated');
    await s.click('+ Add attribute', { within: '#sidebar-panel-attributes' });
    await s.click('[data-choice="calculated"]', { within: 'dialog[open]' });
    await s.clickElement(`document.querySelector('dialog[open] input[type="radio"][value="${CALC}"]')`, 'Exposed façade area');
    await s.clickElement(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Add attribute')`, 'Add attribute');
    await s.waitFor(`!document.querySelector('dialog[open]') && /Exposed façade area/.test(__sgl.railText('attributes'))`, 10_000, 'Exposed façade area in Attributes');
    return 'Attributes → + Add attribute → Calculated attribute → "Exposed façade area" listed (Area already listed by default)';
  });

  await step(3, 'properties-readonly-colour-by-refresh', async () => {
    await selectNode(s, '3');
    const v1 = await s.waitFor(`(${calcCell})?.innerText.split('\\n').filter(Boolean).slice(1).join(' ') || null`, 10_000, 'the calculated row in Properties');
    const area1 = await s.evaluate(`document.querySelector('#sidebar-panel-properties [data-attribute-kind="calculated"][data-metric="area"]')?.innerText.split('\\n').slice(1).join(' ')`);
    const inputs = await s.evaluate(`document.querySelectorAll('#sidebar-panel-properties [data-attribute-kind="calculated"] :is(input, select, textarea)').length`);
    expect(inputs === 0, 'a calculated row has inputs');
    await setViewMode(s, B, 'voxels');
    const sel = `[...__sgl.panel(${B}).querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'type'))`;
    await s.waitFor(`!!${sel}`, 15_000, 'the Voxels colour-by select');
    const offered = await s.evaluate(`[...${sel}.options].map((o) => o.value).filter((v) => v.startsWith('metric:'))`);
    expect(offered.includes(`metric:${CALC}`) && offered.includes('metric:area'), `colour-by offers ${offered}`);
    await s.evaluate(`__sgl.setValue(${sel}, 'metric:${CALC}'); true`);
    const legendText = `(__sgl.panel(${B}).querySelector('.viewer3d-legend')?.innerText ?? '')`;
    const legend1 = await s.waitFor(`/façade area/i.test(${legendText}) && ${legendText}`, 10_000, 'the colour-by legend');
    await s.screenshot('03-colour-by-before.png');
    // A resize of the Kitchen (2 cells long) changes its exterior wall area and its Area.
    await setField('3', 'size.x', 2);
    const v2 = await s.waitFor(`(() => { const t = (${calcCell})?.innerText.split('\\n').filter(Boolean).slice(1).join(' '); return t && t !== ${JSON.stringify(v1)} ? t : null; })()`, 10_000, 'a refreshed value');
    const area2 = await s.evaluate(`document.querySelector('#sidebar-panel-properties [data-attribute-kind="calculated"][data-metric="area"]')?.innerText.split('\\n').slice(1).join(' ')`);
    // The legend keeps naming the value it colours by (its bands may stay the same after one resize).
    const legend2 = await s.evaluate(legendText);
    expect(/façade area/i.test(legend2), `colour-by legend after the resize: ${legend2}`);
    await s.screenshot('03-colour-by-after.png');
    await undo(s);
    const v3 = await s.waitFor(`(() => { const t = (${calcCell})?.innerText.split('\\n').filter(Boolean).slice(1).join(' '); return t === ${JSON.stringify(v1)} ? t : null; })()`, 10_000, 'the value after Undo');
    await s.evaluate(`__sgl.setValue(${sel}, 'type'); true`);
    await setViewMode(s, B, 'architecture');
    return `Kitchen: exposed façade ${v1} → resize → ${v2} → Undo → ${v3}; Area ${area1} → ${area2}; read-only (0 inputs); Voxels coloured by it (legend "${legend1.replace(/\s+/g, ' ').slice(0, 60)}")`;
  });

  // ══ Item 2: relationship added in Graph 2D → Building and Plan ════════════════════════════════
  await step(2, 'add-edge-in-graph2d', async () => {
    await switchScenario(st.first); // Entrance [0,0,0] touches the Kitchen [1,0,0]: no relationship yet.
    await setViewMode(s, B, 'plan');
    st.planBefore = await planEdgeIds();
    await setViewMode(s, B, 'architecture');
    await delay(500);
    st.directBefore = await legendCount('status:direct');
    const edgesBefore = await edgeCount();
    await selectNode(s, '1');
    await s.click('Add connection…', { within: '.view-panel[data-panel="0"]' });
    const target = await nodeCenter(s, '3');
    await s.clickAt(target.x, target.y);
    await s.waitFor(`__sgl.edgeIds().length === ${edgesBefore + 1}`, 10_000, 'a new edge in Graph 2D');
    const u = await s.evaluate('__sgl.undoTitle()');
    await delay(600);
    const directAfter = await legendCount('status:direct');
    expect(directAfter === st.directBefore + 1, `Building legend direct ${st.directBefore} → ${directAfter}`);
    await setViewMode(s, B, 'plan');
    const added = (await planEdgeIds()).filter((e) => !st.planBefore.includes(e));
    expect(added.length === 1, `Plan openings with a new edge id: ${JSON.stringify(added)}`);
    st.newEdge = added[0];
    await s.screenshot('02-plan-after.png');
    // A Plan click on the door selects the same relationship; Properties shows its building status.
    await s.evaluate(`__sgl.panel(${B}).querySelector('.sgl-plan-openings [data-edge-id="${st.newEdge}"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); true`);
    const status = await s.waitFor(`/In the building/.test(__sgl.props()) && __sgl.props().split('In the building')[1].trim().split('\\n')[0]`, 10_000, 'the relationship in Properties');
    return `"${u}"; Graph 2D edges ${edgesBefore} → ${edgesBefore + 1}; Building direct ${st.directBefore} → ${directAfter}; Plan door for ${st.newEdge}; Properties: ${status}`;
  });

  await step(2, 'invalid-edge-kept-until-undo', async () => {
    await setViewMode(s, B, 'architecture');
    const edges = await edgeCount();
    const unresolvedBefore = await legendCount('status:unresolved');
    // The Kitchen one storey up: no longer touching the Entrance, no straight corridor.
    await setField('3', 'position.z', 1);
    await delay(600);
    expect((await edgeCount()) === edges, 'moving a room removed edges');
    const unresolvedAfter = await legendCount('status:unresolved');
    expect(unresolvedAfter > unresolvedBefore, `Building legend unresolved ${unresolvedBefore} → ${unresolvedAfter}`);
    await setViewMode(s, B, 'plan');
    expect(!(await planEdgeIds()).includes(st.newEdge), 'the Plan still draws a door for an unresolved edge');
    const offer = await s.evaluate(`!!__sgl.byText('Remove invalid connections', __sgl.graphPanel())`);
    expect(offer, 'Graph 2D offers no "Remove invalid connections"');
    await s.screenshot('02-unresolved.png');
    await undo(s);
    await s.waitFor(`(__sgl.planOpenings(${B}) ?? []).some((o) => o.edge === ${JSON.stringify(st.newEdge)})`, 10_000, 'the door again after Undo');
    await setViewMode(s, B, 'architecture');
    return `edge kept (${edges} edges), unresolved ${unresolvedBefore} → ${unresolvedAfter}, no Plan door, "Remove invalid connections" offered; Undo restored the door`;
  });

  // ══ Reload → Recent: items 1, 3 and 5 survive ═════════════════════════════════════════════════
  await step(1, 'reload-recent-restore', async () => {
    await savedLocally();
    await gotoWelcome(s);
    const rows = await s.waitFor(`(() => { const r = [...document.querySelectorAll('.sgl-welcome .sgl-recent .sgl-recent-name')].map((e) => e.textContent); return r.length ? r : null; })()`, 15_000, 'Welcome with Recent');
    expect((await s.evaluate(`document.querySelectorAll('.view-panel').length`)) === 0, 'a project reopened automatically');
    const opened = await s.evaluate(`(() => { const b = [...document.querySelectorAll('.sgl-recent-open')].find((e) => e.querySelector('.sgl-recent-name')?.textContent === ${JSON.stringify(PROJECT)}); if (!b) return false; b.click(); return true; })()`);
    expect(opened, `"${PROJECT}" not in Recent: ${JSON.stringify(rows)}`);
    await waitForProject(s, 5);
    await dismissNotices(s);
    await s.screenshot('06-restored.png');
    await openRail(s, 'Scenarios');
    const names = await scenarioNames();
    expect(names.join('|') === st.names.join('|'), `scenarios ${names}`);
    expect(!(await canUndo()), 'a restored project offers Undo');
    await switchScenario(st.second);
    const k = await positionOf('3');
    expect(!(await canUndo()), `Undo offered in ${st.second} after restore`);
    await switchScenario(st.first);
    const e = await positionOf('1');
    expect(k === '2,0,0' && e === '0,0,0', `restored geometry: kitchen ${k} (${st.second}), entrance ${e} (${st.first})`);
    await openRail(s, 'Scenarios');
    const e1 = await storedEdgeCount(st.first);
    const e2 = await storedEdgeCount(st.second);
    expect(e1 === 5 && e2 === 4, `restored edges: ${st.first} ${e1}, ${st.second} ${e2}`);
    // Known app issue (reported, not a check): after opening from Recent, Graph 2D sometimes draws no edges
    // until the view is remounted. ensureGraphEdges remounts it and records a NOTE.
    const drewEdges = await ensureGraphEdges(s, e1);
    const note = drewEdges ? '' : '; Graph 2D needed a remount to draw its edges (app issue, see NOTE)';
    await openRail(s, 'Attributes');
    expect(/capacity/i.test(await attributesText()), 'the shared capacity attribute was not restored');
    return `Welcome after reload (no auto-resume); Recent restored "${PROJECT}"; scenarios, geometry, the new edge (${e1} vs ${e2} edges) and "capacity" restored; history fresh${note}`;
  });

  await step(3, 'calculated-attribute-persisted', async () => {
    await openRail(s, 'Attributes');
    expect(/Exposed façade area/.test(await attributesText()), 'the added calculated attribute was not restored');
    await selectNode(s, '3');
    const v = await s.waitFor(`(${calcCell})?.innerText.split('\\n').filter(Boolean).slice(1).join(' ') || null`, 10_000, 'the calculated row after reload');
    return `still listed after reload; Kitchen shows ${v}`;
  });

  await step(5, 'camera-after-reload', async () => {
    await switchScenario(st.second);
    await setViewMode(s, B, 'architecture');
    const c = await canvasPoint(B);
    await openRail(s, 'Camera');
    const target = await s.evaluate(`document.querySelector('select[aria-label="Camera target viewport"]')?.value`);
    expect(target === 'viewport-2', `target after reload: ${target}`);
    await s.waitFor(`document.querySelector('#sidebar-panel-camera [data-saved-cameras]')?.getAttribute('data-saved-cameras') === '1'`, 10_000, '"Gate view" after reload');
    await s.waitFor(`document.querySelector('[data-camera-target]')?.getAttribute('data-camera-target') === 'ready'`, 10_000, 'target ready');
    await s.drag(c.x, c.y, 90, -20);
    await s.click('Recall', { within: '#sidebar-panel-camera' });
    await s.waitFor(`__sgl.pose(${B}) === ${JSON.stringify(st.saved)}`, 10_000, 'the saved pose after reload');
    await s.screenshot('06-camera-after-reload.png');
    return 'target viewport-2 remembered; "Gate view" restored with the project and recalled to the exact saved pose';
  });

  // ══ Item 1 (part 2): Export project → Open project ═══════════════════════════════════════════
  await step(1, 'export-import-project', async () => {
    await openRail(s, 'Project');
    const path = await s.download(() => s.click('Export project', { within: '#sidebar-panel-project' }));
    const json = s.readJson(path);
    const byName = Object.fromEntries(json.scenarios.map((x) => [x.name, x]));
    expect(json.scenarios.length === 2, `${json.scenarios.length} scenarios exported`);
    expect(/capacity/.test(JSON.stringify(json.attributes ?? null)), 'the capacity attribute is not in the exported attribute record');
    expect((json.settings.calculatedFields ?? []).includes(CALC), `settings.calculatedFields: ${JSON.stringify(json.settings.calculatedFields)}`);
    expect(byName[st.second].cameras.length === 1 && byName[st.first].cameras.length === 0, 'saved cameras are not per scenario in the file');
    expect(!new RegExp(`${CALC}":\\s*[0-9]`).test(JSON.stringify(json.scenarios)), 'a calculated VALUE was exported');
    await s.setFiles('#sidebar-panel-project input[type="file"]', path);
    await s.waitFor(`document.querySelector('.sgl-identity-project')?.textContent !== null && !__sgl.canUndo()`, 15_000, 'the opened copy');
    await delay(500);
    await openRail(s, 'Scenarios');
    await s.waitFor(`document.querySelectorAll('.sgl-scenario').length === 2`, 10_000, 'two scenarios in the opened copy');
    await switchScenario(st.second);
    const k = await positionOf('3');
    expect(!(await canUndo()), `Undo offered in ${st.second} of the opened copy`);
    await switchScenario(st.first);
    const e = await positionOf('1');
    expect(k === '2,0,0' && e === '0,0,0', `opened geometry: kitchen ${k}, entrance ${e}`);
    await openRail(s, 'Attributes');
    expect(/capacity/i.test(await attributesText()), 'the opened copy lost the capacity attribute');
    // One edit in one scenario does not appear in the other's undo.
    await setField('1', 'position.x', 2);
    await switchScenario(st.second);
    expect(!(await canUndo()), `an edit in ${st.first} is undoable from ${st.second} (mixed undo)`);
    const projects = await s.evaluate(`document.querySelector('.sgl-identity-project')?.textContent`);
    return `exported ${path} (2 scenarios, capacity, calculatedFields, cameras per scenario, no calculated values); re-opened as "${projects}"; scenarios, attributes and histories separate`;
  });

  // ══ Item 4: five views, 1 | 2 | 4, maximise ═══════════════════════════════════════════════════
  async function layoutCheck(label) {
    const r = await s.evaluate(`(() => {
      const d = document.documentElement, b = document.body;
      const overflow = Math.max(d.scrollWidth, b.scrollWidth) > d.clientWidth + 1 || Math.max(d.scrollHeight, b.scrollHeight) > d.clientHeight + 1;
      const ws = document.querySelector('.workspace .panels')?.getBoundingClientRect();
      const problems = [];
      const panels = [...document.querySelectorAll('.view-panel')].filter((p) => !p.hidden && p.offsetParent !== null);
      for (const p of panels) {
        const pr = p.getBoundingClientRect();
        const tag = 'panel ' + (Number(p.dataset.panel) + 1) + ' (' + p.dataset.view + ')';
        if (ws && (pr.left < ws.left - 1 || pr.right > ws.right + 1 || pr.top < ws.top - 1 || pr.bottom > ws.bottom + 1)) problems.push(tag + ' outside the workspace');
        const surface = p.querySelector('.react-flow, canvas, svg[data-view-surface], .view-body > *');
        const sr = surface?.getBoundingClientRect();
        if (!sr || sr.width < 60 || sr.height < 60) problems.push(tag + ' has no visible view surface');
        for (const el of p.querySelectorAll('.panel-header select, .panel-header button')) {
          const e = el.getBoundingClientRect();
          if (e.width === 0 || e.right > pr.right + 1 || e.left < pr.left - 1 || e.bottom > pr.bottom + 1) problems.push(tag + ' header control clipped: ' + (el.getAttribute('aria-label') || el.textContent.trim()));
        }
        const toggle = p.querySelector('.viewer3d-projection');
        if (toggle) {
          const t = toggle.getBoundingClientRect();
          if (t.right > pr.right + 1 || t.bottom > pr.bottom + 1) problems.push(tag + ' projection toggle clipped');
          for (const o of p.querySelectorAll('.viewer3d-panel, .room-edit')) {
            const q = o.getBoundingClientRect();
            if (!q.width || !(t.left < q.right && t.right > q.left && t.top < q.bottom && t.bottom > q.top)) continue;
            const cx = (Math.max(t.left, q.left) + Math.min(t.right, q.right)) / 2, cy = (Math.max(t.top, q.top) + Math.min(t.bottom, q.bottom)) / 2;
            const top = document.elementFromPoint(cx, cy);
            if (top && toggle.contains(top)) problems.push(tag + ' projection toggle covers an overlay panel');
          }
        }
      }
      const selectors = [...document.querySelectorAll('[role="group"][aria-label="Viewport layout"]')].filter((g) => g.offsetParent !== null).length;
      if (selectors !== 1) problems.push('visible layout selectors: ' + selectors);
      return { overflow, problems, panels: panels.map((p) => p.dataset.view) };
    })()`);
    await s.screenshot(`04-${label}.png`);
    expect(!r.overflow, `${label}: the page scrolls`);
    expect(r.problems.length === 0, `${label}: ${r.problems.join('; ')}`);
    return `${label}: ${r.panels.join('+')}`;
  }

  await step(4, 'views-layouts-maximise', async () => {
    const out = [];
    await dismissNotices(s);
    await setLayout(s, 4);
    for (const [p, m] of [[0, 'graph2d'], [1, 'architecture'], [2, 'voxels'], [3, 'plan']]) await setViewMode(s, p, m);
    await delay(1500);
    out.push(await layoutCheck('layout4-graph2d-building-voxels-plan'));
    await setViewMode(s, 2, 'graph3d');
    await setViewMode(s, 3, 'data');
    await delay(1000);
    out.push(await layoutCheck('layout4-graph2d-building-graph3d-data'));
    // With a room selected (the room editor shown in the 3D views). In layout 4 at 1280x720 the
    // Graph 2D panel is small and its overlays can cover the node: select it maximised, then restore.
    await s.click('Maximise', { within: '.view-panel[data-panel="0"]' });
    await delay(500);
    await selectNode(s, '2');
    await s.click('Restore', { within: '.view-panel[data-panel="0"]' });
    await delay(800);
    out.push(await layoutCheck('layout4-room-selected'));
    for (let i = 0; i < 4; i++) {
      const ok = await s.evaluate(`(() => { const b = __sgl.panel(${i})?.querySelector('.viewport-maximise'); if (!b) return false; b.click(); return true; })()`);
      expect(ok, `maximise button of panel ${i + 1}`);
      await delay(900);
      const visible = await s.evaluate(`[...document.querySelectorAll('.view-panel')].filter((p) => !p.hidden).map((p) => p.dataset.panel)`);
      expect(visible.length === 1 && visible[0] === String(i), `maximised panel ${i + 1}: visible ${visible}`);
      out.push(await layoutCheck(`maximised-${i + 1}`));
      await s.evaluate(`__sgl.panel(${i}).querySelector('.viewport-maximise').click(); true`);
      await delay(600);
    }
    await setLayout(s, 1);
    out.push(await layoutCheck('layout1'));
    await setLayout(s, 2);
    out.push(await layoutCheck('layout2'));
    const modes = await s.evaluate(`[...document.querySelectorAll('select[aria-label="View shown in panel 1"] option')].map((o) => o.value)`);
    expect(modes.join(',') === 'graph2d,graph3d,voxels,architecture,plan,data', `view modes on offer: ${modes}`);
    return `${modes.length} view modes; ${out.join(' | ')}`;
  });

  await step('-', 'console/no-errors', async () => {
    expect(s.consoleErrors.length === 0, s.consoleErrors.join(' | '));
    return 'no uncaught exceptions or console errors';
  });

  const items = [1, 2, 3, 4, 5].map((item) => {
    const rs = results.filter((r) => r.item === item);
    return { item, status: rs.length && rs.every((r) => r.status === 'PASS') ? 'PASS' : 'FAIL', checks: rs.length };
  });
  console.log('');
  for (const i of items) console.log(`ITEM ${i.item}: ${i.status} (${i.checks} checks)`);
  return finish({ project: PROJECT, items });
});
