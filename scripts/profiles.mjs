/**
 * The verification profiles (ticket #64).
 *
 * Before this file, "run the tests" meant two things only: every Vitest file, or
 * every Playwright spec. A change to one button therefore paid for the complete
 * Chromium matrix — both Factions, both reference resolutions, every frame
 * producer — and a failure in the matrix had to be diagnosed without knowing
 * which responsibility it belonged to.
 *
 * This module is the inventory the ticket asks for, written as data so that the
 * commands, the CI jobs, the documentation and a unit test all read the same
 * answer:
 *
 * - `FEATURES` names each browser responsibility and the specs that own it. A
 *   feature profile runs exactly those files: nothing is selected by an
 *   indiscriminate path filter, and a spec that is not listed here is not
 *   reachable through a narrow profile by accident.
 * - `SMOKE` is the one small real-browser profile: boot, an ordinary Command
 *   through a real gesture, and rendering/console health.
 * - `VISUAL_SPECS` are the specs that can write frames. They still assert on a
 *   complete run; they only write pictures when `SPQR_VISUAL=1`, which is the
 *   `visual` profile.
 * - `acceptanceSpecs()` reads the directory instead of trusting a hand list, so
 *   a new spec cannot be silently left out of complete acceptance.
 * - `RESPONSIBILITIES` is the coverage map: the behaviors the ticket says must
 *   not be lost, and the owner that protects each one. `tests/verify/profiles.test.ts`
 *   fails if an owner disappears or complete acceptance stops including it.
 *
 * What belongs where is a judgement about *responsibility*, not about speed: the
 * quick profiles are a selection of owners, never a weaker assertion.
 */

/**
 * One browser responsibility: a name a developer can ask for, and the spec files
 * that own it.
 *
 * @type {Readonly<Record<string, readonly string[]>>}
 */
export const FEATURES = {
  // The page and the theatre it draws: boot, camera, zooms, panning.
  boot: ['e2e/boot.spec.ts'],
  // The shared human submission surface and the contextual panels.
  commands: ['e2e/commands.spec.ts'],
  // Pointer and keyboard gestures that become real Commands.
  orders: ['e2e/orders.spec.ts'],
  // The Italian interface: rows, scrolling, pause, minimap, repairs.
  hud: ['e2e/hud.spec.ts', 'e2e/hud-repair.spec.ts'],
  // Faction-filtered knowledge and the three states of the fog.
  fog: ['e2e/fog.spec.ts'],
  // Structures, picking, remembered settlements and Siege damage.
  settlements: ['e2e/settlements.spec.ts'],
  // Drawn formations, standards, plates and the notice journal.
  squads: ['e2e/squads.spec.ts', 'e2e/readability.spec.ts', 'e2e/formation-art.spec.ts'],
  // A battle and a Siege played on the real page, with the force rule in view
  // (#66): what a Reparto is worth, how a wall is worked, what it costs the men.
  battle: ['e2e/battle.spec.ts'],
  // The quietened terrain and the figures that must stay louder than it.
  terrain: ['e2e/terrain-readability.spec.ts'],
  // The browser host: setup, the first-entry guide, a whole Match, the debug
  // surface and desktop presentation.
  host: [
    'e2e/setup.spec.ts',
    'e2e/first-entry.spec.ts',
    'e2e/match.spec.ts',
    'e2e/inspect.spec.ts',
    'e2e/surface.spec.ts',
    'e2e/desktop.spec.ts',
  ],
  // The generated-art catalogue page.
  atelier: ['e2e/atelier.spec.ts'],
  // The reference-resolution matrices. Functional assertions as well as frames;
  // acceptance runs them with captures off.
  acceptance: ['e2e/acceptance.spec.ts', 'e2e/appearance.spec.ts'],
};

/** The small real-browser smoke: boot, one ordinary Command, rendering health and the Atelier. */
export const SMOKE = ['e2e/smoke.spec.ts'];

/**
 * The specs that can produce visual frames.
 *
 * These are the complete pre-integration scenes, not a separate weaker suite:
 * the `accept` profile runs them without captures, and `visual` runs the same
 * assertions with `SPQR_VISUAL=1`.
 */
