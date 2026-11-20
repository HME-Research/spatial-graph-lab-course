import type { GuidePromptGuide } from '../guideContracts';

/**
 * How a student structures the prompt they send with the AI kit (owner 2026-11-20: the prompt is
 * no longer a file in the zip; the ⓘ of "Upload your own (.ts)" and the Guide entry show it, with
 * a starting text to copy). The parts match what `docs/ai-kit/PROMPT.md` tells the assistant to
 * read from the student's message: the idea, what they pick (which decides the section), and how
 * the answer shows.
 */
export const AI_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [
    { label: '1. Ask', text: 'tell the assistant to read the kit and write one analysis (copy the first line below).' },
    { label: '2. Idea', text: 'what it should find, in graph words: rooms, relationships, neighbours, steps.' },
    { label: '3. Pick', text: 'nothing (the whole graph), one room, one relationship, or a mix such as two rooms or a room and a number. This decides where it appears in Analyse.' },
    { label: '4. Answer', text: 'how it should show: a number, one line of text, rooms or relationships lit up, or a colour per room.' },
  ],
  text: [
    "I've attached the Spatial Graph Lab AI kit. Read PROMPT.md and every file in it, then write ONE graph analysis that follows it exactly.",
    '',
    'My idea: ___',
    'I will pick: ___',
    'Show the answer as: ___',
  ].join('\n'),
  tips: [
    'Example: “The rooms that are neighbours of both rooms I pick.” · I will pick: two rooms · Show: light them up and count them.',
    'One idea per chat. An analysis sees only room ids and relationships, so do not ask about functions, sizes or positions.',
    'If the app refuses the file, paste its message back to the assistant and ask it to fix exactly that.',
  ],
};
