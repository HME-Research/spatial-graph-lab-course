import { useState } from 'react';
import { Dialog } from '../Dialog';
import '../guide/guide.css';
import { appVersion } from './version';

/** Content of the About dialog. */
export function AboutContent() {
  return (
    <div className="sgl-about">
      <p>A browser tool for exploring how graphs of nodes and edges become architecture.</p>
      <p>Developed by Heba Eiz</p>
      <p className="sgl-about-version">Version {appVersion()}</p>
    </div>
  );
}

/** Subtle info button beside the app title; opens a minimal About dialog (no link, no navigation tab). */
export function AboutButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="sgl-about-info" onClick={() => setOpen(true)} aria-label="About Spatial Graph Lab" aria-haspopup="dialog" title="About Spatial Graph Lab">
        <span aria-hidden="true">{'ⓘ'}</span>
      </button>
      {open && (
        <Dialog title="Spatial Graph Lab" onClose={() => setOpen(false)} dialogId="about" footer={<button type="button" onClick={() => setOpen(false)}>Close</button>}>
          <AboutContent />
        </Dialog>
      )}
    </>
  );
}
