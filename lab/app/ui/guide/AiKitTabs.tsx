import { useState } from 'react';
import type { GuidePromptGuide } from '../guideContracts';
import { HorizontalTabs } from '../Tabs';
import { DESIGN_PROMPT_GUIDE, GRAPH_PROMPT_GUIDE, PROJECT_PROMPT_GUIDE, TRANSFORM_PROJECT_PROMPT_GUIDE, TRANSFORM_PROMPT_GUIDE } from './aiPrompt';
import { buildKit, kitFileName, TEMPLATES, type KitKind, type ProjectSheetInput } from './aiKits';
import { DownloadButton, saveFile } from './DownloadButton';
import { useAiKitProject } from './projectKit';

/**
 * How to write your own analysis (owner 2026-11-20), shown in the ⓘ of "Upload your own (.ts)" and
 * in the Guide: a shared line on top, then three tabs.
 *
 * - **Any project**: "Include node basics" (on by default; what it means is written under it, not in
 *   a tooltip). On: the design kit, a design analysis using only what every project has. Off: the
 *   graph kit, ids and relationships only. The download and the prompt guide follow the checkbox.
 * - **This project**: the open project's toolkit (or "No toolkit"), and the design kit with a
 *   generated PROJECT.md (its Functions and custom fields, never the design).
 * - **Template**: the graph and the design template, to change by hand.
 *
 * With `purpose="transform"` (2026-11-25, the ⓘ of Transform › Upload your own (.ts)) the same tabs
 * offer the transform kit (Any project, no checkbox), the transform kit with PROJECT.md (This
 * project) and the transform template.
 */

export type AiKitTabId = 'any' | 'project' | 'template';

const TABS = [
  { id: 'any', label: 'Any project' },
  { id: 'project', label: 'This project' },
  { id: 'template', label: 'Template' },
] as const;

export const BASICS_LABEL = 'Include node basics';
export const BASICS_HELP =
  'Node basics: each node’s Function, size, position and level, each edge’s Relationship (Access / Open) and calculated values such as area. Never custom fields. Off: node ids and edges only (a graph analysis).';

/** The words under the Any project download of the transform kit. */
export const TRANSFORM_ANY_HELP =
  'Any project: the transform reads each node’s Function, size, position and level, each edge’s Relationship (Access / Open) and calculated values such as area, and names only Functions found in your design. Never custom fields.';

export function AiKitTabs({
  initialTab = 'any',
  initialBasics = true,
  purpose = 'analysis',
}: {
  readonly initialTab?: AiKitTabId;
  readonly initialBasics?: boolean;
  /** Which kits to offer: analyses (the default) or transforms (2026-11-25). */
  readonly purpose?: 'analysis' | 'transform';
}) {
  if (purpose === 'transform') return <TransformKitTabs initialTab={initialTab} />;
  return <AnalysisKitTabs initialTab={initialTab} initialBasics={initialBasics} />;
}

/** The transform kits in the same three tabs (the ⓘ of Transform › Upload your own (.ts)). */
function TransformKitTabs({ initialTab }: { readonly initialTab: AiKitTabId }) {
  const project = useAiKitProject();
  const [tab, setTab] = useState<AiKitTabId>(initialTab);
  return (
    <section className="sgl-aikits" data-ai-kits="transform">
      <p className="sgl-aikits-intro">
        Start with the simplest tab that can do your idea. <strong>Any project</strong>: works in every project. <strong>This project</strong>: can also use your
        toolkit’s and your own Functions and fields.
      </p>
      <HorizontalTabs tabs={TABS} active={tab} onActive={setTab} label="Ways to write your own transform">
        {tab === 'any' && (
          <div data-ai-kit-tab="any">
            <p className="sgl-help sgl-aikits-help">{TRANSFORM_ANY_HELP}</p>
            <KitDownload kind="transform" label="Transform kit (.zip)" />
            <PromptGuide guide={TRANSFORM_PROMPT_GUIDE} />
          </div>
        )}
        {tab === 'project' && (
          <div data-ai-kit-tab="project">
            {project ? (
              <>
                <ProjectLine project={project} />
                <p className="sgl-help sgl-aikits-help">
                  {project.toolkit
                    ? 'The kit adds PROJECT.md: this project’s Functions and custom fields, from the toolkit and your own (Yours), so the transform may add nodes of those Functions and read or set those fields.'
                    : 'This project has no toolkit: the kit adds PROJECT.md with your project’s own Functions and fields, so the transform may use them.'}{' '}
                  It then works only in projects that have the ones it uses. The kit never contains your design.
                </p>
                <KitDownload kind="transform-project" project={project} label="Transform kit for this project (.zip)" />
                <PromptGuide guide={TRANSFORM_PROJECT_PROMPT_GUIDE} />
              </>
            ) : (
              <p className="sgl-help">Open or create a project to download its kit.</p>
            )}
          </div>
        )}
        {tab === 'template' && (
          <div data-ai-kit-tab="template">
            <p className="sgl-help sgl-aikits-help">Write it yourself: change the template, then upload it in Transform with Upload your own (.ts).</p>
            <ul className="sgl-explainer-downloads" aria-label="Templates">
              <li>
                <DownloadButton download={{ label: 'Transform template (.ts)', ...TEMPLATES.transform, note: 'connects nodes that touch; any project.' }} />
              </li>
            </ul>
          </div>
        )}
      </HorizontalTabs>
    </section>
  );
}

