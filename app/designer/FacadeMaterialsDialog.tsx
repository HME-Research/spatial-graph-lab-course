import { useEffect, useRef, useState } from 'react';
import { FACADE_FINISHES, FACADE_ROLES, finishOf, materialsFor, withFinish, type FacadeAssetV1, type FacadeFinish, type FacadeMaterial, type FacadeRole } from '@app/assets';
import type { DesignerFacades } from './FacadeLibraryPanel';
import { FacadeModelPreview } from './FacadeModelPreview';

export const FACADE_ROLE_LABELS: Readonly<Record<FacadeRole, string>> = { wall: 'Façade', door: 'Door bay', open: 'Open bay' };
const FINISH_LABELS: Readonly<Record<FacadeFinish, string>> = { solid: 'Solid', glass: 'Glass', open: 'Open' };
const FINISH_HELP: Readonly<Record<FacadeFinish, string>> = {
  solid: 'An opaque surface in this colour',
  glass: 'A translucent pane',
  open: 'Not drawn: an opening (e.g. the doorway of a door-bay module)',
};

/** One use's draft: its materials, or `null` = the same as the façade (Door / Open bay only). */
type Drafts = Record<FacadeRole, FacadeMaterial[] | null>;

/**
 * Materials of an imported façade (owner 2026-11-17): a small modal window listing the model's
 * parts (one per object, or per layer for large models) with a colour and a finish each
 * (Solid / Glass / Open = not drawn). The same model can look different per use: as a façade, as
 * a Door bay or as an Open bay module (tabs); a bay without its own materials uses the façade's.
 * Apply changes the façade for the whole project (every function and scenario using it); Cancel
 * or Escape leaves it unchanged.
 */
export function FacadeMaterialsDialog({
  asset,
  facades,
  onClose,
  role: initialRole = 'wall',
}: {
  readonly asset: FacadeAssetV1;
  readonly facades: DesignerFacades;
  readonly onClose: () => void;
  /** The tab shown first (the use the dialog was opened from). */
  readonly role?: FacadeRole;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [role, setRole] = useState<FacadeRole>(initialRole);
  const [drafts, setDrafts] = useState<Drafts>(() => ({
    wall: [...materialsFor(asset, 'wall')],
    door: asset.bayMaterials?.door ? [...asset.bayMaterials.door] : null,
    open: asset.bayMaterials?.open ? [...asset.bayMaterials.open] : null,
  }));
  const [error, setError] = useState<string | null>(null);
  /** The part selected in the 3D preview or the list (highlighted in both). */
  const [selected, setSelected] = useState<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const select = (group: number | null, scroll: boolean) => {
    setSelected(group);
    if (scroll && group !== null) list.current?.children[group]?.scrollIntoView?.({ block: 'nearest' });
  };

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (typeof el.showModal === 'function' && !el.open) el.showModal();
    else el.setAttribute('open', '');
    return () => {
      if (el.open && typeof el.close === 'function') el.close();
    };
  }, []);

  const own = drafts[role];
  const shown = own ?? drafts.wall!;
  const sameAsFacade = role !== 'wall' && own === null;
  const set = (i: number, patch: { color?: string; finish?: FacadeFinish }) =>
    setDrafts((d) => {
      const list = d[role] ?? d.wall!;
      return { ...d, [role]: list.map((m, k) => (k === i ? withFinish(patch.color ?? m.color, patch.finish ?? finishOf(m)) : m)) };
    });
  const setSame = (same: boolean) => setDrafts((d) => ({ ...d, [role]: same ? null : [...d.wall!] }));

  const apply = () => {
    for (const r of FACADE_ROLES) {
      const outcome = facades.setMaterials(asset.id, drafts[r], r);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
    }
    onClose();
  };

  return (
    <dialog
      ref={dialog}
      className="sgl-designer-materials"
      aria-labelledby={`${asset.id}-materials-title`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <h3 id={`${asset.id}-materials-title`}>Materials · {asset.name}</h3>
      <p className="sgl-help">Each part of the imported model: its colour and Solid, Glass or Open (not drawn). Applies wherever this façade is used in that role.</p>
      <div className="sgl-segmented sgl-segmented-sm sgl-designer-materials-roles" role="radiogroup" aria-label="Used as">
        {FACADE_ROLES.map((r) => (
          <label key={r} className={role === r ? 'checked' : undefined}>
            <input type="radio" name={`${asset.id}-role`} checked={role === r} onChange={() => setRole(r)} />
            {FACADE_ROLE_LABELS[r]}
            {r !== 'wall' && drafts[r] !== null ? ' •' : ''}
          </label>
        ))}
      </div>
      {role !== 'wall' && (
        <label className="sgl-designer-materials-same">
          <input type="checkbox" checked={sameAsFacade} onChange={(e) => setSame(e.currentTarget.checked)} /> Same as Façade
        </label>
      )}
      <FacadeModelPreview asset={asset} materials={shown} selected={selected} onSelect={(g) => select(g, true)} />
      <p className="sgl-designer-source">Click a part in the view (or its name) to select it; drag to turn, wheel to zoom.</p>
      <ul className="sgl-designer-materials-list" ref={list}>
        {asset.groups.map((g, i) => {
          const m = shown[i]!;
          const finish = finishOf(m);
          return (
            <li key={`${g.name}-${i}`} className={selected === i ? 'selected' : undefined} aria-current={selected === i ? 'true' : undefined}>
              <input
                type="color"
                value={m.color}
                disabled={sameAsFacade || finish === 'open'}
                onChange={(e) => set(i, { color: e.currentTarget.value })}
                aria-label={`Colour of ${g.name}`}
              />
              <button
                type="button"
                className="sgl-link sgl-designer-materials-name"
                title={`${g.name}: show in the 3D view`}
                onClick={() => select(selected === i ? null : i, false)}
              >
                {g.name}
              </button>
              <span className="sgl-segmented sgl-segmented-sm" role="radiogroup" aria-label={`${g.name}: solid, glass or open`}>
                {FACADE_FINISHES.map((f) => (
                  <label key={f} className={finish === f ? 'checked' : undefined} title={FINISH_HELP[f]}>
                    <input type="radio" name={`${asset.id}-${role}-finish-${i}`} checked={finish === f} disabled={sameAsFacade} onChange={() => set(i, { finish: f })} />
                    {FINISH_LABELS[f]}
                  </label>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="sgl-designer-error" role="alert">
          {error}
        </p>
      )}
      <div className="sgl-buttons">
        <button type="button" className="primary" onClick={apply}>
          Apply
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
