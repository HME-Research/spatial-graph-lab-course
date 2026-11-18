import { defineSpatialAlgorithm, roomCells, uniqueId, type GridCoord, type SpatialOperation, type SpatialNode } from '@student-api';

/** LEVEL 2: explicit programme rules. An edge means ACCESS; touching alone does not create one. */
const directions: ReadonlyArray<GridCoord> = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]];
const key = (p: GridCoord) => p.join(',');
const add = (a: GridCoord, b: GridCoord): GridCoord => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];

interface Rule { readonly anchorType: string; readonly newType: string; readonly reason: string }
const rules: readonly Rule[] = [
  {anchorType:'living', newType:'study', reason:'Study grows from living space'},
  {anchorType:'kitchen', newType:'pantry', reason:'Pantry grows from kitchen'},
  {anchorType:'bedroom', newType:'bedroom', reason:'Another bedroom grows from bedroom'},
];
export default defineSpatialAlgorithm({
  id:'level-2-function-growth', label:'Level 2 — Function-driven growth',
  parameters: { maxNewRooms:{kind:'number',default:3,min:1,max:3} },
  run(ctx) {
    const occupied = new Set<string>();
    for (const room of ctx.design.nodes) for (const cell of roomCells(room)) occupied.add(key(cell));
    const usedIds = new Set<string>(); const operations: SpatialOperation[] = [];
    const limit=Math.max(1,Math.min(3,Math.floor(ctx.params.maxNewRooms??3)));
    let made=0; const outcomes: string[]=[];
    for (const rule of rules) {
      if (made >= limit) break;
      // Use existing anchors (not future generated rooms) in deterministic input order.
      const anchors=ctx.design.nodes.filter(n=>n.typeId===rule.anchorType);
      let placed=false;
      for (const anchor of anchors) {
        if (placed) break;
        for (const direction of directions) {
          if (placed) break;
          for (const cell of roomCells(anchor)) {
            const candidate=add(cell,direction);
            if (occupied.has(key(candidate))) continue;
            const nodeId=uniqueId(ctx.design,rule.newType,usedIds); usedIds.add(nodeId);
            const edgeId=uniqueId(ctx.design,'access',usedIds); usedIds.add(edgeId);
            operations.push({op:'add-node',id:nodeId,grid:candidate,size:[1,1,1],typeId:rule.newType});
            operations.push({op:'add-edge',id:edgeId,source:anchor.id,target:nodeId,kind:'access'});
            occupied.add(key(candidate)); made++; placed=true; outcomes.push(`${rule.newType} next to ${anchor.id}`); break;
          }
        }
      }
      if (!placed) outcomes.push(`Skipped ${rule.newType}: no eligible free neighbouring cell`);
    }
    return {kind:'transformation',summary:`Added ${made} room(s). ${outcomes.join('; ')}`,operations};
  }
});
