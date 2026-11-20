import type { GuidePromptGuide } from '../guideContracts';

/**
 * How a student structures the prompt sent with an AI kit (owner 2026-11-20): it is not a file in
 * the kit; the AI kit tabs show it under each download, with a starting text to copy. One guide per
 * kit (graph, design for any project, design for this project). The parts match what each kit's
 * `PROMPT.md` tells the assistant to read: the idea, the input (which decides the section) and how
 * the answer shows.
 */

const IDEA = { label: '2. Idea', text: 'what it should find, in plain words: rooms, relationships, neighbours, steps, areas, levels…' };
const INPUT = {
  label: '3. Input',
  text: 'what you select before it runs: nothing (the whole design), one room, one relationship, or a mix such as two rooms or a room and a number. This decides where it appears in Analyse.',
};
const ANSWER = { label: '4. Answer', text: 'how it should show: a number, one line of text, rooms or relationships lit up, or a colour per room.' };
const BLANKS = ['', 'My idea: ___', 'Input: ___', 'Show the answer as: ___'];
const REFUSED = 'If the app refuses the file, paste its message back to the assistant and ask it to fix exactly that.';

/** Graph kit (Any project, room basics off): ids and relationships only. */
export const GRAPH_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit and write one graph analysis (the first line below).' }, IDEA, INPUT, ANSWER],
  text: ["I've attached the Spatial Graph Lab graph kit. Read PROMPT.md and every file in it, then write ONE graph analysis that follows it exactly.", ...BLANKS].join('\n'),
  tips: [
    'Example: “The rooms that are neighbours of both rooms I select.” · Input: two rooms · Show: light them up and count them.',
    'A graph analysis sees only room ids and relationships: no Functions, sizes or positions. For those, tick Include room basics.',
    REFUSED,
  ],
};

/** Design kit (Any project, room basics on): Function as a label, positions, sizes, calculated values. */
export const DESIGN_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit and write one design analysis that works in any project (the first line below).' }, IDEA, INPUT, ANSWER],
  text: [
    "I've attached the Spatial Graph Lab design kit. Read PROMPT.md and every file in it, then write ONE design analysis that works in any project (room basics only, no custom fields).",
    ...BLANKS,
  ].join('\n'),
  tips: [
    'Example: “The largest room on each level.” · Input: nothing · Show: light them up and colour every room by its area.',
    'It can read each room’s Function, size, position and level, the relationship type and calculated values such as area, but not custom fields such as a target area. For those, use This project.',
    REFUSED,
  ],
};

/** Design kit for this project (with PROJECT.md): may also use the project's Functions and custom fields. */
export const PROJECT_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit, including PROJECT.md, and write one design analysis (the first line below).' }, IDEA, INPUT, ANSWER],
  text: [
    "I've attached the Spatial Graph Lab design kit for my project. Read PROMPT.md, PROJECT.md and every file in it, then write ONE design analysis that follows them exactly. It may use my project's Functions and custom fields; list the ones it uses in uses.",
    ...BLANKS,
  ].join('\n'),
  tips: [
    'Example: “Bedrooms smaller than their target area.” · Input: nothing · Show: light them up and count them.',
    'Name Functions and fields as PROJECT.md lists them. The analysis then works only in projects that have them; Analyse tags it This project.',
    REFUSED,
  ],
};
