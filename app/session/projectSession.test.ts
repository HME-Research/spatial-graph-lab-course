import { describe, expect, it } from 'vitest';
import { readDesignJson, serializeDesignV2 } from '@app/document/v2';
import { expectOk } from '@app/document/test-fixtures';
import { PROJECT_GLOBS } from '@app/extensions';
import { fakeGlobs, LAB_FILES } from '@app/extensions/test-fixtures';
import builtInText from '../document/examples/two-storey-example.json?raw';
import {
  activeProjectOf,
  projectHeadline,
  readProjectRequest,
  searchWithProject,
  sessionDiagnostics,
  startProject,
} from './projectSession';

// Definitions are written as plain objects: only app/extensions may import @student-api, whose
// define… helpers are identity functions (algorithm helpers add `scope`).
const builtIn = { doc: expectOk(readDesignJson(builtInText)).doc, source: 'built-in example' };

describe('project activation in the application', () => {
  it('activates example-gallery by default and opens its default design', async () => {
    const { session, startup } = await startProject(PROJECT_GLOBS, readProjectRequest('', undefined), builtIn);
    expect(activeProjectOf(session)?.id).toBe('example-gallery');
    expect(session.available).toContain('example-gallery');
    expect(startup.source).toBe('projects/example-gallery/designs/two-storey-example.json');
    expect(startup.doc && serializeDesignV2(startup.doc)).toBe(serializeDesignV2(builtIn.doc));
    expect(startup.diagnostics).toEqual([]);
    expect(projectHeadline(session, true)).toEqual({ tone: 'ok', title: 'Example gallery' });
  });

  it('an explicitly requested project that does not exist is a persistent error, shown over the built-in example', async () => {
    const { session, startup } = await startProject(PROJECT_GLOBS, readProjectRequest('?project=nope', undefined), builtIn);
    expect(session.activation.status).toBe('failed');
    expect(activeProjectOf(session)).toBeNull();
    expect(startup.doc).toBe(builtIn.doc);
    expect(sessionDiagnostics(session).map((d) => d.code)).toEqual(['unknown-project']);
    const headline = projectHeadline(session, true);
    expect(headline.tone).toBe('error');
    expect(headline.title).toContain('nope');
    expect(headline.detail).toContain('built-in example');
  });

  it('an invalid project definition fails activation with its own diagnostic', async () => {
    const globs = fakeGlobs({ ...LAB_FILES, 'projects/lab/project.ts': { default: { name: '' } } });
    const { session, startup } = await startProject(globs, { query: 'lab' }, builtIn);
    expect(session.activation.status).toBe('failed');
    expect(startup.doc).toBe(builtIn.doc);
    expect(sessionDiagnostics(session).map((d) => d.code)).toEqual(['invalid-project-definition']);
  });

  it('a missing default design opens nothing and says so', async () => {
    const globs = fakeGlobs({ ...LAB_FILES, 'projects/lab/project.ts': { default: { name: 'Lab', defaultDesign: 'gone' } } });
    const { session, startup } = await startProject(globs, { query: 'lab' }, builtIn);
    expect(activeProjectOf(session)?.id).toBe('lab');
    expect(startup.doc).toBeNull();
    expect(sessionDiagnostics(session).map((d) => d.code)).toEqual(['default-design-missing']);
    expect(projectHeadline(session, false).tone).toBe('error');
  });

  it('the URL takes precedence over the environment; the environment is used otherwise', () => {
    expect(readProjectRequest('?project=a&x=1', 'b')).toEqual({ query: 'a', env: 'b' });
    expect(readProjectRequest('', 'b')).toEqual({ query: null, env: 'b' });
    expect(searchWithProject('?x=1&project=a', 'b')).toBe('?x=1&project=b');
  });

  it('activation never runs an algorithm', async () => {
    let runs = 0;
    const counted = { kind: 'analysis' as const, nodeValues: {} };
    const globs = fakeGlobs({
      ...LAB_FILES,
      'projects/lab/algorithms/a.ts': { default: { id: 'a', label: 'A', scope: 'graph', run: () => (runs++, counted) } },
      'projects/lab/algorithms/b.ts': {
        default: { id: 'b', label: 'B', scope: 'spatial', run: () => (runs++, { kind: 'transformation', operations: [] }) },
      },
    });
    const { session } = await startProject(globs, { query: 'lab' }, builtIn);
    expect(activeProjectOf(session)?.algorithms).toHaveLength(2);
    expect(runs).toBe(0);
  });
});
