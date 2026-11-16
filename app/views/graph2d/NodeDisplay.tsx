import { useId } from 'react';
import type { AttributeValue } from '@app/document';
import type { DiagramModel, DiagramNode } from './diagramModel';

/**
 * Display options for the Graph 2D circles and the collapsible "Display" control. View-local UI
 * state (remembered by the hosting panel), never written to the document.
 */
export interface DisplaySettings {
  /** Short display id in the circle (on by default). */
  readonly showId: boolean;
  /** Node type under the id. */
  readonly showType: boolean;
  /** Attribute keys whose values are shown in the circle, in this order. */
  readonly attributeKeys: readonly string[];
  /** Relationship legend. */
  readonly showLegend: boolean;
}

export const DEFAULT_DISPLAY: DisplaySettings = Object.freeze({
  showId: true,
  showType: false,
  attributeKeys: Object.freeze([]) as readonly string[],
  showLegend: true,
});

/** Circle diameter (diagram px) for 0/1 text lines; grows per extra line up to `MAX_NODE_DIAMETER`. */
export const BASE_NODE_DIAMETER = 46;
export const LINE_GROWTH = 14;
export const MAX_NODE_DIAMETER = 88;
/** Text lines that fit inside the largest circle; more are summarised as "+N" (details in the popover). */
export const MAX_NODE_LINES = 3;

export interface NodeLines {
  /** Text lines drawn inside the circle (at most `MAX_NODE_LINES`). */
  readonly lines: readonly string[];
  /** Requested lines that did not fit; shown as "+N" and listed in the popover. */
  readonly hidden: number;
  readonly diameter: number;
}

const MAX_VALUE_CHARS = 10;

export function formatAttributeValue(value: AttributeValue | undefined): string {
  if (value === undefined || value === null) return '–';
  const text = typeof value === 'string' ? value : String(value);
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 1)}…` : text;
}

/**
 * The text a node's circle shows and how big the circle is. Extra information enlarges the circle
 * only within a conservative bound; beyond `MAX_NODE_LINES` it is summarised, never a giant bubble.
 */
export function nodeLines(node: DiagramNode, settings: DisplaySettings): NodeLines {
  const requested: string[] = [];
  if (settings.showId) requested.push(node.label);
  if (settings.showType) requested.push(node.typeId);
  for (const key of settings.attributeKeys) {
    if (key in node.attributes) requested.push(`${key}: ${formatAttributeValue(node.attributes[key])}`);
  }
  const lines = requested.slice(0, MAX_NODE_LINES);
  const hidden = requested.length - lines.length;
  // Since phase 05 (audit m4) only the first line is drawn inside the circle; the others form a
  // caption under it, so the circle keeps its size and text stays readable.
  const diameter = BASE_NODE_DIAMETER;
  return { lines, hidden, diameter };
}

/** Every attribute key used by any node, sorted (choices for the Display control). */
export function attributeKeysOf(model: Pick<DiagramModel, 'nodes'>): readonly string[] {
  const keys = new Set<string>();
  for (const node of model.nodes) for (const key of Object.keys(node.attributes)) keys.add(key);
  return [...keys].sort();
}

/** Settings restored from panel memory, or defaults when absent or malformed (memory is untyped). */
export function sanitizeDisplay(value: unknown): DisplaySettings {
  if (typeof value !== 'object' || value === null) return DEFAULT_DISPLAY;
  const v = value as Partial<Record<keyof DisplaySettings, unknown>>;
  const bool = (x: unknown, fallback: boolean) => (typeof x === 'boolean' ? x : fallback);
  return {
    showId: bool(v.showId, DEFAULT_DISPLAY.showId),
    showType: bool(v.showType, DEFAULT_DISPLAY.showType),
    attributeKeys: Array.isArray(v.attributeKeys) ? v.attributeKeys.filter((k): k is string => typeof k === 'string') : [],
    showLegend: bool(v.showLegend, DEFAULT_DISPLAY.showLegend),
  };
}

export function toggleAttributeKey(settings: DisplaySettings, key: string): DisplaySettings {
  const has = settings.attributeKeys.includes(key);
  return { ...settings, attributeKeys: has ? settings.attributeKeys.filter((k) => k !== key) : [...settings.attributeKeys, key] };
}

/** Collapsible bottom-corner "Display" control. */
export function NodeDisplayControl({
  settings,
  attributeKeys,
  onChange,
}: {
  readonly settings: DisplaySettings;
  readonly attributeKeys: readonly string[];
  readonly onChange: (next: DisplaySettings) => void;
}) {
  const id = useId();
  const check = (key: 'showId' | 'showType' | 'showLegend', label: string) => (
    <label className="sgl-display-row">
      <input type="checkbox" checked={settings[key]} onChange={() => onChange({ ...settings, [key]: !settings[key] })} />
      {label}
    </label>
  );
  return (
    <details className="sgl-display">
      <summary title="Choose what the circles show">Display</summary>
      <div className="sgl-display-body">
        <fieldset>
          <legend>Labels</legend>
          {check('showId', 'Node ID')}
          {check('showType', 'Type')}
          {check('showLegend', 'Legend')}
        </fieldset>
        <fieldset aria-describedby={`${id}-attr`}>
          <legend>Attributes</legend>
          {attributeKeys.length === 0 ? (
            <span id={`${id}-attr`} className="sgl-muted">
              No attributes in this design.
            </span>
          ) : (
            <>
              <span id={`${id}-attr`} className="sgl-muted">
                Up to {MAX_NODE_LINES} lines fit in a circle; the rest show as “+N”.
              </span>
              {attributeKeys.map((key) => (
                <label key={key} className="sgl-display-row">
                  <input
                    type="checkbox"
                    checked={settings.attributeKeys.includes(key)}
                    onChange={() => onChange(toggleAttributeKey(settings, key))}
                  />
                  <code>{key}</code>
                </label>
              ))}
            </>
          )}
        </fieldset>
      </div>
    </details>
  );
}
