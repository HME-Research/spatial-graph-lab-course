import { useState, type ChangeEvent } from 'react';
import { Dialog } from '@app/ui/Dialog';
import type { ToolkitOption } from './ToolkitPicker';
import { UPLOAD_TOOLKIT_LABEL } from './toolkitUpload';

/** The first `.zip` chosen in a file input (the input is cleared, so the same file can be chosen again). */
export const chosenFile = (event: ChangeEvent<HTMLInputElement>): File | null => {
  const input = event.currentTarget;
  const file = input.files?.[0] ?? null;
  input.value = '';
  return file;
};

/**
 * The problems of an uploaded toolkit (owner 2026-11-26), every one in plain words with its file,
 * and a Copy button so they can be pasted back into the chat. Nothing was changed.
 */
export function ToolkitProblems({
  source,
  problems,
  kept,
  title,
  onDismiss,
}: {
  readonly source: string;
  readonly problems: readonly string[];
  readonly kept: boolean;
  /** Headline (default: the toolkit in `source` could not be loaded). */
  readonly title?: string;
  readonly onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = `The toolkit in ${source} could not be loaded in Spatial Graph Lab:\n${problems.map((p) => `- ${p}`).join('\n')}`;
  return (
    <section className="issues sgl-load-failure sgl-toolkit-problems" role="alert" data-toolkit-problems>
      <h2>
        {title ?? `The toolkit in ${source} could not be loaded.`} {kept ? 'Your open project is unchanged.' : 'Nothing was opened.'}
      </h2>
      {title === undefined && <p className="meta">Fix these problems (paste them into your chat), then upload the new zip.</p>}
      <ul>
        {problems.map((p, n) => (
          <li key={n}>{p}</li>
        ))}
      </ul>
      <div className="sgl-buttons">
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard?.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            )
          }
        >
          {copied ? 'Copied' : 'Copy the problems'}
        </button>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </section>
  );
}

/**
 * Add a toolkit… (owner 2026-11-26): for a project WITHOUT a toolkit, choose a repository toolkit or
 * upload a toolkit zip. The shell checks it against the project before asking to confirm.
 */
export function AddToolkitDialog({
  toolkits,
  onChoose,
  onUpload,
  onCancel,
}: {
  readonly toolkits: readonly ToolkitOption[];
  readonly onChoose: (toolkitId: string) => void;
  readonly onUpload: (file: File) => void;
  readonly onCancel: () => void;
}) {
  return (
    <Dialog
      title="Add a toolkit"
      lead="The toolkit adds its Functions, attributes, analyses, transforms and designs. Your rooms and values stay as they are."
      onClose={onCancel}
      dialogId="add-toolkit"
      footer={
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      }
    >
      {toolkits.length > 0 && (
        <section aria-label="Toolkits in this app">
          <h3 className="sgl-example-section-title">Toolkits in this app</h3>
          <ul className="sgl-example-list">
            {toolkits.map((t, n) => (
              <li key={t.id}>
                <button type="button" className="sgl-example" data-add-toolkit={t.id} {...(n === 0 && { 'data-autofocus': true })} onClick={() => onChoose(t.id)}>
                  <span className="sgl-example-name">{t.label}</span>
                  <span className="sgl-example-description">toolkits/{t.id}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-label="Your own toolkit">
        <h3 className="sgl-example-section-title">Your own toolkit</h3>
        <label className="file-button">
          {UPLOAD_TOOLKIT_LABEL}
          <input
            type="file"
            accept=".zip,application/zip"
            aria-label={UPLOAD_TOOLKIT_LABEL}
            onChange={(e) => {
              const file = chosenFile(e);
              if (file) onUpload(file);
            }}
          />
        </label>
      </section>
    </Dialog>
  );
}
