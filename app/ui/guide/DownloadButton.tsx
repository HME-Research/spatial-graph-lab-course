import { useState } from 'react';
import type { GuideDownload } from '../guideContracts';

/** Hand `content` to the browser as a download named `fileName` (nothing is uploaded). */
export function saveFile(fileName: string, content: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save a file: a served file through a plain download link (`href`, binary allowed), or a text
 * file loaded on click and handed to the browser as a download (nothing is uploaded).
 */
export function DownloadButton({ download }: { readonly download: GuideDownload }) {
  const [problem, setProblem] = useState<string | null>(null);
  const note = download.note ? <span className="sgl-explainer-download-note"> — {download.note}</span> : null;
  if ('href' in download) {
    return (
      <>
        <a className="sgl-explainer-download" href={download.href} download={download.fileName} data-download={download.fileName}>
          ⤓ {download.label}
        </a>
        {note}
      </>
    );
  }
  const load = download.load;
  const save = async () => {
    setProblem(null);
    try {
      saveFile(download.fileName, await load(), 'text/plain;charset=utf-8');
    } catch (error) {
      setProblem(`Could not load ${download.fileName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return (
    <>
      <button type="button" className="sgl-explainer-download" data-download={download.fileName} onClick={() => void save()}>
        ⤓ {download.label}
      </button>
      {note}
      {problem && <span className="sgl-error"> {problem}</span>}
    </>
  );
}
