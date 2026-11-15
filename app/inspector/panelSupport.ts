import { useState } from 'react';
import type { DesignDocument, GraphCommand, GraphIssue } from '@app/document';
import type { DesignCommand, DesignPort } from '@app/spatial';
import type { GraphCommandHandler, SelectionHandler } from '@app/views/contracts';
import type { ProjectViewContext } from '@app/views/project';
import type { MessageContext } from '@app/ui';
import { relationshipLabelIn, roomLabelIn } from './propertiesModel';

/**
 * Commands the Properties panel sends in both schema versions. Their shapes are identical in v1
 * `GraphCommand` and v2 `DesignCommand`; `toDesignCommand` fails to compile if that changes.
 */
export type SharedCommand = Extract<
  GraphCommand,
  { readonly type: 'set-node-type' | 'set-node-attributes' | 'remove-node' | 'remove-edge' }
>;
const toDesignCommand = (command: SharedCommand): DesignCommand => command;

/** What every Properties sub-panel receives. */
export interface PanelProps {
  /** The v1 document (always present at the baseline). */
  readonly doc: DesignDocument;
  /** Schema-v2 port; present only after integration. Feature gate for v2-only controls. */
  readonly design: DesignPort | undefined;
  readonly project: ProjectViewContext | undefined;
  readonly onSelect: SelectionHandler;
  readonly onCommand: GraphCommandHandler;
}

/**
 * Sends commands and keeps the last refusal for display. A refused command leaves the document
 * unchanged; a successful one clears old messages. With the v2 port present, every command goes
 * to `design.onCommand` (the v1 handler is not used for the same document).
 */
export function useCommands({ design, onCommand }: PanelProps) {
  const [issues, setIssues] = useState<readonly GraphIssue[]>([]);
  const settle = (outcome: { readonly ok: true } | { readonly ok: false; readonly issues: readonly GraphIssue[] }): boolean => {
    setIssues(outcome.ok ? [] : outcome.issues);
    return outcome.ok;
  };
  return {
    issues,
    showIssues: setIssues,
    clearIssues: () => setIssues([]),
    /** set-node-type / set-node-attributes / remove-node / remove-edge, in either schema. */
    runShared: (command: SharedCommand): boolean =>
      settle(design ? design.onCommand(toDesignCommand(command)) : onCommand(command)),
    /** A v1-only command (only used when `design` is absent). */
    runV1: (command: GraphCommand): boolean => settle(onCommand(command)),
    /** A v2-only command (only used when `design` is present). */
    runV2: (command: DesignCommand): boolean =>
      settle(design ? design.onCommand(command) : { ok: false, issues: [{ path: [], code: 'not-found', message: 'schema v2 editing is not available' }] }),
  };
}

/** Labels for messages: v2 display ids ("01"), or plain ids for v1. */
export function messageContextFor({ doc, design }: PanelProps, subjectNodeId?: string): MessageContext {
  const base: MessageContext = design
    ? {
        roomLabel: roomLabelIn(design.doc),
        relationshipLabel: relationshipLabelIn(design.doc),
        nodeIdAt: (i) => design.doc.nodes[i]?.id,
      }
    : {
        relationshipLabel: (id) => {
          const e = doc.edges.find((x) => x.id === id);
          return e ? `${e.source} ↔ ${e.target}` : id;
        },
        nodeIdAt: (i) => doc.nodes[i]?.id,
      };
  return subjectNodeId === undefined ? base : { ...base, subjectNodeId };
}
