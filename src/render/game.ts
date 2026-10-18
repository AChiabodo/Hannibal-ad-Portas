/**
 * The running game page: a Match, its interface, and the loop that turns one
 * into the other (ticket B7).
 *
 * B3 put the theatre on screen and stopped there, because there was no Match to
 * show. B7 runs one: the page opens the economy Match of B6 on the seed B3's
 * view already names, plays it in real time at the pace B5 built, and reads its
 * own Faction's **Observation** — never the world — into the HUD. That is the
 * whole of the page's relationship with the simulation, and it is the seam the
 * plan insists on: the interface is one more reader of an Observation, and it
 * can no more see the other Faction's economy than a Controller can.
 *
 * ## The clock, and the one place wall time is allowed
 *
 * `sim/` may not read a wall clock (ADR-0006), so the page is where real time
 * lives: a `requestAnimationFrame` loop measures how long the last frame took
 * and asks `pacing.ticksFor` how many whole ticks that is worth. Pausing, the
 * three speeds and the orders held during a pause are all B5's, and this module
 * only drives them. `advance` steps ticks without any wall time at all, which is
 * how a browser test watches a Season turn instead of waiting three and a half
 * minutes for it.
 *
 * A frame that arrives after a long absence — a background tab, a stalled
 * renderer — is clamped to a quarter of a second's worth of ticks. The clamp is
 * not a design decision about the game: it is the difference between a tab that
 * was hidden for an hour and an hour of Match, which is a Match nobody asked to
 * play.
 *
 * ## What the Faction knows
 *
 * The minimap is drawn through a fog grid, and the grid the page hands it is
 * built from the Observation: the ground around the settlements this Faction
 * holds, and nothing else. That is a deliberate stand-in — **B4 owns visibility**,
 * and the day its grid lands this is the line that reads it instead of guessing
 * — and it is honest at the scale it claims: the page shows no tile its Faction
 * has no business knowing.
 */
import { pixelAt, type Rgba } from '../art/pixel-buffer.ts';
import { recruit, validateCommand, type Command } from '../sim/command.ts';
import { idleController } from '../sim/controller.ts';
import { ForeignCommandError } from '../sim/driver.ts';
import {
  economyMatchRules,
  observeEconomy,
  type EconomyVisible,
  type EconomyWorld,
} from '../sim/economy-match.ts';
import type { Faction } from '../sim/faction.ts';
import { createMatch, type Match } from '../sim/match.ts';
import type { Observation } from '../sim/observation.ts';
import { createPacing, type Speed } from '../sim/pacing.ts';
import { LAND_RADIUS } from '../sim/economy.ts';
import { requireTickCount } from '../sim/ticks.ts';
import {
  hudLayout,
  hudModel,
  type HudModel,
  type HudSize,
  type Rect,
  type RowRect,
  type Selection,
} from '../ui/hud.ts';
import { knowledgeOf, minimapPlate, type Fog, type FogGrid, type ViewportRect } from '../ui/minimap.ts';
import { createHudLayer, type HudLayer } from './hud.ts';
import type { PixelPoint, Stage } from './stage.ts';

/** The Faction the page plays, and the only Faction whose Observation it reads. */
export const PLAYER_FACTION: Faction = 'rome';

/**
 * The order the page gives on its first tick: one Squad from the Stronghold.
 *
 * A HUD that can show a Squad and has none to show is a panel nobody can check,
 * and C2 is the ticket that gives a Player a way to raise one by hand. Until
 * then the page raises one through the same seam a Player will use, so the Squad
 * panel is a live panel and not a fixture.
 */
export const OPENING_ORDER = { settlement: 0, squadType: 'hastati', count: 1 } as const;

/**
 * How far from a settlement the page admits to seeing: the reach of its land.
 *
 * The interim until B4's visibility grid arrives, and deliberately not a new
 * number: the ground a settlement works is the ground its Faction is standing
 * on, so the page borrows the economy's own radius rather than inventing one.
 * Named here as a stand-in so that the day the visibility grid lands, this is
 * the line that reads it instead of guessing.
 */
