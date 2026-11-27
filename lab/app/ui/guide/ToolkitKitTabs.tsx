import { useState } from 'react';
import { HorizontalTabs } from '../Tabs';
import { KitDownload, PromptGuide } from './AiKitTabs';
import { TOOLKIT_AGENT_PROMPT_GUIDE, TOOLKIT_BROWSER_PROMPT_GUIDE, TOOLKIT_CHAT_COMMANDS, TOOLKIT_CHAT_PROMPT_GUIDE } from './aiPrompt';
import { TUTORIAL_URL, tutorialPage } from './links';

/**
 * How to make your own toolkit with an AI assistant (owner 2026-11-24), shown in the Guide under
 * Toolkits & JSON › Make your own toolkit. Three tabs, one per way of working. The first two end with
 * the folder `toolkits/<your-toolkit-name>/` committed on the branch `toolkit/<your-name-tag>` and pushed (never
 * `main`, no Pull Request); the third ends with a zip uploaded in the app (no Git). Full text: lab/docs/TOOLKITS.md.
 *
 * - **Coding agent**: the agent works in the repository (reads lab/docs/TOOLKITS.md and
 *   lab/docs/ai-kit/toolkit/PROMPT.md, runs the checks); the prompt to copy, and the kit as an optional download.
 * - **Chat assistant**: download the toolkit kit, the prompt to copy, then the commands that put
 *   the folder in place, check it and push the branch.
 * - **Upload in the app** (2026-11-26): download the toolkit kit, the browser prompt to copy (it asks for ONE
 *   zip `<your-toolkit-name>.zip`), then Upload toolkit (.zip) on the Welcome screen or in Project › Toolkit.
 *   Step by step: tutorial/06-toolkit-in-the-browser.html.
 */

export type ToolkitKitTabId = 'agent' | 'chat' | 'upload';

const TABS = [
  { id: 'agent', label: 'Coding agent' },
  { id: 'chat', label: 'Chat assistant' },
  { id: 'upload', label: 'Upload in the app' },
] as const;

/** The tutorial page of the browser route (no Git). */
export const BROWSER_TUTORIAL_PAGE = tutorialPage('06-toolkit-in-the-browser');

