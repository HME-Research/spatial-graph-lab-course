import { defineSpatialAlgorithm, type SpatialOperation } from '@student-api';

// Connect the kitchen and dining room with an Access relationship.
export default defineSpatialAlgorithm({
  id: 'connect-kitchen-to-dining',
  label: 'Connect kitchen to dining room',
  run(ctx) {
    // For a draft with extra rooms, use the first kitchen and dining room.
    const kitchen = ctx.design.nodes.find((room) => room.function === 'kitchen' && room.position[2] === 0);
    const dining = ctx.design.nodes.find((room) => room.function === 'dining-room' && room.position[2] === 0);
    const operations: SpatialOperation[] = [];
    let summary = 'Add a kitchen and a dining room to connect them.';

    // Keep any relationship already drawn between these rooms.
    if (kitchen && dining) {
      summary = 'The kitchen and dining room are already connected.';
      if (!ctx.touches(kitchen.id, dining.id)) {
        summary = 'Put the ground-floor kitchen and dining room against a shared wall first.';
      } else if (ctx.canRelate(kitchen.id, dining.id)) {
        operations.push({ op: 'add-edge', source: kitchen.id, target: dining.id, relationship: 'access' });
        summary = 'One new Access connection from the kitchen to the dining room.';
      }
    }
    return { kind: 'transformation', summary, operations };
  },
});
