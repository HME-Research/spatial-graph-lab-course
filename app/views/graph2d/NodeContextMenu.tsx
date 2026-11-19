import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { RELATIONSHIP_KINDS, type RelationshipKind } from '@app/document';
import type { DiagramModel } from './diagramModel';
import { placeAtPoint, useDismiss, usePlacement } from './NodePopover';
import { RELATIONSHIP_KIND_LABELS } from './edgePresentation';

/**
 * Context menu for nodes, edges and the empty canvas. Every item only dispatches an action the
 * view already offers elsewhere (toolbar, popover, keyboard); nothing bypasses the command path.
 */

export type MenuTarget =
  | { readonly kind: 'node'; readonly id: number }
  | { readonly kind: 'edge'; readonly id: number }
  | { readonly kind: 'pane' };

export type MenuAction =
  | { readonly type: 'inspect'; readonly nodeId: number }
  | { readonly type: 'connect'; readonly nodeId: number }
  | { readonly type: 'add-node'; readonly nearNodeId?: number }
  | { readonly type: 'remove-node'; readonly nodeId: number }
  | { readonly type: 'remove-edge'; readonly edgeId: number }
  | { readonly type: 'set-relationship-kind'; readonly edgeId: number; readonly kind: RelationshipKind }
  /** Open the "Remove invalid connections" review (or explain that there is nothing to remove). */
  | { readonly type: 'remove-invalid' };

export interface MenuItem {
  readonly label: string;
  readonly action: MenuAction;
  readonly disabled?: boolean;
  readonly title?: string;
  /** Visual separator before this item. */
  readonly separated?: boolean;
}

/** Items for a target, or [] when it no longer exists. Pure. */
export function menuItems(model: DiagramModel, target: MenuTarget): readonly MenuItem[] {
  if (target.kind === 'pane') {
    const add: MenuItem = { label: 'Add node here', action: { type: 'add-node' } };
    const invalid = model.edges.filter((e) => e.resolution?.status === 'unresolved').length;
    return [
      add,
      {
        label: invalid > 0 ? `Remove invalid connections (${invalid})…` : 'Remove invalid connections…',
        action: { type: 'remove-invalid' },
        separated: true,
        title: invalid > 0 ? 'Review the relationships that cannot be built' : 'There are no invalid connections',
      },
    ];
  }
  if (target.kind === 'node') {
    const node = model.byNode.get(target.id);
    if (!node) return [];
    return [
      { label: 'Inspect', action: { type: 'inspect', nodeId: node.id } },
      { label: 'Add connection…', action: { type: 'connect', nodeId: node.id }, title: 'Then click the node to connect to' },
      { label: 'Add node next to it', action: { type: 'add-node', nearNodeId: node.id } },
      { label: 'Delete node', action: { type: 'remove-node', nodeId: node.id }, separated: true, title: 'Also deletes its relationships' },
    ];
  }
  const edge = model.edges.find((e) => e.id === target.id);
  if (!edge) return [];
  const kindItems: MenuItem[] = [];
  for (const kind of RELATIONSHIP_KINDS) {
    kindItems.push({
      label: `${edge.kind === kind ? '✓ ' : ''}${RELATIONSHIP_KIND_LABELS[kind]}`,
      action: { type: 'set-relationship-kind', edgeId: edge.id, kind },
      disabled: edge.kind === kind,
    });
  }
  return [...kindItems, { label: 'Delete relationship', action: { type: 'remove-edge', edgeId: edge.id }, separated: true }];
}

export function NodeContextMenu({
  items,
  point,
  containerRef,
  label,
  onAction,
  onClose,
}: {
  readonly items: readonly MenuItem[];
  /** Opening point in container pixels. */
  readonly point: { readonly x: number; readonly y: number };
  readonly containerRef: RefObject<HTMLElement | null>;
  readonly label: string;
  readonly onAction: (action: MenuAction) => void;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  const style = usePlacement(ref, containerRef, (size, container) => placeAtPoint(point, size, container), [point.x, point.y, items]);

  // Keyboard users land on the first enabled item. Deferred one frame: the pointer press that
  // opened the menu focuses the node afterwards.
  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    if (buttons.length === 0) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div ref={ref} className="sgl-menu nodrag nopan" style={style} role="menu" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          className={item.separated ? 'sgl-menu-separated' : undefined}
          disabled={item.disabled}
          title={item.title}
          onClick={() => {
            onClose();
            onAction(item.action);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
