import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide, MeshStandardMaterial } from 'three';
import { facadeMeshData, finishOf, type FacadeAssetV1, type FacadeMaterial } from '@app/assets';
import { SELECTION_COLOR } from '@core/viewer/appearance';
import { isBackgroundClick, isDeliberateObjectClick } from '@core/viewer/three/interaction';

/**
 * 3D preview of an imported façade in the Materials dialog (owner 2026-11-17): the model as drawn
 * with the materials being edited (`materials`, one per part), seen from outside (panel frame a →
 * x, b → y up, c → z toward the camera). Click a part to select it (`onSelect(group index)`); the
 * selected part is highlighted. Open parts (not drawn in the Building) show as faint ghosts here so
 * they can still be picked. Orbit to turn, wheel to zoom.
 */
export function FacadeModelPreview({
  asset,
  materials,
  selected,
  onSelect,
}: {
  readonly asset: FacadeAssetV1;
  readonly materials: readonly FacadeMaterial[];
  readonly selected: number | null;
  readonly onSelect: (group: number | null) => void;
}) {
  const geometry = useMemo(() => {
    let mesh;
    try {
      mesh = facadeMeshData(asset);
    } catch {
      return null; // a damaged asset: the list still works, only the preview is missing
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    g.setIndex(new BufferAttribute(mesh.indices, 1));
    asset.groups.forEach((group, i) => g.addGroup(group.start * 3, group.count * 3, i));
    g.computeBoundingSphere();
    return g;
  }, [asset]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  const key = JSON.stringify(materials);
  const meshMaterials = useMemo(
    () =>
      materials.map((m, i) => {
        const finish = finishOf(m);
        const lit = i === selected;
        const ghost = finish === 'open';
        const glass = finish === 'glass';
        return new MeshStandardMaterial({
          color: ghost ? '#9a9a9a' : m.color,
          flatShading: true,
          side: DoubleSide,
          roughness: glass ? 0.1 : 0.8,
          transparent: glass || ghost,
          opacity: ghost ? (lit ? 0.35 : 0.12) : glass ? 0.45 : 1,
          depthWrite: !(glass || ghost),
          wireframe: ghost,
          emissive: lit ? SELECTION_COLOR : '#000000',
          emissiveIntensity: lit ? 0.55 : 0,
        });
      }),
    // `key` stands for `materials` by value: a re-render with equal materials keeps the GPU materials.
    [key, selected], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => () => meshMaterials.forEach((m) => m.dispose()), [meshMaterials]);

  const [w, h, d] = asset.size;
  const centre: [number, number, number] = [w / 2, h / 2, d / 2];
  const radius = Math.max(0.5, Math.hypot(w, h, d) / 2);

  if (!geometry) {
    return (
      <div className="sgl-designer-materials-preview" role="note">
        <p className="sgl-designer-source">The 3D preview is not available for this façade.</p>
      </div>
    );
  }

  return (
    <div className="sgl-designer-materials-preview" aria-label={`3D preview of ${asset.name}: click a part to select it`}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [centre[0] + radius * 0.6, centre[1] + radius * 0.35, centre[2] + radius * 2.4], fov: 40, near: 0.01, far: radius * 20 }}
        onPointerMissed={(e) => {
          if (isBackgroundClick(e)) onSelect(null);
        }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[3, 5, 6]} intensity={1.1} />
        <directionalLight position={[-4, 2, -3]} intensity={0.35} />
        <mesh
          geometry={geometry}
          material={meshMaterials}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            if (!isDeliberateObjectClick(e.delta, e.nativeEvent)) return;
            const index = e.face?.materialIndex;
            if (index !== undefined) onSelect(index);
          }}
        />
        <OrbitControls makeDefault target={centre} enableDamping={false} screenSpacePanning />
      </Canvas>
    </div>
  );
}
