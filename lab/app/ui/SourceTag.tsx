import './ui.css';

/**
 * Small rounded, bordered tag naming where something comes from: `Toolkit: <name>`, `Yours`,
 * `Built-in` (Programme P4). One style everywhere — custom attributes in Attributes and Properties,
 * algorithm sources in Analyse / Transform — through the shared `.sgl-source-tag` class (ui.css).
 */
export function SourceTag({ text, title }: { readonly text: string; readonly title?: string }) {
  return (
    <span className="sgl-source-tag" title={title}>
      {text}
    </span>
  );
}
