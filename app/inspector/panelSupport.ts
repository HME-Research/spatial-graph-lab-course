import { useState } from 'react';
import type { GraphIssue } from '@app/document';
import type { DesignCommand, DesignPort } from '@app/spatial';
import type { SelectionHandler } from '@app/views/contracts';
import type { ProjectViewContext } from '@app/views/project';
import type { MessageContext } from '@app/ui';
import { relationshipLabelIn } from './propertiesModel';

/** Commands the Properties panel sends for any room or relationship. */
export type SharedCommand = Extract<DesignCommand, { readonly type: 'set-node-type' | 'set-node-attributes' | 'remove-node' | 'remove-edge' }>;

/** What every Properties sub-panel receives. */
export interface PanelProps {
  /** The live design port: the document and the only command path. */
  readonly design: DesignPort;
  readonly project: ProjectViewContext | undefined;
  readonly onSelect: SelectionHandler;
}

/**
 * Sends commands through `design.onCommand` and keeps the last refusal for display. A refused
 * command leaves the document unchanged; a successful one clears old messages.
 */
export function useCommands({ design }: PanelProps) {
  const [issues, setIssues] = useState<readonly GraphIssue[]>([]);
  const settle = (outcome: { readonly ok: true } | { readonly ok: false; readonly issues: readonly GraphIssue[] }): boolean => {
    setIssues(outcome.ok ? [] : outcome.issues);
    return outcome.ok;
  };
  return {
    issues,
    showIssues: setIssues,
    clearIssues: () => setIssues([]),
    /** set-node-type / set-node-attributes / remove-node / remove-edge. */
    runShared: (command: SharedCommand): boolean => settle(design.onCommand(command)),
    /** Any other design command. */
    runV2: (command: DesignCommand): boolean => settle(design.onCommand(command)),
  };
}

/** Labels for messages: the rooms' display labels. */
export function messageContextFor({ design }: PanelProps, subjectNodeId?: number): MessageContext {
  const base: MessageContext = {
    // Issue messages name ids as text; the id is the room's label.
    relationshipLabel: (id) => relationshipLabelIn(design.doc)(Number(id)),
    nodeIdAt: (i) => (design.doc.nodes[i] === undefined ? undefined : String(design.doc.nodes[i]!.id)),
  };
  return subjectNodeId === undefined ? base : { ...base, subjectNodeId: String(subjectNodeId) };
}