export const VISUAL_SPECS = [
  'e2e/formation-art.spec.ts',
  'e2e/acceptance.spec.ts',
  'e2e/appearance.spec.ts',
  'e2e/commands.spec.ts',
  'e2e/desktop.spec.ts',
  'e2e/first-entry.spec.ts',
  'e2e/hud-repair.spec.ts',
  'e2e/readability.spec.ts',
  'e2e/settlements.spec.ts',
  'e2e/setup.spec.ts',
  'e2e/terrain-readability.spec.ts',
];

/**
 * The non-browser checks a focused run falls back to when no changed path is
 * given: the public seams a change is most likely to cross.
 */
export const CORE_TESTS = [
  'tests/sim/command.test.ts',
  'tests/sim/controller.test.ts',
  'tests/sim/match.test.ts',
  'tests/sim/replay.test.ts',
  'tests/input/human.test.ts',
  'tests/ui/hud.test.ts',
  'tests/ui/strings.test.ts',
];

/**
 * The coverage map the ticket asks for: a behavior that must survive the
 * reorganization, and the owner that protects it.
 *
 * Read by `tests/verify/profiles.test.ts`, so deleting an owner or dropping it
 * from complete acceptance is a failing test rather than a note in a report.
 *
 * @type {readonly { readonly behavior: string; readonly owners: readonly string[] }[]}
 */
export const RESPONSIBILITIES = [
  { behavior: 'pointer and keyboard gestures', owners: ['e2e/orders.spec.ts', 'e2e/hud.spec.ts'] },
  { behavior: 'fog and faction-filtered Observation', owners: ['e2e/fog.spec.ts', 'tests/sim/fog.test.ts', 'tests/sim/siege-fog.test.ts'] },
  { behavior: 'queued and applied Commands', owners: ['e2e/commands.spec.ts', 'tests/input/match-host.test.ts'] },
  { behavior: 'Replay is a seed, a log and its fingerprints', owners: ['tests/sim/replay.test.ts', 'tests/cli/replay.test.ts'] },
  { behavior: 'the Atelier catalogue', owners: ['e2e/atelier.spec.ts', 'tests/render/atelier-layout.test.ts'] },
  { behavior: 'no committed binary assets', owners: ['tests/guards/asset-files.test.ts', 'scripts/guards/asset-files.mjs'] },
  { behavior: 'authoritative determinism', owners: ['tests/sim/hash.test.ts', 'tests/cli/run.test.ts'] },
  { behavior: 'a Match ends at its bound or by a rule', owners: ['e2e/match.spec.ts', 'tests/sim/outcome.test.ts'] },
  { behavior: 'equal men fight equally across Squad sizes', owners: ['e2e/battle.spec.ts', 'tests/sim/balance.test.ts'] },
];

/**
 * The sample tests that prove a narrow profile is not an empty selection.
 *
 * Each is a real regression a developer would deliberately select: the name is
 * the test's own title, which `tests/verify/profiles.test.ts` looks for in the
 * owner spec. A rename is allowed; a silent deletion is not.
 *
 * @type {readonly { readonly feature: string; readonly title: string }[]}
 */
export const SAMPLES = [
  { feature: 'orders', title: 'moves a Squad with a right click, and the men march' },
  { feature: 'fog', title: 'walks one tile through the three states of the fog as the watch moves' },
  { feature: 'commands', title: 'orders given while paused are visibly pending, and land on the next tick' },
  { feature: 'atelier', title: 'magnifies a pixel into a whole square of the same colour, at 2× and 4×' },
];

/**
 * Every browser spec on disk, sorted.
 *
 * Complete acceptance is this list and not a hand-maintained one: a new spec is
 * included by existing, and the profile test fails if it is not attributable to
 * a responsibility.
 *
 * @param {readonly string[]} names file names, as `readdir` answers them.
 * @returns {readonly string[]} the spec paths, root-relative.
 */
export function acceptanceSpecs(names) {
  return names
    .filter((name) => name.endsWith('.spec.ts'))
    .sort()
    .map((name) => `e2e/${name}`);
}

/**
 * The feature names a developer may ask for, in the order the map lists them.
 *
 * @returns {readonly string[]}
 */
export function featureNames() {
  return Object.keys(FEATURES);
}

/**
 * The specs a feature profile selects, or `undefined` for an unknown name.
 *
 * @param {string} name
 * @returns {readonly string[] | undefined}
 */
export function featureSpecs(name) {
  const specs = Object.hasOwn(FEATURES, name) ? FEATURES[name] : undefined;
  return specs;
}
