import { describe, expect, it } from 'vitest';
import {
  addEdge,
  addNode,
  createGraph,
  edgesBetween,
  getEdge,
  getNode,
  incidentEdges,
  incomingEdges,
  neighbours,
  outgoingEdges,
  predecessors,
  removeEdge,
  removeNode,
  successors,
  updateEdge,
  updateNode,
  validateGraph,
  type Graph,
  type GraphPolicy,
  type Result,
} from './index';

const UNDIRECTED: GraphPolicy = { directed: false, allowSelfLoops: false, allowParallelEdges: false };
const DIRECTED: GraphPolicy = { directed: true, allowSelfLoops: false, allowParallelEdges: false };
const MULTI: GraphPolicy = { directed: false, allowSelfLoops: true, allowParallelEdges: true };

function value<T, I>(result: Result<T, I>): T {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.issues)}`);
  return result.value;
}
const codes = <T, I extends { code: string }>(result: Result<T, I>): string[] =>
  result.ok ? [] : result.issues.map((i) => i.code);

// ---- 1 + 3. An undirected social network with custom payloads, no spatial metadata ----

interface Person {
  readonly id: string;
  readonly name: string;
  readonly interests: readonly string[];
}
interface Friendship {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly since: number;
  readonly closeness: 'acquaintance' | 'friend' | 'close';
}

const people: Person[] = [
  { id: 'ada', name: 'Ada', interests: ['maths'] },
  { id: 'ben', name: 'Ben', interests: ['music', 'maths'] },
  { id: 'cy', name: 'Cy', interests: [] },
  { id: 'dee', name: 'Dee', interests: ['art'] },
];
const friendships: Friendship[] = [
  { id: 'f1', source: 'ada', target: 'ben', since: 2019, closeness: 'close' },
  { id: 'f2', source: 'cy', target: 'ada', since: 2021, closeness: 'friend' },
];

describe('undirected social network', () => {
  const social = (): Graph<Person, Friendship> => value(createGraph(UNDIRECTED, people, friendships));

  it('is valid without any spatial metadata', () => {
    expect(validateGraph(social())).toEqual([]);
  });

  it('treats edges as symmetric for queries', () => {
    const g = social();
    expect(neighbours(g, 'ada')).toEqual(['ben', 'cy']);
    expect(neighbours(g, 'cy')).toEqual(['ada']);
    expect(successors(g, 'cy')).toEqual(['ada']);
    expect(predecessors(g, 'cy')).toEqual(['ada']);
    expect(outgoingEdges(g, 'ada').map((e) => e.id)).toEqual(['f1', 'f2']);
    expect(edgesBetween(g, 'ben', 'ada').map((e) => e.id)).toEqual(['f1']);
    expect(neighbours(g, 'dee')).toEqual([]);
  });

  it('keeps payloads fully typed and untouched', () => {
    const g = social();
    const ada = getNode(g, 'ada');
    expect(ada?.interests).toEqual(['maths']);
    const f2 = getEdge(g, 'f2');
    expect(f2?.closeness).toBe('friend');
    // Type-level: the payload type flows through queries and updates.
    const next = value(updateEdge(g, 'f2', (e): Friendship => ({ ...e, closeness: 'close' })));
    const closeness: Friendship['closeness'] | undefined = getEdge(next, 'f2')?.closeness;
    expect(closeness).toBe('close');
    expect(getEdge(g, 'f2')?.closeness).toBe('friend'); // original unchanged
  });

  it('rejects a second friendship between the same people in either order', () => {
    const r = addEdge(social(), { id: 'f3', source: 'ben', target: 'ada', since: 2024, closeness: 'friend' });
    expect(codes(r)).toEqual(['parallel-edge']);
  });

  it('removes a person together with their friendships, immutably', () => {
    const g = social();
    const next = value(removeNode(g, 'ada'));
    expect(next.nodes.map((n) => n.id)).toEqual(['ben', 'cy', 'dee']);
    expect(next.edges).toEqual([]);
    expect(g.nodes).toHaveLength(4);
    expect(g.edges).toHaveLength(2);
  });
});

// ---- 2 + 3. A directed dependency graph ----

interface Pkg {
  readonly id: string;
  readonly version: string;
}
interface DependsOn {
  readonly id: string;
  readonly source: string; // dependent
  readonly target: string; // dependency
  readonly range: string;
  readonly dev?: boolean;
}

describe('directed dependency graph', () => {
  const deps = (): Graph<Pkg, DependsOn> =>
    value(
      createGraph<Pkg, DependsOn>(
        DIRECTED,
        [
          { id: 'app', version: '1.0.0' },
          { id: 'ui', version: '2.1.0' },
          { id: 'util', version: '0.3.0' },
        ],
        [
          { id: 'd1', source: 'app', target: 'ui', range: '^2' },
          { id: 'd2', source: 'app', target: 'util', range: '~0.3', dev: true },
          { id: 'd3', source: 'ui', target: 'util', range: '*' },
        ],
      ),
    );

  it('respects direction in queries', () => {
    const g = deps();
    expect(successors(g, 'app')).toEqual(['ui', 'util']);
    expect(predecessors(g, 'app')).toEqual([]);
    expect(predecessors(g, 'util')).toEqual(['app', 'ui']);
    expect(outgoingEdges(g, 'ui').map((e) => e.id)).toEqual(['d3']);
    expect(incomingEdges(g, 'ui').map((e) => e.id)).toEqual(['d1']);
    expect(incidentEdges(g, 'ui').map((e) => e.id)).toEqual(['d1', 'd3']);
    expect(neighbours(g, 'ui')).toEqual(['app', 'util']);
    expect(edgesBetween(g, 'app', 'ui').map((e) => e.id)).toEqual(['d1']);
    expect(edgesBetween(g, 'ui', 'app')).toEqual([]);
  });

  it('allows opposite directions between the same pair but not the same direction twice', () => {
    const g = deps();
    const back = addEdge(g, { id: 'd4', source: 'util', target: 'app', range: '^1' });
    expect(back.ok).toBe(true);
    const again = addEdge(g, { id: 'd5', source: 'app', target: 'ui', range: '^3' });
    expect(codes(again)).toEqual(['parallel-edge']);
  });

  it('re-checks endpoints when an update rewires an edge', () => {
    const g = deps();
    expect(codes(updateEdge(g, 'd2', (e) => ({ ...e, target: 'ui' })))).toEqual(['parallel-edge']);
    expect(codes(updateEdge(g, 'd2', (e) => ({ ...e, target: 'nope' })))).toEqual(['dangling-edge']);
    const rewired = value(updateEdge(g, 'd3', (e) => ({ ...e, source: 'util', target: 'ui' })));
    expect(successors(rewired, 'util')).toEqual(['ui']);
  });
});

// ---- 4. Valid and invalid operations ----

type N = { readonly id: string; readonly label?: string };
type E = { readonly id: string; readonly source: string; readonly target: string };

describe('operations', () => {
  const base = (): Graph<N, E> => value(createGraph<N, E>(UNDIRECTED, [{ id: 'a' }, { id: 'b' }], []));

  it('adds nodes and edges and rejects duplicates or missing endpoints', () => {
    const g1 = value(addNode(base(), { id: 'c' }));
    expect(g1.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    const dupNode = addNode(g1, { id: 'a' });
    expect(dupNode.ok ? [] : dupNode.issues).toEqual([
      { path: ['nodes', 3, 'id'], code: 'duplicate-node-id', message: 'duplicate node id "a" (first used at nodes[0])' },
    ]);

    const g2 = value(addEdge(g1, { id: 'ab', source: 'a', target: 'b' }));
    expect(codes(addEdge(g2, { id: 'ab', source: 'b', target: 'c' }))).toEqual(['duplicate-edge-id']);
    expect(codes(addEdge(g2, { id: 'ax', source: 'x', target: 'y' }))).toEqual(['dangling-edge', 'dangling-edge']);
  });

  it('updates records but never their IDs', () => {
    const g = base();
    const renamed = value(updateNode(g, 'a', (n) => ({ ...n, label: 'Alpha' })));
    expect(getNode(renamed, 'a')?.label).toBe('Alpha');
    expect(getNode(g, 'a')?.label).toBeUndefined();
    expect(codes(updateNode(g, 'a', () => ({ id: 'z' })))).toEqual(['id-changed']);
  });

  it('reports missing targets as not-found', () => {
    const g = base();
    expect(codes(removeNode(g, 'zz'))).toEqual(['not-found']);
    expect(codes(removeEdge(g, 'zz'))).toEqual(['not-found']);
    expect(codes(updateNode(g, 'zz', (n) => n))).toEqual(['not-found']);
    expect(codes(updateEdge(g, 'zz', (e) => e))).toEqual(['not-found']);
  });

  it('removes edges without touching nodes', () => {
    const g = value(addEdge(base(), { id: 'ab', source: 'a', target: 'b' }));
    const next = value(removeEdge(g, 'ab'));
    expect(next.edges).toEqual([]);
    expect(next.nodes).toBe(g.nodes);
  });
});

// ---- 5. Self-loops and parallel edges under explicit policies ----

describe('self-loop and parallel-edge policies', () => {
  const nodes: N[] = [{ id: 'a' }, { id: 'b' }];
  const loop: E = { id: 'aa', source: 'a', target: 'a' };
  const twins: E[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'a' },
  ];

  it('forbids them when the policy says so', () => {
    expect(codes(createGraph(UNDIRECTED, nodes, [loop]))).toEqual(['self-loop']);
    expect(codes(createGraph(UNDIRECTED, nodes, twins))).toEqual(['parallel-edge']);
    expect(codes(addEdge(value(createGraph<N, E>(UNDIRECTED, nodes)), loop))).toEqual(['self-loop']);
  });

  it('accepts them when the policy allows them', () => {
    const g = value(createGraph(MULTI, nodes, [...twins, loop]));
    expect(edgesBetween(g, 'a', 'b').map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(neighbours(g, 'a')).toEqual(['b', 'a']);
    expect(incidentEdges(g, 'a').map((e) => e.id)).toEqual(['e1', 'e2', 'aa']);
    const more = value(addEdge(g, { id: 'e3', source: 'a', target: 'b' }));
    expect(more.edges).toHaveLength(4);
  });

  it('still checks endpoints of an allowed self-loop', () => {
    expect(codes(createGraph(MULTI, nodes, [{ id: 'zz', source: 'z', target: 'z' }]))).toEqual([
      'dangling-edge',
      'dangling-edge',
    ]);
  });

  it('allows parallel edges independently of self-loops', () => {
    const policy: GraphPolicy = { directed: true, allowSelfLoops: false, allowParallelEdges: true };
    expect(createGraph(policy, nodes, [twins[0]!, { ...twins[0]!, id: 'e1b' }]).ok).toBe(true);
    expect(codes(createGraph(policy, nodes, [loop]))).toEqual(['self-loop']);
  });
});

// ---- 6. Structural errors ----

describe('structural validation', () => {
  it('reports every problem with a path, in array order', () => {
    const g: Graph<N, E> = {
      policy: UNDIRECTED,
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'a' }],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e1', source: 'b', target: 'ghost' },
        { id: 'e3', source: 'b', target: 'b' },
        { id: 'e4', source: 'b', target: 'a' },
      ],
    };
    expect(validateGraph(g).map((i) => [i.code, i.path])).toEqual([
      ['duplicate-node-id', ['nodes', 2, 'id']],
      ['duplicate-edge-id', ['edges', 1, 'id']],
      ['dangling-edge', ['edges', 1, 'target']],
      ['self-loop', ['edges', 2]],
      ['parallel-edge', ['edges', 3]],
    ]);
  });

  it('createGraph refuses invalid input and does not alias the caller arrays', () => {
    expect(createGraph(UNDIRECTED, [{ id: 'a' }, { id: 'a' }]).ok).toBe(false);
    const input: N[] = [{ id: 'a' }];
    const g = value(createGraph<N, E>(UNDIRECTED, input));
    input.push({ id: 'b' });
    expect(g.nodes).toHaveLength(1);
  });
});
