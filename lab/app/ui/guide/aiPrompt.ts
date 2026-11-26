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
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit, ask you its questions, then write one graph analysis (the first line below).' }, IDEA, INPUT, ANSWER],
  text: ["I've attached the Spatial Graph Lab graph kit. Read PROMPT.md and every file in it first, then ask me your clarifying questions before you write any code. After my answers, write ONE graph analysis that follows it exactly.", ...BLANKS].join('\n'),
  tips: [
    'Example: “The nodes that are neighbours of both nodes I select.” · Input: two nodes · Show: light them up and count them.',
    'A graph analysis sees only node ids and edges: no Functions, sizes or positions. For those, tick Include node basics.',
    REFUSED,
  ],
};

/** Design kit (Any project, room basics on): Function as a label, positions, sizes, calculated values. */
export const DESIGN_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit, ask you its questions, then write one design analysis that works in any project (the first line below).' }, IDEA, INPUT, ANSWER],
  text: [
    "I've attached the Spatial Graph Lab design kit. Read PROMPT.md and every file in it first, then ask me your clarifying questions before you write any code. After my answers, write ONE design analysis that works in any project (node basics only, no custom fields).",
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
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit, including PROJECT.md, ask you its questions, then write one design analysis (the first line below).' }, IDEA, INPUT, ANSWER],
  text: [
    "I've attached the Spatial Graph Lab design kit for my project. Read PROMPT.md, PROJECT.md and every file in it first, then ask me your clarifying questions before you write any code. After my answers, write ONE design analysis that follows them exactly. It may use my project's Functions and custom fields; list the ones it uses in uses.",
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
// also in tutorial/05-your-own-transform.html, word for word (tutorial.test.ts).

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
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit, ask you its questions, then write one transform that works in any project (the first line below).' }, ...TRANSFORM_PARTS],
  text: [
    "I've attached the Spatial Graph Lab transform kit. Read PROMPT.md and every file in it first, then ask me your clarifying questions before you write any code. After my answers, write ONE transform that works in any project (node basics only, no custom fields).",
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
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit, including PROJECT.md, ask you its questions, then write one transform (the first line below).' }, ...TRANSFORM_PARTS],
  text: [
    "I've attached the Spatial Graph Lab transform kit for my project. Read PROMPT.md, PROJECT.md and every file in it first, then ask me your clarifying questions before you write any code. After my answers, write ONE transform that follows them exactly. It may use my project's Functions and custom fields as PROJECT.md lists them.",
    ...TRANSFORM_BLANKS,
  ].join('\n'),
  tips: [
    'Example: “Set Number of beds to 2 for every Bedroom larger than 12 m².” · Parameters: none · Changes: set each such Bedroom’s Number of beds.',
    'Name Functions and fields as PROJECT.md lists them. The transform then works only in projects that have them.',
    TRANSFORM_REFUSED,
  ],
};

// ── Toolkit kit (2026-11-24) ────────────────────────────────────────────────────────────────
// The starting texts and the git commands are also in lab/docs/TOOLKITS.md, word for word (between
// `<!-- prompt:agent -->`, `<!-- prompt:chat -->`, `<!-- commands:chat -->`, `<!-- prompt:browser -->` markers;
// toolkitKit.test.ts keeps them identical).

const TOOLKIT_BLANKS = ['', 'Toolkit name: ___', 'My idea: ___', 'Functions (and their attributes): ___', 'Algorithms: ___'];
/**
 * Designs are the student's job (owner 2026-11-26): every toolkit prompt asks for designs/ with only a short
 * README.md (a zip or a git commit cannot carry an empty folder) and no defaultDesign. The student draws
 * designs in the app and adds them later (tutorial: Add your own design).
 */
const TOOLKIT_NO_DESIGNS =
  'Do not write any design: make the folder designs/ with only a short README.md that says how to add a design, and do not set defaultDesign in toolkit.ts. I will draw my designs in the app.';
const TOOLKIT_DESIGNS_TIP = 'Designs are yours: the AI leaves designs/ with only a README. Draw a design in the app with your toolkit, then add it to designs/ (tutorial: Add your own design).';
const TOOLKIT_PARTS = [
  { label: '2. Toolkit name', text: 'the name of your folder and branch: u, the last 3 digits of your student number, your initials and a short name, lowercase and joined with -, e.g. u123-hk-house.' },
  { label: '3. Idea', text: 'what the toolkit is for, in one or two sentences: a building type, a design question.' },
  { label: '4. Functions', text: 'the node programmes you need (start with 3–6), and what each should record, e.g. a Bedroom with a number of beds, a Kitchen that has a window or not.' },
  { label: '5. Algorithms', text: 'what to analyse (it reads and shows) or transform (it proposes changes you preview and Apply). Start with one or two.' },
] as const;
const TOOLKIT_EXAMPLE = 'Example: “Small family houses: bedrooms, a kitchen and a living room. Bedrooms record their number of beds and the kitchen whether it has a window; an analysis counts the beds on each level; a transform gives every Bedroom larger than 12 m² two beds.”';

/** Route A: a coding agent inside the repository (e.g. Claude Code in VS Code). */
export const TOOLKIT_AGENT_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Rules, then the ask', text: 'the rules come first (only your folder, on your branch; no other files, no packages, no push), then ask the agent to read the guide and the kit instructions in the repository, and to leave designs/ to you (the first three lines below).' }, ...TOOLKIT_PARTS],
  text: [
    'Rules: work only in toolkits/<your-toolkit-name>/ on my branch toolkit/<your-toolkit-name>. Do not change lab/ or any other folder or file, do not install or update packages, and do not push: I will push.',
    'Read lab/docs/TOOLKITS.md and lab/docs/ai-kit/toolkit/PROMPT.md in this repository, then create my toolkit following them exactly. The folder name is exactly my toolkit name. Run the checks and commit only my folder.',
    TOOLKIT_NO_DESIGNS,
    ...TOOLKIT_BLANKS,
  ].join('\n'),
  tips: [TOOLKIT_EXAMPLE, 'In Claude Code you can also type /create-toolkit and answer its questions.', 'Read what it wrote, try it in the app, and ask for changes in plain words.', TOOLKIT_DESIGNS_TIP],
};

/** Route B: a chat assistant with the toolkit kit attached (e.g. Claude in the browser). */
export const TOOLKIT_CHAT_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [{ label: '1. Ask', text: 'tell the assistant to read the kit, give you the folder as a zip and leave designs/ to you (the first two lines below).' }, ...TOOLKIT_PARTS],
  text: [
    "I've attached the Spatial Graph Lab toolkit kit. Read PROMPT.md and every file in it, then write my toolkit following it exactly. The folder name is exactly my toolkit name. Give me the folder <your-toolkit-name>/ as a zip; if you cannot make files, give every file in its own code block, headed by its path.",
    TOOLKIT_NO_DESIGNS,
    ...TOOLKIT_BLANKS,
  ].join('\n'),
  tips: [TOOLKIT_EXAMPLE, 'If a check or the app shows an error, paste the whole message back into the chat and ask it to fix exactly that.', TOOLKIT_DESIGNS_TIP],
};

