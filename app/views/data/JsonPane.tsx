import { memo, useEffect, useMemo, useRef, type CSSProperties, type MouseEvent } from 'react';
import type { Emphasis, Selection, SelectionHandler } from '@core/viewer/selection';
import type { ViewProps } from '../contracts';
import { jsonBlocks, jsonLines, type JsonBlock } from './dataModel';
import { recordEmphasis, revealIn, selectionOf, type RowEmphasis } from './dataSelection';

/**
 * The design as JSON text, exactly as saved (Programme P4, worktree D). Read-only by design, also
 * now that the table edits (worktree G): this pane has no editor and never sends a command;
 * clicking a record only selects it.
 */

const KEY_LINE = /^(\s*)("(?:[^"\\]|\\.)*")(: ?)(.*)$/;

export function JsonPane({
  design,
  emphasis,
  selection,
  onSelect,
}: {
  readonly design: ViewProps['design'];
  readonly emphasis: Emphasis;
  readonly selection: Selection;
  readonly onSelect: SelectionHandler;
}) {
  const lines = useMemo(() => jsonLines(design.doc), [design.doc]);
  const blocks = useMemo(() => jsonBlocks(lines), [lines]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scroller.current;
    if (!container || selection.kind === 'none') return;
    const el = container.querySelector<HTMLElement>(`[data-record="${selection.kind === 'node' ? 'nodes' : 'edges'}:${selection.id}"]`);
    if (el) revealIn(container, el, 0, true);
  }, [selection, blocks]);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-record]');
    if (!el) return;
    const [collection, id] = el.dataset.record!.split(':') as ['nodes' | 'edges', string];
    onSelect(selectionOf(collection, Number(id)));
  };

  return (
    <div
      ref={scroller}
      className="sgl-dataview-scroll sgl-dataview-json"
      role="region"
      aria-label="Design as JSON, as saved"
      tabIndex={0}
      onClick={onClick}
      style={{ '--sgl-dataview-ln': `${String(lines.length).length}ch` } as CSSProperties}
    >
      <p className="sgl-dataview-note">Calculated values are not saved; see them in the table.</p>
      <div className="sgl-dataview-code">
        {blocks.map((b) => (
          <JsonBlockView key={b.key} block={b} emphasis={b.record ? recordEmphasis(emphasis, b.record) : null} />
        ))}
      </div>
    </div>
  );
}

const JsonBlockView = memo(function JsonBlockView({ block, emphasis }: { readonly block: JsonBlock; readonly emphasis: RowEmphasis }) {
  const lines = block.lines.map((l) => {
    const m = KEY_LINE.exec(l.text);
    return (
      <div key={l.number} className="sgl-dataview-line" data-section={l.section ?? undefined}>
        <span className="sgl-dataview-mark" aria-hidden="true" />
        <span className="sgl-dataview-ln" aria-hidden="true">
          {l.number}
        </span>
        <span className="sgl-dataview-text">
          {m ? (
            <>
              {m[1]}
              <span className="sgl-dataview-key-name">{m[2]}</span>
              {m[3]}
              {m[4]}
            </>
          ) : (
            l.text
          )}
        </span>
      </div>
    );
  });
  if (!block.record) return <>{lines}</>;
  const label = `${block.record.collection === 'nodes' ? 'Node' : 'Edge'} ${block.record.id}`;
  return (
    <div className="sgl-dataview-record" data-record={`${block.record.collection}:${block.record.id}`} data-emphasis={emphasis ?? undefined} title={`${label}: click to select`}>
      {lines}
    </div>
  );
});
