import { useState } from 'react';
import { HorizontalTabs } from '../Tabs';
import { KitDownload, PromptGuide } from './AiKitTabs';
import { TOOLKIT_AGENT_PROMPT_GUIDE, TOOLKIT_CHAT_COMMANDS, TOOLKIT_CHAT_PROMPT_GUIDE } from './aiPrompt';
import { TUTORIAL_URL } from './links';

/**
 * How to make your own toolkit with an AI assistant (owner 2026-11-24), shown in the Guide under
 * Toolkits & JSON › Make your own toolkit. Two tabs, one per way of working; both end with the
 * folder `toolkits/<toolkit-id>/` committed on the branch `toolkit/<toolkit-id>` and pushed (never
 * `main`, no Pull Request). Full text: lab/docs/TOOLKITS.md.
 *
 * - **Coding agent**: the agent works in the repository (reads lab/docs/TOOLKITS.md and
 *   lab/docs/ai-kit/toolkit/PROMPT.md, runs the checks); the prompt to copy, and the kit as an optional download.
 * - **Chat assistant**: download the toolkit kit, the prompt to copy, then the commands that put
 *   the folder in place, check it and push the branch.
 */

export type ToolkitKitTabId = 'agent' | 'chat';

const TABS = [
  { id: 'agent', label: 'Coding agent' },
  { id: 'chat', label: 'Chat assistant' },
] as const;

export function ToolkitKitTabs({ initialTab = 'agent' }: { readonly initialTab?: ToolkitKitTabId }) {
  const [tab, setTab] = useState<ToolkitKitTabId>(initialTab);
  return (
    <section className="sgl-aikits" data-toolkit-kit="">
      <p className="sgl-aikits-intro">
        Your toolkit is one folder, <code>toolkits/&lt;toolkit-id&gt;/</code>, on your own branch <code>toolkit/&lt;toolkit-id&gt;</code>. Never commit to{' '}
        <code>main</code>. Every step, from installing Git to handing in:{' '}
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
              make your branch and claim its name: <code>git switch main</code>, <code>git pull</code>, <code>git switch -c toolkit/&lt;toolkit-id&gt;</code>,{' '}
              <code>git push -u origin toolkit/&lt;toolkit-id&gt;</code> (refused? The name is taken: choose another). After each change: <code>git push</code>.
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
      <p className="sgl-help sgl-aikits-help">In a terminal in the repository folder (VS Code: Terminal › New Terminal). Replace &lt;toolkit-id&gt; with yours.</p>
      <pre className="sgl-explainer-prompt-text">{text}</pre>
      <p className="sgl-explainer-prompt-copy">
        <button type="button" className="sgl-explainer-download" data-copy-commands="" onClick={() => void copy()}>
          Copy commands
        </button>
        {copied === 'yes' && <span className="sgl-explainer-download-note"> Copied. Run them one at a time.</span>}
        {copied === 'no' && <span className="sgl-explainer-download-note"> Could not copy: select the text above and copy it.</span>}
      </p>
      <ul className="sgl-explainer-prompt-tips">
        <li>git status must list only files under toolkits/&lt;toolkit-id&gt;/. If it lists anything else, don’t commit: undo that change first.</li>
        <li>A check fails? Paste the whole message into the chat, replace the files it changes, check again, commit and git push again.</li>
        <li>GitHub Desktop instead: Current branch › New branch, copy the folder, commit, then Publish branch.</li>
      </ul>
    </section>
  );
}
