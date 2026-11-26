import type { GuidePromptGuide } from '../guideContracts';

/**
 * How a student structures the prompt sent with an AI kit (owner 2026-11-20): it is not a file in
 * the kit; the AI kit tabs show it under each download, with a starting text to copy. One guide per
 * kit (graph, design for any project, design for this project). The parts match what each kit's
 * `PROMPT.md` tells the assistant to read: the idea, the input (which decides the section) and how
 * the answer shows.
 */

const IDEA = { label: '2. Idea', text: 'what it should find, in plain words: nodes, edges, neighbours, steps, areas, levels…' };
const INPUT = {
  label: '3. Input',
  text: 'what you select before it runs: nothing (the whole design), one node, one edge, or a mix such as two nodes or a node and a number. This decides where it appears in Analyse.',
};
const ANSWER = { label: '4. Answer', text: 'how it should show: a number, one line of text, nodes or edges lit up, or a colour per node.' };
const BLANKS = ['', 'My idea: ___', 'Input: ___', 'Show the answer as: ___'];
const REFUSED = 'If the app refuses the file, paste its message back to the assistant and ask it to fix exactly that.';

/** Graph kit (Any project, room basics off): ids and relationships only. */
export const GRAPH_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit and write one graph analysis (the first line below).' }, IDEA, INPUT, ANSWER],
  text: ["I've attached the Spatial Graph Lab graph kit. Read PROMPT.md and every file in it, then write ONE graph analysis that follows it exactly.", ...BLANKS].join('\n'),
  tips: [
    'Example: “The nodes that are neighbours of both nodes I select.” · Input: two nodes · Show: light them up and count them.',
    'A graph analysis sees only node ids and edges: no Functions, sizes or positions. For those, tick Include node basics.',
    REFUSED,
  ],
};

/** Design kit (Any project, room basics on): Function as a label, positions, sizes, calculated values. */
export const DESIGN_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit and write one design analysis that works in any project (the first line below).' }, IDEA, INPUT, ANSWER],
  text: [
    "I've attached the Spatial Graph Lab design kit. Read PROMPT.md and every file in it, then write ONE design analysis that works in any project (node basics only, no custom fields).",
    ...BLANKS,
  ].join('\n'),
  tips: [
    'Example: “The largest room on each level.” · Input: nothing · Show: light them up and colour every room by its area.',
    'It can read each node’s Function, size, position and level, each edge’s Relationship (Access or Open) and calculated values such as area, but not custom fields such as a target area. For those, use This project.',
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

// ── Transform kits (2026-11-25) ─────────────────────────────────────────────────────────────
// The parts match what lab/docs/ai-kit/transform/PROMPT.md tells the assistant to read: the idea,
// the parameters the student sets before it runs, and what it should change. The starting texts are
// also in tutorial/transform.html, word for word (tutorial.test.ts).

const TRANSFORM_PARTS = [
  { label: '2. Idea', text: 'what the transform should do to your design, in plain words: connect, grow, add, move, set a value…' },
  { label: '3. Parameters', text: 'what you want to set in Transform before it runs, e.g. a number of cells, Access or Open, a Function. Write “none” if there is nothing to set.' },
  {
    label: '4. Changes',
    text: 'what it may change: add nodes, add edges (Access or Open), move or resize nodes, set a node’s or an edge’s value. Nothing changes until you Apply the preview.',
  },
] as const;
const TRANSFORM_BLANKS = ['', 'My idea: ___', 'Parameters I want to set: ___', 'What it should change: ___'];
const TRANSFORM_REFUSED = 'If the app refuses the file, or the preview shows an error, paste the message back to the assistant and ask it to fix exactly that.';

/** Transform kit (Any project): node basics, calculated values, Functions found in the design. */
export const TRANSFORM_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit and write one transform that works in any project (the first line below).' }, ...TRANSFORM_PARTS],
  text: [
    "I've attached the Spatial Graph Lab transform kit. Read PROMPT.md and every file in it, then write ONE transform that works in any project (node basics only, no custom fields).",
    ...TRANSFORM_BLANKS,
  ].join('\n'),
  tips: [
    'Example: “Connect every two nodes that touch but have no edge yet.” · Parameters: Access or Open · Changes: add edges.',
    'It can read each node’s Function, size, position and level, each edge’s Relationship and calculated values such as area, but not custom fields such as a target area. For those, use This project.',
    TRANSFORM_REFUSED,
  ],
};

