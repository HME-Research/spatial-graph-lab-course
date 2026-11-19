import { describe, expect, it } from 'vitest';
import { readDesignJson, serializeDesignV2 } from '@app/document/v2';
import { expectOk } from '@app/document/test-fixtures';
import { TOOLKIT_GLOBS } from '@app/extensions';
import { fakeGlobs, LAB_FILES } from '@app/extensions/test-fixtures';
import { GALLERY_GLOBS, TWO_STOREY_TEXT } from '@app/extensions/test-toolkit';
import builtInText from '../document/examples/house.json?raw';
import {
  activeToolkitOf,
  toolkitHeadline,
  readToolkitRequest,
  searchWithToolkit,
  sessionDiagnostics,
  startToolkit,
} from './toolkitSession';

// Definitions are written as plain objects: only app/extensions may import @student-api, whose
// define… helpers are identity functions (algorithm helpers add `scope`).
const builtIn = { doc: expectOk(readDesignJson(builtInText)).doc, source: 'built-in example' };

describe('toolkit activation in the application', () => {
  it('activates no toolkit by default and shows the built-in graph-only example', async () => {
    const { session, startup } = await startToolkit(GALLERY_GLOBS, readToolkitRequest('', undefined), builtIn);
    expect(session.activation.status).toBe('none');
    expect(activeToolkitOf(session)).toBeNull();
    expect(session.available).toEqual(['gallery']);
    expect(startup.doc).toBe(builtIn.doc);
    expect(startup.diagnostics).toEqual([]);
    expect(toolkitHeadline(session, true).title).toBe('No toolkit');
  });

  it('the repository toolkits folder may be empty: nothing is activated and nothing fails', async () => {
    const { session, startup } = await startToolkit(TOOLKIT_GLOBS, readToolkitRequest('', undefined), builtIn);
    expect(session.activation.status).toBe('none');
    expect(session.discovery).toEqual([]);
    expect(startup.doc).toBe(builtIn.doc);
  });

  it('a requested toolkit opens its default design', async () => {
    const { session, startup } = await startToolkit(GALLERY_GLOBS, readToolkitRequest('?toolkit=gallery', undefined), builtIn);
    expect(activeToolkitOf(session)?.id).toBe('gallery');
    expect(startup.source).toBe('toolkits/gallery/designs/two-storey.json');
    expect(startup.doc && serializeDesignV2(startup.doc)).toBe(serializeDesignV2(expectOk(readDesignJson(TWO_STOREY_TEXT)).doc));
    expect(startup.diagnostics).toEqual([]);
    expect(toolkitHeadline(session, true)).toEqual({ tone: 'ok', title: 'Gallery' });
  });

  it('an explicitly requested toolkit that does not exist is a persistent error, shown over the built-in example', async () => {
    const { session, startup } = await startToolkit(TOOLKIT_GLOBS, readToolkitRequest('?toolkit=nope', undefined), builtIn);
    expect(session.activation.status).toBe('failed');
    expect(activeToolkitOf(session)).toBeNull();
    expect(startup.doc).toBe(builtIn.doc);
    expect(sessionDiagnostics(session).map((d) => d.code)).toEqual(['unknown-toolkit']);
    const headline = toolkitHeadline(session, true);
    expect(headline.tone).toBe('error');
    expect(headline.title).toContain('nope');
    expect(headline.detail).toContain('built-in example');
  });

  it('an invalid toolkit definition fails activation with its own diagnostic', async () => {
    const globs = fakeGlobs({ ...LAB_FILES, 'toolkits/lab/toolkit.ts': { default: { name: '' } } });
    const { session, startup } = await startToolkit(globs, { query: 'lab' }, builtIn);
    expect(session.activation.status).toBe('failed');
    expect(startup.doc).toBe(builtIn.doc);
    expect(sessionDiagnostics(session).map((d) => d.code)).toEqual(['invalid-toolkit-definition']);
  });

  it('a missing default design opens nothing and says so', async () => {
    const globs = fakeGlobs({ ...LAB_FILES, 'toolkits/lab/toolkit.ts': { default: { name: 'Lab', defaultDesign: 'gone' } } });
    const { session, startup } = await startToolkit(globs, { query: 'lab' }, builtIn);
    expect(activeToolkitOf(session)?.id).toBe('lab');
    expect(startup.doc).toBeNull();
    expect(sessionDiagnostics(session).map((d) => d.code)).toEqual(['default-design-missing']);
    expect(toolkitHeadline(session, false).tone).toBe('error');
  });

  it('the URL takes precedence over the environment; the environment is used otherwise', () => {
    expect(readToolkitRequest('?toolkit=a&x=1', 'b')).toEqual({ query: 'a', env: 'b' });
    expect(readToolkitRequest('', 'b')).toEqual({ query: null, env: 'b' });
    expect(searchWithToolkit('?x=1&toolkit=a', 'b')).toBe('?x=1&toolkit=b');
  });

  it('activation never runs an algorithm', async () => {
    let runs = 0;
    const counted = { kind: 'analysis' as const, nodeValues: {} };
    const globs = fakeGlobs({
      ...LAB_FILES,
      'toolkits/lab/algorithms/a.ts': { default: { id: 'a', label: 'A', scope: 'graph', run: () => (runs++, counted) } },
      'toolkits/lab/algorithms/b.ts': {
        default: { id: 'b', label: 'B', scope: 'spatial', run: () => (runs++, { kind: 'transformation', operations: [] }) },
      },
    });
    const { session } = await startToolkit(globs, { query: 'lab' }, builtIn);
    expect(activeToolkitOf(session)?.algorithms).toHaveLength(2);
    expect(runs).toBe(0);
  });
});