/** "Toolkit: House — 12 Functions, 2 custom fields" (or "No toolkit"). */
function ProjectLine({ project }: { readonly project: ProjectSheetInput }) {
  const fields = project.nodeFields.length + project.edgeFields.length;
  return (
    <p className="sgl-aikits-toolkit" data-kit-toolkit="">
      <strong>{project.toolkit ? `Toolkit: ${project.toolkit.name}` : 'No toolkit'}</strong>
      {' — '}
      {project.functions.length} Function{project.functions.length === 1 ? '' : 's'}, {fields} custom field
      {fields === 1 ? '' : 's'}
    </p>
  );
}

function AnalysisKitTabs({ initialTab, initialBasics }: { readonly initialTab: AiKitTabId; readonly initialBasics: boolean }) {
  const project = useAiKitProject();
  const [tab, setTab] = useState<AiKitTabId>(initialTab);
  const [basics, setBasics] = useState(initialBasics);
  return (
    <section className="sgl-aikits" data-ai-kits="">
      <p className="sgl-aikits-intro">
        Start with the simplest tab that can answer your idea. <strong>Any project</strong>: works in every project. <strong>This project</strong>: can also use your
        toolkit’s and your own fields.
      </p>
      <HorizontalTabs tabs={TABS} active={tab} onActive={setTab} label="Ways to write your own analysis">
        {tab === 'any' && (
          <div data-ai-kit-tab="any">
            <label className="sgl-aikits-check">
              <input type="checkbox" checked={basics} onChange={(e) => setBasics(e.currentTarget.checked)} data-room-basics="" /> {BASICS_LABEL}
            </label>
            <p className="sgl-help sgl-aikits-help">{BASICS_HELP}</p>
            <KitDownload kind={basics ? 'design' : 'graph'} label={basics ? 'Design kit (.zip)' : 'Graph kit (.zip)'} />
            <PromptGuide guide={basics ? DESIGN_PROMPT_GUIDE : GRAPH_PROMPT_GUIDE} />
          </div>
        )}
        {tab === 'project' && (
          <div data-ai-kit-tab="project">
            {project ? (
              <>
                <ProjectLine project={project} />
                <p className="sgl-help sgl-aikits-help">
                  {project.toolkit
                    ? 'The kit adds PROJECT.md: this project’s Functions and custom fields, from the toolkit and your own (Yours), so the analysis may use them.'
                    : 'This project has no toolkit: the kit adds PROJECT.md with your project’s own Functions and fields, so the analysis may use them.'}{' '}
                  It then works only in projects that have the ones it uses. The kit never contains your design.
                </p>
                <KitDownload kind="project" project={project} label="Design kit for this project (.zip)" />
                <PromptGuide guide={PROJECT_PROMPT_GUIDE} />
              </>
            ) : (
              <p className="sgl-help">Open or create a project to download its kit.</p>
            )}
          </div>
        )}
        {tab === 'template' && (
          <div data-ai-kit-tab="template">
            <p className="sgl-help sgl-aikits-help">Write it yourself: change a template, then upload it with Upload your own (.ts).</p>
            <ul className="sgl-explainer-downloads" aria-label="Templates">
              <li>
                <DownloadButton download={{ label: 'Graph template (.ts)', ...TEMPLATES.graph, note: 'ids and edges only; any project.' }} />
              </li>
              <li>
                <DownloadButton download={{ label: 'Design template (.ts)', ...TEMPLATES.design, note: 'reads the nodes (area, level); any project.' }} />
              </li>
            </ul>
          </div>
        )}
      </HorizontalTabs>
    </section>
  );
}

/** Build a kit on click and save it (`buildKit`). */
export function KitDownload({ kind, label, project }: { readonly kind: KitKind; readonly label: string; readonly project?: ProjectSheetInput }) {
  const [problem, setProblem] = useState<string | null>(null);
  const fileName = kitFileName(kind, project?.toolkit);
  const save = async () => {
    setProblem(null);
    try {
      const kit = await buildKit(kind, project);
      saveFile(kit.fileName, kit.bytes as Uint8Array<ArrayBuffer>, 'application/zip');
    } catch (error) {
      setProblem(`Could not build ${fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return (
    <p className="sgl-aikits-download">
      <button type="button" className="sgl-explainer-download" data-download={fileName} onClick={() => void save()}>
        ⤓ {label}
      </button>
      <span className="sgl-explainer-download-note"> — attach it to an AI assistant, then write your prompt (below).</span>
      {problem && <span className="sgl-error"> {problem}</span>}
    </p>
  );
}

/**
 * How to write a prompt: its parts in order, a starting text the student copies (Copy button; the
 * text is also selectable by hand when the clipboard is not available) and short tips.
 */
export function PromptGuide({ guide }: { readonly guide: GuidePromptGuide }) {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(guide.text);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  };
  return (
    <section className="sgl-explainer-prompt" data-prompt-guide="">
      <h4 className="sgl-explainer-prompt-title">{guide.title}</h4>
      <ol className="sgl-explainer-prompt-parts">
        {guide.parts.map((p) => (
          <li key={p.label}>
            <strong>{p.label}</strong> — {p.text}
          </li>
        ))}
      </ol>
      <pre className="sgl-explainer-prompt-text">{guide.text}</pre>
      <p className="sgl-explainer-prompt-copy">
        <button type="button" className="sgl-explainer-download" data-copy-prompt="" onClick={() => void copy()}>
          Copy prompt
        </button>
        {copied === 'yes' && <span className="sgl-explainer-download-note"> Copied. Paste it into the AI chat and fill in the blanks (___).</span>}
        {copied === 'no' && <span className="sgl-explainer-download-note"> Could not copy: select the text above and copy it.</span>}
      </p>
      {guide.tips && guide.tips.length > 0 && (
        <ul className="sgl-explainer-prompt-tips">
          {guide.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