/** Transform kit for this project (with PROJECT.md): may also use the project's Functions and custom fields. */
export const TRANSFORM_PROJECT_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit, including PROJECT.md, and write one transform (the first line below).' }, ...TRANSFORM_PARTS],
  text: [
    "I've attached the Spatial Graph Lab transform kit for my project. Read PROMPT.md, PROJECT.md and every file in it, then write ONE transform that follows them exactly. It may use my project's Functions and custom fields as PROJECT.md lists them.",
    ...TRANSFORM_BLANKS,
  ].join('\n'),
  tips: [
    'Example: “Give the rooms furthest below their target area the first priority.” · Parameters: none · Changes: set each room’s priority.',
    'Name Functions and fields as PROJECT.md lists them. The transform then works only in projects that have them.',
    TRANSFORM_REFUSED,
  ],
};

// ── Toolkit kit (2026-11-24) ────────────────────────────────────────────────────────────────
// The starting texts and the git commands are also in lab/docs/TOOLKITS.md, word for word (between
// `<!-- prompt:agent -->`, `<!-- prompt:chat -->`, `<!-- commands:chat -->` markers;
// toolkitKit.test.ts keeps them identical).

const TOOLKIT_BLANKS = ['', 'Toolkit id: ___', 'My idea: ___', 'Functions (and their attributes): ___', 'Algorithms: ___', 'Example design: ___'];
const TOOLKIT_PARTS = [
  { label: '2. Toolkit id', text: 'the folder name: lowercase letters, digits and -, starting with a letter. Add your initials so it is unique in the class, e.g. hk-library.' },
  { label: '3. Idea', text: 'what the toolkit is for, in one or two sentences: a building type, a design question.' },
  { label: '4. Functions', text: 'the node programmes you need (start with 3–6), and what each should record, e.g. Reading room with a number of seats.' },
  { label: '5. Algorithms', text: 'what to analyse (it reads and shows) or transform (it proposes changes you preview and Apply). Start with one or two.' },
  { label: '6. Example design', text: 'a small design that uses your Functions; the checks run every algorithm on it.' },
] as const;
const TOOLKIT_EXAMPLE = 'Example: “Small libraries: reading rooms, stacks and circulation. Reading rooms record their seats; an analysis counts the seats a node can reach; a transform grows reading rooms towards daylight.”';

/** Route A: a coding agent inside the repository (e.g. Claude Code in VS Code). */
export const TOOLKIT_AGENT_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Ask', text: 'tell the agent to read the guide and the kit instructions in the repository and work only in your folder, on your branch (the first line below).' }, ...TOOLKIT_PARTS],
  text: [
    'Read lab/docs/TOOLKITS.md and lab/docs/ai-kit/toolkit/PROMPT.md in this repository, then create my toolkit following them exactly. Work only inside toolkits/<toolkit-id>/ on my branch toolkit/<toolkit-id>, run the checks, and commit only my folder. Do not push: I will push.',
    ...TOOLKIT_BLANKS,
  ].join('\n'),
  tips: [TOOLKIT_EXAMPLE, 'In Claude Code you can also type /create-toolkit and answer its questions.', 'Read what it wrote, try it in the app, and ask for changes in plain words.'],
};

/** Route B: a chat assistant with the toolkit kit attached (e.g. Claude in the browser). */
export const TOOLKIT_CHAT_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit and give you the folder as a zip (the first line below).' }, ...TOOLKIT_PARTS],
  text: [
    "I've attached the Spatial Graph Lab toolkit kit. Read PROMPT.md and every file in it, then write my toolkit following it exactly. Give me the folder <toolkit-id>/ as a zip; if you cannot make files, give every file in its own code block, headed by its path.",
    ...TOOLKIT_BLANKS,
  ].join('\n'),
  tips: [TOOLKIT_EXAMPLE, 'If a check or the app shows an error, paste the whole message back into the chat and ask it to fix exactly that.'],
};

/** Route B: put the folder in the repository, check it and push the branch (never main). */
export const TOOLKIT_CHAT_COMMANDS: string = [
  'git switch main',
  'git pull',
  'git switch -c toolkit/<toolkit-id>',
  '# unzip: the folder must end up at toolkits/<toolkit-id>/ (toolkit.ts directly inside it)',
  'npm install',
  'npm run check:toolkit -- -t <toolkit-id>',
  'npm run typecheck',
  'npm run dev',
  '# try it at http://localhost:5173/?toolkit=<toolkit-id>, then stop the server (Ctrl+C)',
  'git add toolkits/<toolkit-id>',
  'git status',
  'git commit -m "feat(<toolkit-id>): first version of my toolkit"',
  'git push -u origin toolkit/<toolkit-id>',
].join('\n');
