import { useEffect, useState } from 'react';
import { Dialog } from '@app/ui/Dialog';
import type { ExampleChoice, ExampleOption } from './welcomeModel';

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly items: readonly ExampleOption[] }
  | { readonly status: 'error'; readonly message: string };

/**
 * Open example… (owner decision 2026-11-20), from Welcome and the Project panel: the built-in House
 * (graph only, no toolkit) and every design of every toolkit, each with its name, description and
 * a "No toolkit" / "Toolkit: <name>" tag. Choosing one closes the dialog and opens it as a NEW
 * project (`onOpen`); the list is loaded when the dialog opens (`load`).
 */
export function OpenExampleDialog({
  load,
  onOpen,
  onCancel,
}: {
  readonly load: () => Promise<readonly ExampleOption[]>;
  readonly onOpen: (choice: ExampleChoice) => void;
  readonly onCancel: () => void;
}) {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    load().then(
      (items) => !cancelled && setState({ status: 'ready', items }),
      (error: unknown) => !cancelled && setState({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <Dialog
      title="Open example"
      lead="Each example opens as a new project, with its toolkit if it has one."
      onClose={onCancel}
      dialogId="open-example"
      className="sgl-open-example"
      footer={
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      }
    >
      {state.status === 'loading' && (
        <p className="meta" role="status">
          Looking for examples…
        </p>
      )}
      {state.status === 'error' && (
        <p className="sgl-project-files-error" role="alert">
          The examples could not be listed: {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <ul className="sgl-example-list" aria-label="Examples">
          {state.items.map((option, index) => (
            <li key={option.key}>
              <button
                type="button"
                className="sgl-example"
                data-example={option.key}
                {...(index === 0 && { 'data-autofocus': true })}
                disabled={option.problem !== null}
                onClick={() => onOpen(option.choice)}
              >
                <span className="sgl-example-head">
                  <span className="sgl-example-name">{option.name}</span>
                  <span className="sgl-example-tag">{option.tag}</span>
                </span>
                {option.description && <span className="sgl-example-description">{option.description}</span>}
                {option.problem && <span className="sgl-example-problem">⚠ {option.problem}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