const KNOWLEDGE_RADIUS = LAND_RADIUS;

/** The longest a single frame may pay for: a background tab does not owe the Match an hour. */
const FRAME_BUDGET_MS = 250;

/** What the page tells a test or an agent about the game it is playing. */
export interface GameHooks {
  /** The HUD's own model: the words and figures, in Italian. */
  hud(): HudModel;
  /** What is selected, or `null`. */
  selection(): Selection | null;
  /** Selects a settlement or a Squad, or clears the selection with `null`. */
  select(selection: Selection | null): void;
  /** Every rectangle the interface covers, which is what a test must not read the theatre through. */
  hudRects(): readonly Rect[];
  /** Where each selectable row stands, so that a test can press the row a Player would. */
  hudRows(): readonly RowRect[];
  /** The Match's tick. */
  tick(): number;
  /** Steps the Match a whole number of ticks without waiting for wall time. */
  advance(ticks: number): void;
  /** Stops the real-time clock. */
  pause(): void;
  /** Restarts it, without charging the Match for the time spent paused. */
  resume(): void;
  /** Whether the clock is stopped. */
  paused(): boolean;
  /** The Match's pace: 1×, 2× or 3×. */
  speed(): Speed;
  /** Sets the pace. */
  setSpeed(speed: Speed): void;
  /** The generated minimap, sampled in the same currency the frame is. */
  minimapSamples(points: readonly PixelPoint[]): readonly Rgba[];
  /** The fog the minimap is drawn through, one state per tile, row-major. */
  fog(): readonly Fog[];
}

/** The running game: its hooks, and the two calls that redraw it. */
export interface Game {
  readonly hooks: GameHooks;
  /** Recomposes the interface from the Match as it stands. */
  sync(): void;
  /** Recomposes only the minimap, which is all a camera move changes. */
  syncMinimap(): void;
  /** Starts the real-time loop. Idempotent. */
  start(): void;
  /** Stops it. Idempotent. */
  stop(): void;
}

/** What a game needs to exist: a stage, a seed, the viewport, and where the HUD goes. */
export interface GameOptions {
  readonly stage: Stage;
  readonly seed: number;
  readonly size: HudSize;
  /** What the camera is showing, in stage pixels, read fresh on every redraw. */
  readonly viewport: () => ViewportRect;
}

/**
 * Opens the Match and puts its interface on the stage.
 *
 * The Match is created here and nowhere else, so the page's seed is the page's
 * seed: the theatre on screen and the economy behind the HUD are the same
 * generated map, and a test can regenerate both in Node from the number
 * `describe()` reports.
 */
