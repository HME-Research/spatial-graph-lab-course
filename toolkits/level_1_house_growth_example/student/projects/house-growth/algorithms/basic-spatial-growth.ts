import { defineSpatialAlgorithm, roomCells, uniqueId, type GridCoord, type SpatialNode, type SpatialOperation } from '@student-api';

/** LEVEL 1: deterministic growth, one cell and one access edge per step. */
const directions: ReadonlyArray<GridCoord> = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]];
const key = (p: GridCoord) => p.join(',');
const add = (a: GridCoord, b: GridCoord): GridCoord => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];

export default defineSpatialAlgorithm({
  id: 'level-1-basic-growth',
  label: 'Level 1 — Grow available cells',
  parameters: {
    startRoomId: {kind:'text',default:'living'},
    steps: {kind:'number',default:3,min:1,max:12},
  },
  run(ctx) {
    const start = ctx.design.nodes.find(n => n.id === ctx.params.startRoomId);
    if (!start) return {kind:'transformation',summary:'Start room not found',operations:[]};
    const occupied = new Set<string>();
    for (const room of ctx.design.nodes) for (const cell of roomCells(room)) occupied.add(key(cell));
    const operations: SpatialOperation[] = [];
    const usedIds = new Set<string>();
    const frontier: SpatialNode[] = [start];
    let made = 0;
    const requested = Math.max(1,Math.min(12,Math.floor(ctx.params.steps ?? 3)));
    // Breadth-first: expand from the selected room and then from newly added rooms.
    while (frontier.length > 0 && made < requested) {
      const parent = frontier.shift()!;
      let added = false;
      for (const direction of directions) {
        for (const cell of roomCells(parent)) {
          const candidate = add(cell,direction);
          if (occupied.has(key(candidate))) continue;
          const nodeId = uniqueId(ctx.design,'grown-room',usedIds); usedIds.add(nodeId);
          const edgeId = uniqueId(ctx.design,'grown-edge',usedIds); usedIds.add(edgeId);
          operations.push({op:'add-node',id:nodeId,grid:candidate,size:[1,1,1],typeId:'extension'});
          operations.push({op:'add-edge',id:edgeId,source:parent.id,target:nodeId,kind:'access'});
          occupied.add(key(candidate));
          frontier.push({id:nodeId,grid:candidate,size:[1,1,1],typeId:'extension',attributes:{}});
          made++; added=true; break;
        }
        if (added) break;
      }
      // Single extension from each frontier room prevents one parent creating all branches.
    }
    return {kind:'transformation',summary:`Added ${made} extension room(s)`,operations};
  },
});
