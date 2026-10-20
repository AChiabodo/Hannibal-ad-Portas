import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isDocumentationOnly, selectGates } from '../../scripts/selection-rules.mjs';

/**
 * The browser-gate rules (ticket #64, follow-up).
 *
 * Two levels: `main` is the integration gate and takes smoke plus complete
 * acceptance; `develop` is fast for pull requests, takes the smoke on merge, and
 * can opt in with the `browser` label. Everything unreadable or unexpected
 * escalates, because the fail-safe direction is more evidence, never less.
 */
const CODE = ['src/ui/hud.ts'];
const DOCS = ['docs/PLAN.md'];

describe('which browser gates a change takes', () => {
  it('runs both gates for a pull request into main', () => {
    expect(pick({ event: 'pull_request', baseBranch: 'main', changed: CODE })).toMatchObject({ smoke: true, acceptance: true });
  });

  it('runs only the smoke for a documentation pull request into main', () => {
    expect(pick({ event: 'pull_request', baseBranch: 'main', changed: DOCS })).toMatchObject({ smoke: true, acceptance: false });
  });

  it('keeps a pull request into develop fast', () => {
    const selection = pick({ event: 'pull_request', baseBranch: 'develop', changed: CODE });

    expect(selection).toMatchObject({ smoke: false, acceptance: false });
    expect(selection.reason).toContain('browser');
  });

  it('lets a develop pull request opt in with the browser label', () => {
    expect(pick({ event: 'pull_request', baseBranch: 'develop', labels: ['ui', 'browser'], changed: CODE }))
      .toMatchObject({ smoke: true, acceptance: true });
  });

  it('keeps a documentation pull request into develop fast too', () => {
    expect(pick({ event: 'pull_request', baseBranch: 'develop', changed: DOCS })).toMatchObject({ smoke: false, acceptance: false });
  });

  it('runs both gates on a push to main', () => {
    expect(pick({ event: 'push', branch: 'main', changed: CODE })).toMatchObject({ smoke: true, acceptance: true });
  });

  it('runs the smoke as a post-merge net on a push to develop', () => {
    expect(pick({ event: 'push', branch: 'develop', changed: CODE })).toMatchObject({ smoke: true, acceptance: false });
    expect(pick({ event: 'push', branch: 'develop', changed: DOCS })).toMatchObject({ smoke: true, acceptance: false });
  });

  it('runs both gates for a manual run', () => {
    expect(pick({ event: 'workflow_dispatch', changed: DOCS })).toMatchObject({ smoke: true, acceptance: true });
  });

  it('escalates an unknown file list', () => {
    const selection = pick({ event: 'pull_request', baseBranch: 'develop', changed: [] });

    expect(selection).toMatchObject({ smoke: true, acceptance: true });
    expect(selection.reason).toContain('fail-safe');
  });

  it('escalates an unexpected target branch', () => {
    expect(pick({ event: 'pull_request', baseBranch: 'release/1.0', changed: CODE })).toMatchObject({ smoke: true, acceptance: true });
    expect(pick({ event: 'push', branch: 'release/1.0', changed: CODE })).toMatchObject({ smoke: true, acceptance: true });
  });

  it('recognises documentation only when the list is not empty', () => {
    expect(isDocumentationOnly(DOCS)).toBe(true);
    expect(isDocumentationOnly(['README.md', '.agents/skills/implement/SKILL.md'])).toBe(true);
    expect(isDocumentationOnly([...DOCS, ...CODE])).toBe(false);
    expect(isDocumentationOnly([])).toBe(false);
  });
});

describe('the selection CLI', () => {
  it('prints the lines a workflow writes', () => {
    const result = run(['--files', 'docs/PLAN.md', '--github']);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('smoke=true\nacceptance=false');
  });

  it('takes the event and target branch into account', () => {
    const result = run(['--event', 'push', '--branch', 'develop', '--files', 'src/ui/hud.ts', '--github']);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('smoke=true\nacceptance=false');
  });

  it('escalates when git cannot resolve the base', () => {
    const result = run(['--base', 'no-such-sha', '--github']);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('smoke=true\nacceptance=true');
    expect(result.stderr).toContain('fail-safe');
  });

  it('escalates an unknown argument rather than guessing', () => {
    const result = run(['--no-such-flag']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown argument');
  });
});

const CLI = fileURLToPath(new URL('../../scripts/selection.mjs', import.meta.url));

function pick(options: Parameters<typeof selectGates>[0]) {
  return selectGates(options);
}

function run(args: readonly string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
