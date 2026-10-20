import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { explain, requiresAcceptance } from '../../scripts/selection-rules.mjs';

/**
 * The escalation rules (ticket #64).
 *
 * The fast profiles may only skip complete acceptance when a change cannot
 * affect behavior. These tests are the direction of the fail-safe: documentation
 * skips, everything else escalates, and an unreadable diff escalates too.
 */
const CLI = fileURLToPath(new URL('../../scripts/selection.mjs', import.meta.url));

describe('whether a change requires complete acceptance', () => {
  it('skips it for documentation only', () => {
    expect(requiresAcceptance(['README.md', 'docs/BROWSER.md', '.agents/skills/implement/SKILL.md'])).toBe(false);
  });

  it('requires it for the game, the page and the verification machinery', () => {
    expect(requiresAcceptance(['src/ui/hud.ts'])).toBe(true);
    expect(requiresAcceptance(['e2e/smoke.spec.ts'])).toBe(true);
    expect(requiresAcceptance(['scripts/verify.mjs'])).toBe(true);
    expect(requiresAcceptance(['playwright.config.ts'])).toBe(true);
    expect(requiresAcceptance(['package.json'])).toBe(true);
    expect(requiresAcceptance(['.github/workflows/ci.yml'])).toBe(true);
    expect(requiresAcceptance(['tests/sim/fog.test.ts'])).toBe(true);
  });

  it('treats an empty or unreadable diff as unknown, and runs acceptance', () => {
    expect(requiresAcceptance([])).toBe(true);
    expect(explain([], true)).toContain('fail-safe');
  });

  it('requires it when documentation and code are mixed', () => {
    expect(requiresAcceptance(['docs/PLAN.md', 'src/main.ts'])).toBe(true);
  });
});

describe('the selection CLI', () => {
  it('prints the single line a workflow writes', () => {
    const result = run(['--files', 'docs/PLAN.md', '--github']);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('acceptance=false');
  });

  it('escalates when git cannot resolve the base', () => {
    const result = run(['--base', 'no-such-sha', '--github']);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('acceptance=true');
    expect(result.stderr).toContain('fail-safe');
  });

  it('escalates an unknown argument rather than guessing', () => {
    const result = run(['--no-such-flag']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown argument');
  });
});

function run(args: readonly string[]) {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
