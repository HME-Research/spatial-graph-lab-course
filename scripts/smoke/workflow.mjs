#!/usr/bin/env node
// Spatial Graph Lab — end-to-end workflow check on the built-in example house. See scripts/smoke/README.md.
//
// Drives the REAL app (dev server or production preview) through the workshop workflow on real
// schema-v2 data with the real resolver: add a room, move/resize it in Properties, connect it to a
// separated room (a corridor is generated), the corridor's own walls/roof in Properties and the
// "Corridors (generated)" card in the Building Designer, a function card, undo/redo of every step
// (N operations = N undo steps), export and re-import (identical re-export); failure cases (room
// collision, corridor displacement Cancel/confirm and the resulting Unresolved relationship,
// invalid JSON, unsupported schema version, unknown Function); the selection across five views; an
// Analyse run with highlights; and the house toolkit's "Grow to target area" transform (preview,
// Apply = one undo step, stale preview).
//
// Same safety rules as smoke.mjs: never starts/stops Node or Vite, never writes into the
// repository (output defaults to the OS temp dir), only closes the private browser it launched.
//
//   node scripts/smoke/workflow.mjs --url http://localhost:5181/ [--viewport 1366x768] [--out DIR]

import {
  delay,
  dismissNotices,
  expandSection,
  expect,
  createRunner,
  openRail,
  openWithToolkit,
  redo,
  runScript,
  selectEdge,
  selectNode,
  setViewMode,
  tryExample,
  undo,
} from './app.mjs';

const USAGE = `Spatial Graph Lab workflow check (built-in example house + house toolkit transform).

Usage: node scripts/smoke/workflow.mjs --url http://localhost:5181/ [--viewport 1366x768] [--out DIR] [--browser PATH] [--headed]
The app must already be running; this script never starts or stops servers.
Exit code: 0 = all PASS, 1 = a FAIL, 2 = could not run.`;

