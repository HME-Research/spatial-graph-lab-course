export * from './contracts';
export * from './facade';
export * from './geometry';
export * from './resolve';
// Schema v2 (03-building): multi-cell faces, flat roofs, straight connectors.
export * from './buildingV2';
export * from './connectorGeometry';
export * from './multicellFaces';
// Boundary shifts (2026-11-24): requests resolved in stored edge order; realised footprints and faces.
export * from './boundaryShift';
export * from './roofGeometry';
// Gate F (F-C): one face layout shared by Building and Plan; wall runs; face interaction.
export * from './faceLayout';
export * from './faceInteraction';
export * from './wallRuns';
// Workstream C: the floor plan of one storey, from the same FaceLayout.
export * from './plan';
