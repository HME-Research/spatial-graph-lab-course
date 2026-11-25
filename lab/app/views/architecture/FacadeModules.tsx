import type { ThreeEvent } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedMesh, Matrix4, MeshStandardMaterial } from 'three';
import { facadeMeshData, finishOf, materialsFor, type FacadeAssetV1, type FacadeModuleInstance, type FacadeRole } from '@app/assets';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import { isNodeSelected, selectNode, type Selection } from '@core/viewer/selection';
import { isDeliberateObjectClick } from '@core/viewer/three/interaction';

/**
 * Imported façade modules in the Building view: one `InstancedMesh` per asset (all its Repeat and
 * Stretch placements share one geometry; each instance has its own fitted matrix). Material
 * groups keep the Rhino layer colours; glazing is translucent. Flat shading derives normals from
 * the placed triangles, so non-uniform fitting never distorts the lighting. A module belongs to its
 * room: clicking it selects the room, and a selected room tints its modules.
 */

const GLASS_OPACITY = 0.45;
const WHITE = new Color('#ffffff');
const TINT = new Color('#ffffff').lerp(new Color(SELECTION_COLOR), 0.45);

function geometryOf(asset: FacadeAssetV1): BufferGeometry {
  const mesh = facadeMeshData(asset);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  asset.groups.forEach((g, i) => geometry.addGroup(g.start * 3, g.count * 3, i));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The materials of one use of the asset; an Open part is not drawn (`visible: false`). */
function materialsOf(asset: FacadeAssetV1, role: FacadeRole): MeshStandardMaterial[] {
  return materialsFor(asset, role).map((g) => {
    const finish = finishOf(g);
    const glass = finish === 'glass';
    return new MeshStandardMaterial({
      color: g.color,
      flatShading: true,
      side: DoubleSide,
      roughness: glass ? 0.1 : 0.8,
      transparent: glass,
      opacity: glass ? GLASS_OPACITY : 1,
      depthWrite: !glass,
      visible: finish !== 'open',
    });
  });
}

export interface FacadeModulesProps {
  readonly instances: readonly FacadeModuleInstance[];
  readonly assets: ReadonlyMap<string, FacadeAssetV1>;
  readonly selection: Selection;
  readonly pick: (target: Selection) => void;
  readonly setHovered: (hovered: boolean) => void;
}

export function FacadeModules({ instances, assets, selection, pick, setHovered }: FacadeModulesProps) {
  // One instanced mesh per asset AND use (façade / door bay / open bay): each use has its own materials.
  const byAsset = useMemo(() => {
    const groups = new Map<string, { readonly assetId: string; readonly role: FacadeRole; readonly list: FacadeModuleInstance[] }>();
    for (const i of instances) {
      if (!assets.has(i.assetId)) continue;
      const key = `${i.assetId}:${i.variant}`;
      const entry = groups.get(key);
      if (entry) entry.list.push(i);
      else groups.set(key, { assetId: i.assetId, role: i.variant, list: [i] });
    }
    return groups;
  }, [instances, assets]);
  return (
    <group name="facade-modules">
      {[...byAsset].map(([key, { assetId, role, list }]) => (
        <AssetModules key={key} asset={assets.get(assetId)!} role={role} instances={list} selection={selection} pick={pick} setHovered={setHovered} />
      ))}
    </group>
  );
}

const AssetModules = memo(function AssetModules({
  asset,
  role,
  instances,
  selection,
  pick,
  setHovered,
}: {
  readonly asset: FacadeAssetV1;
  readonly role: FacadeRole;
  readonly instances: readonly FacadeModuleInstance[];
  readonly selection: Selection;
  readonly pick: (target: Selection) => void;
  readonly setHovered: (hovered: boolean) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => geometryOf(asset), [asset]);
  const materials = useMemo(() => materialsOf(asset, role), [asset, role]);
  useEffect(
    () => () => {
      geometry.dispose();
      for (const m of materials) m.dispose();
    },
    [geometry, materials],
  );
  const ref = useRef<InstancedMesh>(null);

  // Matrices: only when the placements change (document edits), never on selection.
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    instances.forEach((instance, k) => mesh.setMatrixAt(k, m.fromArray(instance.matrix)));
    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    invalidate();
  }, [instances, invalidate]);

  // Selection tint per instance (the room's modules), like the room's walls.
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const created = mesh.instanceColor === null;
    instances.forEach((instance, k) => {
      const lit = isNodeSelected(selection, instance.ownerNodeId);
      mesh.setColorAt(k, lit ? TINT : WHITE);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // The shader needs the instance-colour variant once the attribute exists.
    if (created) for (const m of materials) m.needsUpdate = true;
    invalidate();
  }, [instances, selection, invalidate, materials]);

  return (
    <instancedMesh
      ref={ref}
      // A new mesh when the instance count grows beyond the allocated capacity.
      key={`${asset.id}:${role}:${Math.max(1, instances.length)}`}
      args={[geometry, materials, Math.max(1, instances.length)]}
      frustumCulled={false}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (!isDeliberateObjectClick(e.delta, e.nativeEvent)) return;
        const instance = e.instanceId === undefined ? undefined : instances[e.instanceId];
        if (instance) pick(selectNode(instance.ownerNodeId));
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    />
  );
});