export function createGame(options: GameOptions): Game {
  const match: Match<EconomyWorld, Command> = createMatch({
    seed: options.seed,
    rules: economyMatchRules,
  });
  const pacing = createPacing();
  const player = pacing.wrap(idleController<EconomyVisible>());
  player.order(recruit(PLAYER_FACTION, OPENING_ORDER.settlement, OPENING_ORDER.squadType, OPENING_ORDER.count));

  const layer: HudLayer = createHudLayer(options.stage);

  let selection: Selection | null = null;
  let model = readModel();
  let minimap = readMinimap();
  let running = false;
  let lastFrame = 0;
  let scheduled: number | null = null;

  repaint();

  const hooks: GameHooks = {
    hud: () => model,
    selection: () => selection,
    select: (next) => {
      selection = next;
      repaint();
    },
    hudRects: () => {
      const layout = hudLayout(model, options.size);
      return [layout.bar, layout.list, layout.detail, layout.minimap];
    },
    hudRows: () => hudLayout(model, options.size).rows,
    tick: () => match.state.tick,
    advance: (ticks) => {
      step(requireTickCount(ticks, 'ticks', 0));
      repaint();
    },
    pause: () => {
      pacing.pause();
    },
    resume: () => {
      pacing.resume();
      lastFrame = performance.now();
    },
    paused: () => pacing.paused,
    speed: () => pacing.speed,
    setSpeed: (speed) => {
      pacing.setSpeed(speed);
    },
    minimapSamples: (points) => points.map(([x, y]) => pixelAt(minimap, x, y)),
    fog: () => Array.from(readFog().cells, (state) => state as Fog),
  };

  return {
    hooks,
    sync: repaint,
    syncMinimap: () => {
      minimap = readMinimap();
      layer.minimap(model, minimap, options.size);
    },
    start: () => {
      if (running) return;

      running = true;
      lastFrame = performance.now();
      scheduled = requestAnimationFrame(frame);
    },
    stop: () => {
      running = false;
      if (scheduled !== null) cancelAnimationFrame(scheduled);
      scheduled = null;
    },
  };

  /** One frame: how much wall time has passed, how many ticks that buys, and a redraw. */
  function frame(now: number): void {
    if (!running) return;

    // Clamped at both ends. At the top because a background tab does not owe the
    // Match an hour; at the bottom because a frame's timestamp is the moment the
    // frame *began*, which can precede a `performance.now()` read taken while
    // starting the loop — and a negative elapsed time is a clock the pacer is
    // right to refuse.
    const elapsed = Math.min(Math.max(now - lastFrame, 0), FRAME_BUDGET_MS);
    lastFrame = now;

    const ticks = pacing.ticksFor(elapsed);
    if (ticks > 0) {
      step(ticks);
      repaint();
    }

    scheduled = requestAnimationFrame(frame);
  }

  /**
   * Steps the Match, handing its Controller the same Observation — and the same
   * validation — the headless driver would.
   *
   * The page is a host loop and not the driver (`sim/driver.ts` plays a Match to
   * its end, which a page cannot do), so the two checks the seam promises are
   * repeated here rather than assumed: what a Controller returns is read through
   * `validateCommand`, and a Command addressed to another Faction is refused with
   * the driver's own error. A page that skipped them would be the one place in
   * the game where a Controller could command what it does not own.
   */
  function step(ticks: number): void {
    for (let tick = 0; tick < ticks; tick += 1) {
      const observation: Observation<EconomyVisible> = {
        faction: PLAYER_FACTION,
        tick: match.state.tick,
        visible: structuredClone(observeEconomy(match.state.world, PLAYER_FACTION)),
      };

      const commands: Command[] = [];
      for (const emitted of player.decide(observation)) {
        const command = validateCommand(emitted);
        if (command.faction !== PLAYER_FACTION) {
          throw new ForeignCommandError(PLAYER_FACTION, command.faction);
        }

        commands.push(command);
      }

      match.step(commands);
    }
  }

  /** The Faction's window on the economy, which is the only thing the interface reads. */
  function visible(): EconomyVisible {
    return observeEconomy(match.state.world, PLAYER_FACTION);
  }

  /** The HUD's model, with the selection dropped if the Faction no longer holds it. */
  function readModel(): HudModel {
    const window = visible();

    return hudModel(window, strongholdIds(window), selection);
  }

  /** The ground this Faction knows: around the settlements it holds, and nowhere else. */
  function readFog(): FogGrid {
    return knowledgeOf(
      visible().settlements.map((settlement) => ({ x: settlement.x, y: settlement.y })),
      KNOWLEDGE_RADIUS,
    );
  }

  /** The minimap, through the fog, with the camera marked. */
  function readMinimap(): ReturnType<typeof minimapPlate> {
    return minimapPlate(match.state.world.map, readFog(), options.viewport());
  }

  /** Both plates, and a frame drawn. */
  function repaint(): void {
    model = readModel();
    layer.panels(model, options.size);
    minimap = readMinimap();
    layer.minimap(model, minimap, options.size);
    options.stage.render();
  }

  /** The settlement ids that are Strongholds, which the Observation does not say and the map does. */
  function strongholdIds(window: EconomyVisible): readonly number[] {
    const sites = match.state.world.map.strongholds;

    return window.settlements
      .filter((settlement) => sites.some((site) => site.x === settlement.x && site.y === settlement.y))
      .map((settlement) => settlement.id);
  }
}
