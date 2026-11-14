import { describe, expect, it } from 'vitest';
import { validateDocument, type DesignDocument } from '@app/document';
import exampleDesign from '../document/examples/two-storey-example.json';
import { activateProject, type ActiveProject } from './activate';
import { checkConformance } from './conformance';
import { discoverProjects } from './discover';
import { PROJECT_GLOBS } from './projectGlobs';
import { runAlgorithm } from './run';

/**
 * Project check: every project under projects/ is loaded exactly as the app loads it. Run it
 * for all projects with `npm run check:project`, or for one with
 * `npm run check:project -- -t my-project`. It fails on anything the app would show as an error:
 * invalid project/type/algorithm definitions, invalid designs, and algorithms that fail when run
 * with their default parameters on the project's default design (or the built-in example).
 * Design warnings (e.g. an invalid attribute value) are printed but do not fail the check,
 * because the app never refuses to load a design for them.
 */

const { projects, diagnostics: folderProblems } = discoverProjects(PROJECT_GLOBS);

const lines = (items: readonly { readonly message: string }[]) => items.map((d) => d.message);

describe('projects/ folders', () => {
  it('every project folder is well-formed', () => {
    expect(lines(folderProblems)).toEqual([]);
  });
});

describe.each(projects.map((p) => [p.id, p] as const))('project "%s"', (_id, source) => {
  const activation = activateProject(source);
  const active = async (): Promise<ActiveProject> => {
    const result = await activation;
    if (result.status === 'failed') throw new Error(`not activated:\n${lines(result.diagnostics).join('\n')}`);
    if (result.status !== 'active') throw new Error('not activated');
    return result.project;
  };

  it('activates, and every definition and design is valid', async () => {
    const project = await active();
    expect(lines(project.diagnostics.filter((d) => d.severity === 'error'))).toEqual([]);
  });

  it('its designs conform to its node types (warnings are reported, not failed)', async () => {
    const project = await active();
    for (const design of project.designs) {
      if (!design.result.ok) continue; // reported by the previous check
      const problems = checkConformance(design.result.value, project).filter((d) => d.severity !== 'info');
      if (problems.length > 0) console.warn(`${design.file}:\n  ${lines(problems).join('\n  ')}`);
      expect(problems.filter((d) => d.severity === 'error').map((d) => d.message)).toEqual([]);
    }
  });

  it('every enabled algorithm runs on the default design with default parameters', async () => {
    const project = await active();
    const chosen = project.designs.find((d) => d.id === project.definition.defaultDesign);
    const builtIn = validateDocument(exampleDesign);
    const doc: DesignDocument | undefined = chosen?.result.ok ? chosen.result.value : builtIn.ok ? builtIn.value : undefined;
    expect(doc).toBeDefined();
    for (const algorithm of project.algorithms.filter((a) => a.status.ok)) {
      const outcome = runAlgorithm(doc!, project, algorithm.id);
      expect(outcome.ok ? [] : lines(outcome.issues), `${algorithm.file}`).toEqual([]);
    }
  });
});