/**
 * Route C (2026-11-26): a chat assistant with the toolkit kit attached, and the result uploaded in
 * the app (Upload toolkit (.zip)): no Git, no repository. Asks for ONE zip `<your-toolkit-name>.zip`
 * with `<your-toolkit-name>/toolkit.ts` directly inside the folder (the hand-in shape). Also in
 * lab/docs/TOOLKITS.md (`<!-- prompt:browser -->`) and tutorial/06-toolkit-in-the-browser.html, word for word.
 */
export const TOOLKIT_BROWSER_PROMPT_GUIDE: GuidePromptGuide = {
  title: 'How to write your prompt',
  parts: [
    { label: '1. Rules, then the ask', text: 'the rules come first (only your toolkit folder, only @student-api, no packages), then ask the assistant to read the kit, ask you its questions, give you ONE zip to upload in the app, and leave designs/ to you (the first four lines below).' },
    { label: '2. Toolkit name', text: 'the name of your folder and your zip: u, the last 3 digits of your student number, your initials and a short name, lowercase and joined with -, e.g. u123-hk-house.' },
    ...TOOLKIT_PARTS.slice(1),
  ],
  text: [
    'Rules: write only the files of my toolkit folder <your-toolkit-name>/. Import only from @student-api and from files in that folder, and use no packages.',
    "I've attached the Spatial Graph Lab toolkit kit. Read PROMPT.md and every file in it first, then ask me your clarifying questions before you write any code. After my answers, write my toolkit following it exactly. The folder name is exactly my toolkit name.",
    'I will upload it in the app with Upload toolkit (.zip), not put it in a repository: give me ONE zip, <your-toolkit-name>.zip, with the folder <your-toolkit-name>/ inside it and toolkit.ts directly inside that folder.',
    TOOLKIT_NO_DESIGNS,
    ...TOOLKIT_BLANKS,
  ].join('\n'),
  tips: [
    TOOLKIT_EXAMPLE,
    'Upload the zip with Upload toolkit (.zip) on the Welcome screen. If the app lists problems, paste them all back into the chat, ask it to fix exactly those and give the whole folder again as one zip, then upload the new zip in Project › Toolkit.',
    TOOLKIT_DESIGNS_TIP,
  ],
};

/** Route B: make the branch, put the folder in the repository, check it and push the branch (never main). */
export const TOOLKIT_CHAT_COMMANDS: string = [
  'git status',
  '# the first line must say "On branch main"; on another branch? run git switch main first',
  'git pull',
  'git switch -c toolkit/<your-toolkit-name>',
  'git commit --allow-empty -m "chore(<your-toolkit-name>): start my toolkit"',
  'git push -u origin toolkit/<your-toolkit-name>',
  '# this puts your branch on GitHub: you must see * [new branch]',
  '# unzip: the folder must end up at toolkits/<your-toolkit-name>/ (toolkit.ts directly inside it)',
  '# first time on this computer only:',
  'npm ci',
  'npm run check:toolkit -- -t <your-toolkit-name>',
  '# it must end with PASSED: toolkit "<your-toolkit-name>" is ready.',
  'npm run typecheck',
  'npm run dev',
  '# try it at http://localhost:5173/?toolkit=<your-toolkit-name> (or the address npm run dev prints), then stop the server (Ctrl+C)',
  'git add toolkits/<your-toolkit-name>',
  'git status',
  'git commit -m "feat(<your-toolkit-name>): first version of my toolkit"',
  'git push',
].join('\n');
