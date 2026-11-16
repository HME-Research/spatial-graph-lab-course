import { describe, expect, it } from 'vitest';
import { savedCameraSchema } from '@core/viewer/three/camera';
import { VIEW_MODES } from '@app/views/contracts';
import { appSavedCameraSchema, CAMERA_VIEW_MODES, type AppSavedCamera } from './savedCamera';

const saved = (viewMode: string) => ({
  id: 'cam-1',
  name: 'Entrance',
  viewMode,
  pose: { projection: 'perspective', position: [10, 8, 10], target: [0, 0, 0], up: [0, 1, 0], fov: 45 },
});

describe('appSavedCameraSchema', () => {
  it('lists exactly the 3D view modes, in VIEW_MODES order', () => {
    expect(CAMERA_VIEW_MODES).toEqual(['graph3d', 'voxels', 'architecture']);
    for (const mode of CAMERA_VIEW_MODES) expect(VIEW_MODES).toContain(mode);
  });

  it('accepts a saved camera for each 3D view mode', () => {
    for (const mode of CAMERA_VIEW_MODES) {
      const parsed: AppSavedCamera = appSavedCameraSchema.parse(saved(mode));
      expect(parsed.viewMode).toBe(mode);
    }
  });

  it('refuses graph2d, plan and unknown view modes that the core schema accepts', () => {
    for (const mode of ['graph2d', 'plan', 'Graph3D', 'elevation']) {
      expect(savedCameraSchema.safeParse(saved(mode)).success).toBe(true);
      const result = appSavedCameraSchema.safeParse(saved(mode));
      expect(result.success, mode).toBe(false);
      expect(result.error?.issues[0]?.message).toMatch(/viewMode must be one of: graph3d, voxels, architecture/);
    }
  });

  it('stays strict like the core schema', () => {
    expect(appSavedCameraSchema.safeParse({ ...saved('voxels'), extra: 1 }).success).toBe(false);
    expect(appSavedCameraSchema.safeParse({ ...saved('voxels'), id: '' }).success).toBe(false);
  });
});
