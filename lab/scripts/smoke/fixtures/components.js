// Dev-server-only fixture: renders the Stage 07 components in isolation so the smoke harness can
// check keyboard help, legends and the analysis legend in a real browser BEFORE integration wires
// them into the app. Served by `vite` at /scripts/smoke/fixtures/components.html (not by `preview`).
import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HELP_DETAILS, HELP_TOPIC_IDS, HelpLabel, HelpTip } from '../../../app/ui/help/index.ts';
import { presentAnalysis, relationshipLegend } from '../../../app/views/presentation/index.ts';
import { AnalysisLegend, RelationshipLegend } from '../../../app/views/presentation/LegendViews.tsx';

const VIEWS = ['graph2d', 'graph3d', 'voxels', 'architecture'];

function Fixture() {
  const [shown, setShown] = useState(true);
  const [stale, setStale] = useState(false);
  const analysis = presentAnalysis({
    title: 'Access depth',
    nodeValues: { a: 0, b: 1, c: 2, d: null },
    ranOnNodeIds: ['a', 'b', 'c', 'd'],
    currentNodeIds: ['a', 'b', 'c', 'd'],
    stale,
  });
  return h(
    'main',
    null,
    h('h1', null, 'Stage 07 components'),
    h('div', { className: 'row' }, h('button', { className: 'plain', id: 'before-help' }, 'Start'), ...HELP_TOPIC_IDS.map((id) => h(HelpLabel, { key: id, topicId: id }, id))),
    h('div', { className: 'row' }, ...VIEWS.map((v) => h(RelationshipLegend, { key: v, legend: relationshipLegend(v), helpDetails: HELP_DETAILS }))),
    h(
      'div',
      { className: 'row' },
      h('button', { className: 'plain', id: 'toggle-stale', onClick: () => setStale((s) => !s) }, 'Edit design (mark stale)'),
      h('button', { className: 'plain', id: 'show-analysis', onClick: () => setShown(true) }, 'Show analysis'),
      shown ? h(AnalysisLegend, { presentation: analysis, onClear: () => setShown(false) }) : h('p', { id: 'analysis-cleared' }, 'Analysis cleared.'),
    ),
    h('p', null, h(HelpTip, { topicId: 'unknown-topic' }), 'Unknown topics render nothing.'),
  );
}

createRoot(document.getElementById('root')).render(h(Fixture));