await runScript({ name: 'workflow', usage: USAGE, url: 'http://localhost:5181/', viewport: '1366x768' }, async (s, opts) => {
  const { step, finish } = createRunner(s, 'workflow');
  const vp = `${opts.viewport.width}x${opts.viewport.height}`;
  const PROPS = '#sidebar-panel-properties';
  const G2 = '.view-panel[data-panel="0"]';
  const undoTitle = () => s.evaluate('__sgl.undoTitle()');
  const props = () => s.evaluate('__sgl.props()');

  // ── 0. fresh loads ──────────────────────────────────────────────────────────────────────────
  for (let i = 1; i <= 2; i++) {
    await step(`load/fresh-${i}`, async () => {
      const errorsBefore = s.consoleErrors.length;
      await s.goto();
      await tryExample(s);
      const bar = await s.evaluate(`document.querySelector('.sgl-identity-project')?.textContent ?? ''`);
      expect(/^Example/.test(bar), `project identity: ${bar.slice(0, 120)}`);
      const nodes = await s.evaluate('__sgl.nodes()');
      const edges = await s.evaluate('__sgl.edgeIds()');
      expect(nodes.join(',') === '1,2,3,4,5' && edges.join(',') === '1,2,3,4', `example: rooms ${nodes}, relationships ${edges}`);
      expect(!(await s.evaluate('__sgl.canUndo()')), 'a fresh example offers Undo');
      expect(s.consoleErrors.length === errorsBefore, `console errors: ${s.consoleErrors.slice(errorsBefore).join(' | ')}`);
      return `"${bar}": rooms ${nodes}, relationships ${edges}, fresh history, no console errors`;
    });
  }
  await s.screenshot(`00-loaded-${vp}.png`);

  // ── 1. workflow ─────────────────────────────────────────────────────────────────────────────
  let newId = null;
  let newEdge = null;
  const undoLabels = [];
  const record = async () => undoLabels.push(await undoTitle());

  await step('workflow/add-room', async () => {
    const before = await s.evaluate('__sgl.nodes()');
    await s.click('+ Add node', { within: G2 });
    await s.waitFor(`__sgl.nodes().length === ${before.length + 1}`, 10_000, 'a new room');
    newId = (await s.evaluate('__sgl.nodes()')).find((id) => !before.includes(id));
    await record();
    expect(/Add room \d+/.test(undoLabels.at(-1)), `undo label ${undoLabels.at(-1)}`);
    return `added room ${newId}; "${undoLabels.at(-1)}"`;
  });

  await step('workflow/move-in-properties', async () => {
    await selectNode(s, newId);
    // Position x | y | Level are separate fields: one command (one undo step) per changed axis.
    const target = [5, 1, 0];
    const next = await s.evaluate(`__sgl.triple('position')`);
    for (let i = 0; i < 3; i++) {
      if (next[i] === target[i]) continue;
      next[i] = target[i];
      const label = `Move room ${newId} to [${next.join(', ')}]`;
      await s.evaluate(`(() => { const el = __sgl.geo(__sgl.GEO.position[${i}]); __sgl.setValue(el, ${target[i]}); __sgl.enter(el); return true; })()`);
      await s.waitFor(`__sgl.undoTitle().includes(${JSON.stringify(label)})`, 10_000, label);
      await record();
    }
    return `room ${newId} at ${JSON.stringify(await s.evaluate(`__sgl.triple('position')`))}; "${undoLabels.at(-1)}"`;
  });

  await step('workflow/connect-generates-corridor', async () => {
    const edgesBefore = await s.evaluate('__sgl.edgeIds()');
    await expandSection(s, PROPS, /Relationships/);
    await s.evaluate(`__sgl.setValue(document.querySelector('select[aria-label="Room to connect to"]'), '2'); true`);
    await s.click('Connect', { within: PROPS });
    await s.waitFor(`/Add connection/.test(__sgl.undoTitle())`, 10_000, 'the connection to be recorded');
    await record();
    newEdge = (await s.evaluate('__sgl.edgeIds()')).find((id) => !edgesBefore.includes(id));
    expect(newEdge, 'no new edge in Graph 2D');
    await selectEdge(s, newEdge);
    await expandSection(s, PROPS, /In the building/);
    const text = await props();
    expect(/Connected via route/.test(text), `status: ${text.slice(0, 300)}`);
    const walls = await s.evaluate(`(() => { const sel = document.querySelector('select[aria-label="Corridor walls"]'); return sel ? sel.value + '|' + sel.options[sel.selectedIndex].text : null; })()`);
    expect(walls?.startsWith('|Design default'), `corridor walls follow the design default: ${walls}`);
    await setViewMode(s, 1, 'voxels');
    const info = await s.waitFor(`/connector cell/.test(__sgl.panel(1).innerText) && __sgl.panel(1).innerText.split('\\n').find((l) => /connector cell/.test(l))`, 10_000, 'connector cells in Voxels');
    expect(/3 connector cells/.test(info), `Voxels: ${info}`);
    await s.screenshot(`10-corridor-voxels-${vp}.png`);
    return `"${undoLabels.at(-1)}" (edge ${newEdge}): Connected via route, walls "${walls.split('|')[1]}"; Voxels "${info}"`;
  });

  await step('workflow/corridor-own-walls-and-roof', async () => {
    await setViewMode(s, 1, 'architecture');
    await selectEdge(s, newEdge);
    await expandSection(s, PROPS, /In the building/);
    const before = await undoTitle();
    await s.evaluate(`__sgl.setValue(document.querySelector('select[aria-label="Corridor walls"]'), 'enclosed'); true`);
    await s.waitFor(`__sgl.undoTitle() !== ${JSON.stringify(before)}`, 10_000, 'the walls change to be recorded');
    await record();
    await s.evaluate(`__sgl.setValue(document.querySelector('select[aria-label="Corridor roof"]'), 'none'); true`);
    await s.waitFor(`__sgl.undoTitle() !== ${JSON.stringify(undoLabels.at(-1))}`, 10_000, 'the roof change to be recorded');
    await record();
    const shown = await s.evaluate(`[document.querySelector('select[aria-label="Corridor walls"]').value, document.querySelector('select[aria-label="Corridor roof"]').value].join('/')`);
    expect(shown === 'enclosed/none', `Properties shows ${shown}`);
    await delay(500);
    await s.screenshot(`11-corridor-enclosed-no-roof-${vp}.png`);
    return `own walls Enclosed, own roof None: "${undoLabels.at(-2)}", "${undoLabels.at(-1)}"`;
  });

  await step('workflow/corridors-card', async () => {
    await openRail(s, 'Building Designer');
    const card = '#sidebar-panel-designer [data-card="corridors"]';
    await s.evaluate(`(() => { const h = document.querySelector('${card} .sgl-designer-type-head'); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); return true; })()`);
    const roof = await s.waitFor(`document.querySelector('${card} select')?.value ?? null`, 10_000, 'the Corridors card roof');
    const before = await undoTitle();
    await s.evaluate(`__sgl.setValue(document.querySelector('${card} select'), 'pergola'); true`);
    await s.waitFor(`__sgl.undoTitle() !== ${JSON.stringify(before)}`, 10_000, 'the card change to be recorded');
    await record();
    const summary = await s.waitFor(`(() => { const t = document.querySelector('${card} .sgl-designer-summary')?.textContent ?? ''; return /Pergola/i.test(t) && t; })()`, 10_000, 'the card summary');
    const note = await s.evaluate(`document.querySelector('${card}').innerText.split('\\n').find((l) => /own walls or roof/.test(l)) ?? ''`);
    expect(/1 relationship sets its own/.test(note), `card note: ${note}`);
    // The per-edge override still wins: Properties says the corridor has no roof.
    await selectEdge(s, newEdge);
    await expandSection(s, PROPS, /In the building/);
    const own = await s.evaluate(`document.querySelector('select[aria-label="Corridor roof"]').value`);
    const def = await s.evaluate(`document.querySelector('select[aria-label="Corridor roof"]').options[0].text`);
    expect(own === 'none' && /Pergola/i.test(def), `edge roof ${own}, default option "${def}"`);
    return `card roof ${roof} → pergola ("${summary}"), "${undoLabels.at(-1)}"; ${note}; edge ${newEdge} keeps its own roof, default option "${def}"`;
  });

  await step('workflow/resize-in-properties', async () => {
    await selectNode(s, newId);
    await s.evaluate(`__sgl.setTriple('size', [2, 1, 1]); true`);
    await s.waitFor(`/Resize room .* to 2×1×1/.test(__sgl.undoTitle())`, 10_000, 'the resize to be recorded');
    await record();
    const area = await s.waitFor(`(__sgl.props().match(/Area\\s*\\n?\\s*([0-9.,]+ m²)/) ?? [])[1] ?? null`, 10_000, 'the Area value');
    expect(area === '18 m²', `Area after resize: ${area}`);
    return `"${undoLabels.at(-1)}"; Area ${area}`;
  });

  await step('workflow/function-card-window', async () => {
    await openRail(s, 'Building Designer');
    const before = await undoTitle();
    await s.evaluate(`__sgl.setValue(document.querySelector('select[aria-label="Style another function"]'), 'living'); true`);
    await s.waitFor(`__sgl.undoTitle() !== ${JSON.stringify(before)}`, 10_000, 'the Living card');
    await record();
    // The Living card ("Living (living)"): open it when folded, then its window coverage field.
    const card = `[...document.querySelectorAll('#sidebar-panel-designer article.sgl-designer-type')].find((a) => /^Living/.test(a.querySelector('.sgl-designer-type-name')?.textContent ?? ''))`;
    const input = `${card}?.querySelector('input[aria-label$="window coverage in percent"]')`;
    await s.evaluate(`(() => { const h = ${card}?.querySelector('[aria-expanded]'); if (h && h.getAttribute('aria-expanded') !== 'true') h.click(); return true; })()`);
    await s.waitFor(`!!${input}`, 10_000, 'the Living window coverage field');
    await s.evaluate(`(() => { const i = ${input}; __sgl.setValue(i, '60'); __sgl.enter(i); return true; })()`);
    // The card add and the window change share the label "Change Designer settings for living": wait for the card's summary.
    const summary = await s.waitFor(`(() => { const t = ${card}?.querySelector('.sgl-designer-summary')?.textContent ?? ''; return /60\\s*%/.test(t) && t; })()`, 10_000, 'the window change on the Living card');
    await record();
    await setViewMode(s, 1, 'architecture');
    await s.screenshot(`12-designer-building-${vp}.png`);
    return `Living card added ("${undoLabels.at(-2)}"), window coverage 60 % ("${undoLabels.at(-1)}"; card "${summary.replace(/\s+/g, ' ')}")`;
  });

  await step('workflow/undo-redo-every-step', async () => {
    for (let i = undoLabels.length - 1; i >= 0; i--) {
      const title = await undoTitle();
      expect(title === undoLabels[i], `undo #${undoLabels.length - i}: expected "${undoLabels[i]}", got "${title}"`);
      await undo(s);
      // Two consecutive steps may share a label (card added, then its window changed): wait for the label
      // of the step below, or the end of the history.
      await s.waitFor(i > 0 ? `__sgl.undoTitle() === ${JSON.stringify(undoLabels[i - 1])}` : `!__sgl.canUndo()`, 5000, `undo of "${title}"`);
      await delay(150);
    }
    expect(!(await s.evaluate('__sgl.canUndo()')), 'Undo still possible after undoing every step (an operation took more than one entry)');
    expect((await s.evaluate('__sgl.nodes()')).length === 5, 'baseline should be the 5 rooms of the example');
    for (let i = 0; i < undoLabels.length; i++) {
      await redo(s);
      await s.waitFor(`__sgl.undoTitle() === ${JSON.stringify(undoLabels[i])}`, 5000, `redo of "${undoLabels[i]}"`);
      await delay(150);
    }
    expect(!(await s.evaluate('__sgl.canRedo()')), 'Redo still possible');
    return `${undoLabels.length} operations = ${undoLabels.length} undo steps, all redone`;
  });

  let exported = null;
  const exportProject = async () => {
    await openRail(s, 'Project');
    const file = await s.download(() => s.click('Export project', { within: '#sidebar-panel-project' }));
    const project = s.readJson(file);
    return { file, project, json: project.scenarios.find((x) => x.id === project.activeScenarioId).design };
  };

  await step('workflow/export-v2', async () => {
    exported = await exportProject();
    const d = exported.json;
    expect(d.schemaVersion === 2, `schemaVersion ${d.schemaVersion}`);
    const room = d.nodes.find((n) => String(n.id) === newId);
    expect(room && JSON.stringify(room.size) === '[2,1,1]' && JSON.stringify(room.position) === '[5,1,0]', `new room ${JSON.stringify(room)}`);
    const edge = d.edges.find((e) => String(e.id) === newEdge);
    expect(edge?.corridor?.walls === 'enclosed' && edge?.corridor?.roof === 'none', `corridor override ${JSON.stringify(edge)}`);
    expect(/"pergola"/.test(JSON.stringify(d.settings ?? {})), `the Corridors card roof is not in settings: ${JSON.stringify(d.settings).slice(0, 300)}`);
    const cards = (d.settings?.styles?.function?.groups ?? []).map((g) => g.look);
    expect(cards.some((a) => a.windowFraction === 0.6), `function cards ${JSON.stringify(cards)}`);
    return `${exported.file}: v2, ${d.nodes.length} rooms, ${d.edges.length} relationships, corridor ${JSON.stringify(edge.corridor)}, cards ${JSON.stringify(cards)}`;
  });

  await step('workflow/reimport-roundtrip', async () => {
    await openRail(s, 'Project');
    await s.setFiles('#sidebar-panel-project input[type="file"]', exported.file);
    await s.waitFor(`!__sgl.canUndo() && __sgl.nodes().length === ${exported.json.nodes.length}`, 15_000, 'the re-imported project (fresh history)');
    // The 'separate copy' notice appears above the workspace and shifts it: dismiss it before clicking Export.
    await delay(500);
    await dismissNotices(s);
    await delay(300);
    const again = await exportProject();
    // Re-opened in the same browser the project is a separate copy; its scenario design is identical.
    expect(JSON.stringify(again.json) === JSON.stringify(exported.json), 're-exported scenario design differs from the imported one');
    return `re-imported ${exported.json.nodes.length} rooms with fresh history; re-exported design identical; dialogs accepted: ${s.dialogs.length}`;
  });

  // ── 2. failure cases ────────────────────────────────────────────────────────────────────────
  await step('fail/room-collision-rejected', async () => {
    // Room 1 (Entrance [0,1,0]) next to room 2 (Living [1,1,0]): Position x = 1 overlaps it.
    await selectNode(s, '1');
    const before = await undoTitle();
    await s.evaluate(`(() => { const el = __sgl.geo('position.x'); __sgl.setValue(el, 1); __sgl.enter(el); return true; })()`);
    const msg = await s.waitFor(`/overlap/i.test(__sgl.props()) && __sgl.props().split('\\n').find((l) => /overlap/i.test(l))`, 10_000, 'an overlap message');
    await delay(200);
    expect((await undoTitle()) === before, 'a history entry was recorded for a rejected move');
    return `"${msg}"; no history entry`;
  });

  await step('fail/corridor-displacement-cancel-and-confirm', async () => {
    // The corridor of the new room runs through cells x 2..4 at y 1: moving the Entrance to x = 3 takes one.
    await selectNode(s, '1');
    const before = await undoTitle();
    const move = `(() => { const el = __sgl.geo('position.x'); __sgl.setValue(el, 3); __sgl.enter(el); return true; })()`;
    await s.evaluate(move);
    await s.waitFor(`!!__sgl.byText('Move anyway and recalculate')`, 10_000, 'the corridor confirmation');
    await s.screenshot(`20-displacement-confirm-${vp}.png`);
    await s.click('Cancel', { within: PROPS });
    await delay(250);
    expect((await undoTitle()) === before, 'Cancel changed the document');
    await s.evaluate(move);
    await s.click('Move anyway and recalculate');
    await s.waitFor(`/Move room 1 to \\[3, 1, 0\\]/.test(__sgl.undoTitle())`, 10_000, 'the confirmed move');
    return `Cancel kept the document; confirm recorded "${await undoTitle()}"`;
  });

  await step('fail/unresolved-after-displacement', async () => {
    await selectEdge(s, newEdge);
    await expandSection(s, PROPS, /In the building/);
    const text = await props();
    expect(/Unresolved/.test(text), `expected Unresolved: ${text.slice(0, 300)}`);
    const dash = await s.evaluate(`__sgl.graphPanel().querySelector('.react-flow__edge[data-id="${newEdge}"] path.react-flow__edge-path')?.style.strokeDasharray ?? ''`);
    await s.screenshot(`21-unresolved-${vp}.png`);
    await undo(s);
    await s.waitFor(`/Connected via route/.test(__sgl.props())`, 10_000, 'Connected via route after one Undo');
    return `edge ${newEdge} Unresolved (Graph 2D dash "${dash}"); one Undo restored "Connected via route"`;
  });

  await step('fail/invalid-json-import', async () => {
    const before = (await s.evaluate('__sgl.nodes()')).length;
    await openRail(s, 'Project');
    await s.setFiles('#sidebar-panel-project input[type="file"]', s.writeTemp('broken.json', '{ "schemaVersion": 2, "nodes": ['));
    const h = await s.waitFor(`document.querySelector('section.issues[role="alert"] h2')?.textContent`, 10_000, 'the import error');
    expect(/broken\.json/.test(h) && /kept unchanged/.test(h), h);
    expect((await s.evaluate('__sgl.nodes()')).length === before, 'design changed');
    await s.click('Dismiss', { within: 'section.issues[role="alert"]' });
    return h;
  });

  await step('fail/unsupported-version-import', async () => {
    await s.setFiles('#sidebar-panel-project input[type="file"]', s.writeTemp('future.json', JSON.stringify({ schemaVersion: 3, metadata: { name: 'x' }, nodes: [], edges: [] })));
    const text = await s.waitFor(`document.querySelector('section.issues[role="alert"]')?.innerText`, 10_000, 'the version error');
    expect(/future\.json/.test(text), text);
    await s.click('Dismiss', { within: 'section.issues[role="alert"]' });
    return text.split('\n')[0];
  });

  await step('fail/unknown-function-import', async () => {
    const doc = {
      schemaVersion: 2,
      metadata: { name: 'Unknown function' },
      nodes: [
        { id: 1, position: [0, 0, 0], size: [1, 1, 1], function: 'spaceship', custom: {} },
        { id: 2, position: [3, 0, 0], size: [1, 1, 1], function: 'living', custom: {} },
      ],
      edges: [{ id: 1, source: 1, target: 2, relationship: 'access', custom: {} }],
      diagram: { positions: {} },
      settings: { styleBy: 'function', styles: {} },
    };
    const errorsBefore = s.consoleErrors.length;
    await openRail(s, 'Project');
    await s.setFiles('#sidebar-panel-project input[type="file"]', s.writeTemp('unknown-function.json', JSON.stringify(doc)));
    await s.waitFor(`__sgl.nodes().length === 2`, 15_000, 'the imported design');
    await setViewMode(s, 1, 'architecture');
    await s.screenshot(`30-unknown-function-${vp}.png`);
    expect(s.consoleErrors.length === errorsBefore, `console errors: ${s.consoleErrors.slice(errorsBefore).join(' | ')}`);
    return 'loaded (2 rooms, 1 corridor relationship) without console errors';
  });

  // ── 3. one selection across five views ──────────────────────────────────────────────────────
  await step('views/selection-across-views', async () => {
    await tryExample(s);
    await selectNode(s, '4');
    const out = [];
    for (const mode of ['graph3d', 'voxels', 'architecture', 'plan', 'data']) {
      await setViewMode(s, 1, mode);
      const still = await s.evaluate(`!!__sgl.geo('position.x') && /Room\\s*\\n?\\s*4\\b/.test(__sgl.props()) && !!__sgl.graphPanel().querySelector('.react-flow__node.selected[data-id="4"]')`);
      expect(still, `selection lost when panel 2 shows ${mode}`);
      await s.screenshot(`40-selected-${mode}-${vp}.png`);
      out.push(mode);
    }
    // An edit in Properties reaches the other views: the Bedroom (over the Living) moves one cell east.
    await s.evaluate(`(() => { const el = __sgl.geo('position.x'); __sgl.setValue(el, 2); __sgl.enter(el); return true; })()`);
    await s.waitFor(`__sgl.undoTitle().includes('Move room 4 to [2, 1, 1]')`, 10_000, 'the move');
    await setViewMode(s, 1, 'voxels');
    const info = await s.waitFor(`__sgl.panel(1).innerText.split('\\n').find((l) => /rooms ·/.test(l))`, 10_000, 'Voxels info');
    return `room 4 stays selected with panel 2 in ${out.join(', ')}; after a move Voxels: "${info}"`;
  });

  // ── 4. Analyse: a run with highlights ───────────────────────────────────────────────────────
  await step('analyse/neighbours-highlight-stale-clear', async () => {
    await undo(s);
    await selectNode(s, '2');
    await openRail(s, 'Analyse');
    const item = `#sidebar-panel-analyse [data-analysis]`;
    await s.waitFor(`[...document.querySelectorAll('${item}')].some((li) => /Neighbours/.test(li.textContent))`, 10_000, 'the Neighbours analysis');
    await s.clickElement(`[...document.querySelectorAll('${item}')].find((li) => /Neighbours/.test(li.textContent))?.querySelector('button')`, 'Neighbours');
    const result = await s.waitFor(`document.querySelector('#sidebar-panel-analyse .sgl-analysis-result:not(.failed)')?.innerText`, 10_000, 'the result');
    expect(/1, 3, 4/.test(result), `result: ${result}`);
    const marked = await s.waitFor(`(() => { const m = [...__sgl.graphPanel().querySelectorAll('.react-flow__node .sgl-has-analysis')].map((e) => e.closest('.react-flow__node').dataset.id).sort(); return m.length ? m : null; })()`, 10_000, 'highlights in Graph 2D');
    expect(marked.join(',') === '1,3,4', `Graph 2D highlights ${marked}`);
    await s.screenshot(`50-analyse-${vp}.png`);
    // An edit makes the shown result out of date (never silently wrong).
    await selectNode(s, '5');
    await s.evaluate(`(() => { const el = __sgl.geo('position.x'); __sgl.setValue(el, 3); __sgl.enter(el); return true; })()`);
    await s.waitFor(`/Move room 5/.test(__sgl.undoTitle())`, 10_000, 'an edit');
    await openRail(s, 'Analyse');
    await s.waitFor(`!!document.querySelector('#sidebar-panel-analyse .sgl-analysis-result.stale')`, 10_000, 'the out-of-date mark');
    await s.click('Clear', { within: '#sidebar-panel-analyse .sgl-analysis-result' });
    await s.waitFor(`!__sgl.graphPanel().querySelector('.sgl-has-analysis') && !document.querySelector('#sidebar-panel-analyse .sgl-analysis-result')`, 10_000, 'Clear to remove the result and highlights');
    await undo(s);
    return `Neighbours of 2: "${result.replace(/\s+/g, ' ').slice(0, 60)}"; Graph 2D highlights ${marked}; stale after an edit; Clear removed result and highlights`;
  });

  // ── 5. Transform with the house toolkit ─────────────────────────────────────────────────────
  const TP = '#sidebar-panel-transform';
  const runGrow = async () => {
    await openRail(s, 'Transform');
    await s.clickElement(`[...document.querySelectorAll('${TP} .algorithm-item')].find((b) => /Grow to target area/.test(b.textContent))`, 'Grow to target area');
    await s.click('Run', { within: TP });
    return s.waitFor(`document.querySelector('${TP} .algorithm-result')?.innerText ?? null`, 15_000, 'the preview');
  };

  await step('transform/grow-preview-apply-undo', async () => {
    await openWithToolkit(s, 'house');
    const nodes = await s.evaluate('__sgl.nodes()');
    expect(nodes.length === 5, `house design rooms ${nodes}`);
    const preview = await runGrow();
    expect(/Living 2: 9 → 36 m²/.test(preview) && /Kitchen 3: 9 → 18 m²/.test(preview) && /Bedroom 4: 9 → 18 m²/.test(preview), `preview: ${preview.slice(0, 400)}`);
    expect(!(await s.evaluate('__sgl.canUndo()')), 'the preview changed the design (Undo offered)');
    await s.click('Apply', { within: `${TP} .algorithm-result` });
    await s.waitFor(`/Apply “Grow to target area”/.test(__sgl.undoTitle())`, 10_000, 'the Apply to be recorded');
    await selectNode(s, '2');
    const size = await s.evaluate(`__sgl.triple('size').join('×')`);
    expect(size === '2×2×1', `Living size after Apply: ${size}`);
    const area = await s.evaluate(`(__sgl.props().match(/Area\\s*\\n?\\s*([0-9.,]+ m²)/) ?? [])[1] ?? null`);
    await s.screenshot(`60-grown-${vp}.png`);
    // ONE Undo reverses the whole transform.
    await undo(s);
    await s.waitFor(`__sgl.triple('size').join('×') === '1×1×1'`, 10_000, 'the Living back to 1×1×1');
    expect(!(await s.evaluate('__sgl.canUndo()')), 'more than one undo step for one Apply');
    return `preview lists Living 36, Kitchen 18, Bedroom 18 m²; Apply → Living ${size} (Area ${area}); one Undo restored 1×1×1 with no further undo`;
  });

  await step('transform/stale-preview', async () => {
    await runGrow();
    // Change the design elsewhere (Redo of the Apply): the preview can no longer be applied.
    await redo(s);
    await s.waitFor(`/can no longer be applied/.test(__sgl.railText('transform'))`, 10_000, 'the stale message');
    const disabled = await s.evaluate(`[...document.querySelectorAll('${TP} .apply-button')].every((b) => b.disabled)`);
    expect(disabled, 'Apply still enabled on a stale preview');
    await undo(s);
    await delay(250);
    expect(/can no longer be applied/.test(await s.evaluate(`__sgl.railText('transform')`)), 'the preview became applicable again after returning to the same content');
    return 'stale after Redo: message shown, Apply disabled; still stale after Undo back to the same content';
  });

  await step('console/no-errors', async () => {
    expect(s.consoleErrors.length === 0, s.consoleErrors.join(' | '));
    return `no console errors${s.ignoredConsole.length ? ` (${s.ignoredConsole.length} ignored favicon 404)` : ''}`;
  });

  await s.screenshot(`99-final-${vp}.png`);
  return finish();
});