export function ToolkitKitTabs({ initialTab = 'agent' }: { readonly initialTab?: ToolkitKitTabId }) {
  const [tab, setTab] = useState<ToolkitKitTabId>(initialTab);
  return (
    <section className="sgl-aikits" data-toolkit-kit="">
      <p className="sgl-aikits-intro">
        Your toolkit is one folder, <code>toolkits/&lt;your-toolkit-name&gt;/</code>, on your own branch <code>toolkit/&lt;your-toolkit-name&gt;</code>; your toolkit
        name is like <code>u123-hk-house</code>. Never commit to <code>main</code>. No Git? Make it with a chat and upload it as a zip (Upload in the app). Every step, from installing Git to handing in:{' '}
        <a href={TUTORIAL_URL} target="_blank" rel="noopener">
          the step-by-step tutorial
        </a>
        . Full guide: <code>lab/docs/TOOLKITS.md</code>.
      </p>
      <HorizontalTabs tabs={TABS} active={tab} onActive={setTab} label="Ways to make your own toolkit">
        {tab === 'agent' && (
          <div data-toolkit-kit-tab="agent">
            <p className="sgl-help sgl-aikits-help">
              The agent works in your copy of the repository (for example Claude Code in VS Code): it reads the guide there, writes the folder and runs the checks. First
              make your branch and send it to GitHub: <code>git status</code> (it must say On branch main), <code>git pull</code> (the newest course version first),{' '}
              <code>git switch -c toolkit/&lt;your-toolkit-name&gt;</code>, <code>git commit --allow-empty -m "chore(&lt;your-toolkit-name&gt;): start my toolkit"</code>,{' '}
              <code>git push -u origin toolkit/&lt;your-toolkit-name&gt;</code> (this puts your branch on GitHub: you must see <code>* [new branch]</code>). The prompt
              starts with the rules: only your folder, no other files, no packages, no push. Let the agent edit files, but say no to <code>git push</code>,{' '}
              <code>git reset</code>, <code>git clean</code> or a package install. After each change: <code>git push</code>.
            </p>
            <PromptGuide guide={TOOLKIT_AGENT_PROMPT_GUIDE} />
            <p className="sgl-help sgl-aikits-help">Optional: the same files as a zip, if your agent cannot read the repository’s docs.</p>
            <KitDownload kind="toolkit" label="Toolkit kit (.zip)" />
          </div>
        )}
        {tab === 'chat' && (
          <div data-toolkit-kit-tab="chat">
            <p className="sgl-help sgl-aikits-help">
              The assistant cannot see the repository (for example Claude in the browser): attach the kit, and put the folder it gives you in place yourself. The kit
              holds its instructions, the guide, the Student API, a starter folder and the House toolkit as an example.
            </p>
            <KitDownload kind="toolkit" label="Toolkit kit (.zip)" />
            <PromptGuide guide={TOOLKIT_CHAT_PROMPT_GUIDE} />
            <Commands title="Put it in the repository and push your branch" text={TOOLKIT_CHAT_COMMANDS} />
          </div>
        )}
        {tab === 'upload' && (
          <div data-toolkit-kit-tab="upload">
            <p className="sgl-help sgl-aikits-help">
              No Git and no repository: a chat assistant writes your toolkit as one zip, and you upload it here. Attach the kit, send the prompt, answer its
              questions and download <code>&lt;your-toolkit-name&gt;.zip</code>.
            </p>
            <KitDownload kind="toolkit" label="Toolkit kit (.zip)" />
            <PromptGuide guide={TOOLKIT_BROWSER_PROMPT_GUIDE} />
            <p className="sgl-help sgl-aikits-help" data-toolkit-upload-steps="">
              Then <strong>Upload toolkit (.zip)</strong> on the Welcome screen (a new project opens with your toolkit) or in <strong>Project › Toolkit</strong> (a new
              version of the same toolkit replaces it). Problems listed? Paste them into the chat and upload the new zip. Keep your work with{' '}
              <strong>Project › Export project</strong> (the toolkit is saved inside it); <strong>Project › Toolkit › Download toolkit (.zip)</strong> gives the zip to
              hand in. Step by step:{' '}
              <a href={BROWSER_TUTORIAL_PAGE} target="_blank" rel="noopener">
                Exercise 2 in the browser
              </a>
              .
            </p>
          </div>
        )}
      </HorizontalTabs>
    </section>
  );
}

/** Terminal commands to copy (same look as a prompt's starting text), with what to check after. */
function Commands({ title, text }: { readonly title: string; readonly text: string }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  };
  return (
    <section className="sgl-explainer-prompt" data-toolkit-commands="">
      <h4 className="sgl-explainer-prompt-title">{title}</h4>
      <p className="sgl-help sgl-aikits-help">In a terminal in the repository folder (VS Code: Terminal › New Terminal). Replace &lt;your-toolkit-name&gt; with yours, e.g. u123-hk-house.</p>
      <pre className="sgl-explainer-prompt-text">{text}</pre>
      <p className="sgl-explainer-prompt-copy">
        <button type="button" className="sgl-explainer-download" data-copy-commands="" onClick={() => void copy()}>
          Copy commands
        </button>
        {copied === 'yes' && <span className="sgl-explainer-download-note"> Copied. Run them one at a time.</span>}
        {copied === 'no' && <span className="sgl-explainer-download-note"> Could not copy: select the text above and copy it.</span>}
      </p>
      <ul className="sgl-explainer-prompt-tips">
        <li>git status must list only files under toolkits/&lt;your-toolkit-name&gt;/. If it lists anything else, don’t commit: undo that change first.</li>
        <li>A check fails? Paste the whole message into the chat, replace the files it changes, check again, commit and git push again.</li>
        <li>check:toolkit must end with PASSED. FAILED? Read the red message above it.</li>
        <li>GitHub Desktop instead: Current branch › New branch, then run the two lines that send it to GitHub (git commit --allow-empty …, git push -u …) in the terminal; copy the folder, commit, Push origin.</li>
      </ul>
    </section>
  );
}
