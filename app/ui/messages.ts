import { formatIssuePath, type GraphIssue } from '@app/document';

/**
 * Turns validation/command issues into beginner-facing messages: the message first, in plain
 * language ("This node overlaps node 03"), with the original path, code and text kept as
 * optional technical details. Pure; the original issue text is never lost.
 */

export interface FriendlyMessage {
  /** Plain-language sentence for students. */
  readonly text: string;
  /** Path, code and the validator's original message. */
  readonly technical: string;
}

export interface MessageContext {
  /** Short label for a room id as written in an issue message; defaults to the id (the id is the label). */
  readonly roomLabel?: (nodeId: string) => string;
  /** Short label for a relationship id as written in an issue message (e.g. "3 → 7"); defaults to the id. */
  readonly relationshipLabel?: (edgeId: string) => string;
  /** The room being edited: "this room" instead of its label. */
  readonly subjectNodeId?: string;
  /** Id of the node at `nodes[index]` of the document the issue refers to. */
  readonly nodeIdAt?: (index: number) => string | undefined;
}

const quoted = (text: string): string[] => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

const capitalise = (text: string): string => (text === '' ? text : text[0]!.toUpperCase() + text.slice(1));

const sentence = (text: string): string => {
  const t = capitalise(text.trim());
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/** "node 03", "nodes 03 and 05", "nodes 03, 05 and 07". */
export function roomList(labels: readonly string[]): string {
  if (labels.length <= 1) return `node ${labels[0] ?? ''}`.trim();
  return `nodes ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export function technicalText(issue: GraphIssue): string {
  const path = formatIssuePath(issue.path);
  return `${path === '' ? '(document)' : path} · ${issue.code} · ${issue.message}`;
}

/** Plain-language text for one issue. Unknown codes fall back to the validator's own sentence. */
export function friendlyText(issue: GraphIssue, context: MessageContext = {}): string {
  const room = context.roomLabel ?? ((id: string) => id);
  const relationship = context.relationshipLabel ?? ((id: string) => id);
  const names = quoted(issue.message);
  const other = (ids: readonly string[]) => ids.filter((id) => id !== context.subjectNodeId);

  switch (issue.code) {
    case 'room-overlap': {
      // `room "a" overlaps room "b" at cell [x, y, z]`: either room may be the edited one.
      const others = other(names);
      if (context.subjectNodeId !== undefined && others.length < names.length && others.length > 0) {
        return `This node overlaps ${roomList(others.map(room))}. Nodes cannot share cells.`;
      }
      return names.length >= 2
        ? `Node ${room(names[0]!)} overlaps node ${room(names[1]!)}. Nodes cannot share cells.`
        : 'Two nodes overlap. Nodes cannot share cells.';
    }
    case 'invalid-edge-geometry': {
      // `"door" edge "e" requires <requirement>; "a" [..] and "b" [..] are not`
      const requirement = /requires (.+?);/.exec(issue.message)?.[1];
      const edgeId = names[1];
      const [a, b] = [names[2], names[3]];
      const who = a !== undefined && b !== undefined ? `nodes ${room(a)} and ${room(b)}` : 'the nodes';
      return (
        `The ${names[0] ?? ''} edge${edgeId !== undefined ? ` ${relationship(edgeId)}` : ''} needs ${requirement ?? 'touching cells'}, ` +
        `and ${who} would not be. Keep the nodes touching, or delete the edge first.`
      ).replace(/ {2,}/g, ' ');
    }
    case 'route-displacement':
      return names.length > 0
        ? `This would block the generated corridor of ${names.length === 1 ? 'edge' : 'edges'} ${names.map(relationship).join(', ')}.`
        : 'This would block a generated corridor.';
    case 'duplicate-relationship':
      return 'These two nodes are already connected. Edit the existing edge instead.';
    case 'self-edge':
      return 'A node cannot be connected to itself.';
    case 'dangling-edge':
      return 'An edge refers to a node that does not exist.';
    case 'not-found':
      return 'That item no longer exists. It may have been deleted or undone.';
    case 'coordinate-out-of-range':
      return sentence(`${issue.message}. Choose a position closer to the origin`);
    case 'too-many-cells':
    case 'too-many-nodes':
      return sentence(`The design is too large: ${issue.message}`);
    case 'duplicate-node-id':
      return 'Another node already has that id.';
    case 'duplicate-edge-id':
      return 'Another edge already has that id.';
    case 'unknown-node-type':
      return names[0] !== undefined ? `The Function ${names[0]} is not known.` : 'The Function is not known.';
    default:
      return sentence(issue.message);
  }
}

export function friendlyMessage(issue: GraphIssue, context: MessageContext = {}): FriendlyMessage {
  return { text: friendlyText(issue, context), technical: technicalText(issue) };
}

/** Distinct messages for a list of issues (validators can report one problem from both sides). */
export function friendlyMessages(issues: readonly GraphIssue[], context: MessageContext = {}): FriendlyMessage[] {
  const seen = new Set<string>();
  const out: FriendlyMessage[] = [];
  for (const issue of issues) {
    const message = friendlyMessage(issue, context);
    if (seen.has(message.text)) {
      const existing = out.findIndex((m) => m.text === message.text);
      out[existing] = { text: message.text, technical: `${out[existing]!.technical}\n${message.technical}` };
      continue;
    }
    seen.add(message.text);
    out.push(message);
  }
  return out;
}
