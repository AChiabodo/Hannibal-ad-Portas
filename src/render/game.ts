/**
 * The running game page: a Match, its interface, the men on the map and the loop
 * that turns one into the other (tickets B7, C2).
 *
 * B7 opened a Match behind an interface; C2 puts an army on the map and a hand
 * on it. The page still reads its own Faction's **Observation** — never the
 * world — and the two things that changed are what that Observation now draws
 * and what the Player can do about it:
 *
 * - `render/squads.ts` composes each Squad's men from the shape the Observation
 *   reports, and `render/squad-layer.ts` puts one sprite per Squad on the map;
 * - `input/human.ts` is the fourth Controller: a pointer and a keyboard emit
 *   `move`, `attackMove`, `hold`, `withdraw`, `formation` and `group` Commands
 *   through the same seam a machine uses.
 *
 * ## The clock, and the one place wall time is allowed
 *
 * `sim/` may not read a wall clock (ADR-0006), so the page is where real time
 * lives: a `requestAnimationFrame` loop measures how long the last frame took
 * and asks `pacing.ticksFor` how many whole ticks that is worth. Pausing, the
 * three speeds and the orders held during a pause are all B5's, and this module
 * only drives them. `advance` steps ticks without any wall time at all, which is
 * how a browser test watches a Squad march instead of waiting for it.
 *
 * A frame that arrives after a long absence — a background tab, a stalled
 * renderer — is clamped to a quarter of a second's worth of ticks. The clamp is
 * not a design decision about the game: it is the difference between a tab that
 * was hidden for an hour and an hour of Match, which is a Match nobody asked to
 * play.
 *
 * ## What the Faction knows
 *
 * The fog the minimap is drawn through, and the fog drawn over the theatre, come
 * from the eyes this Faction actually has: its settlements' watch and the men it
 * is marching (`eyesOfEconomy`, B4's radii). Every tick the page compares those
 * eyes with the ones it last saw and tells `boot.ts` when they move, so what a
 * Player can see follows the Squads they are commanding — and it is the same
 * list, not a second opinion about it.
 *
 * ## Where the army comes from
 *
 * A Player needs an army to command, and C2 is not the ticket that lets them
 * raise one by hand (that is the interface's next job). So the page **musters**
 * one at its Stronghold: real Squads of real types, with the morale and the
 * Payroll their type gives them (`musterSquad`, C1's scenario door), placed on
 * the free tiles below the Stronghold. It costs the economy nothing, which is
 * what a scenario is — the HUD's treasury and stocks are the economy's own, and
 * nothing here pretends the army was recruited.
 */
import { type Container } from 'pixi.js';
import { pixelAt, type Rgba } from '../art/pixel-buffer.ts';
import { validateCommand, type Command, type Formation } from '../sim/command.ts';
import { ForeignCommandError } from '../sim/driver.ts';
import {
  economyMatchRules,
  eyesOfEconomy,
  observeEconomy,
  type EconomyVisible,
  type EconomyWorld,
  type VisibleSquad,
} from '../sim/economy-match.ts';
import type { Faction } from '../sim/faction.ts';
import { MAP_HEIGHT, MAP_WIDTH } from '../sim/map.ts';
import { createMatch, type Match } from '../sim/match.ts';
import type { Observation } from '../sim/observation.ts';
import { createPacing, type Speed } from '../sim/pacing.ts';
import type { LoggedCommand } from '../sim/replay.ts';
import { requireTickCount } from '../sim/ticks.ts';
import type { Eye, FogView, Knowledge } from '../sim/fog.ts';
import { knows } from '../sim/fog.ts';
import {
  NOTHING_SELECTED,
  boxBetween,
  selectAt,
  selectIn,
  selectSettlement,
  type PickRect,
  type Pickable,
  type Selection as PlayerSelection,
} from '../input/selection.ts';
import { createHuman, type HumanController } from '../input/human.ts';
import { hudLayout, hudModel, hitTest, type HudModel, type HudSize, type Rect, type RowRect, type Selection } from '../ui/hud.ts';
import { minimapPlate, type ViewportRect } from '../ui/minimap.ts';
import { createHudLayer, type HudLayer } from './hud.ts';
import { screenToStage, type Camera } from './camera.ts';
import { createSquadLayer, type SquadLayer } from './squad-layer.ts';
import { blockPlacement, blockSize } from './squads.ts';
import { tileAt, tilePixel } from './terrain.ts';
import { VIEWED_FACTION } from './view.ts';
import type { PixelPoint, Stage } from './stage.ts';
import { musterOpeningArmy } from './opening.ts';

/**
 * The Faction the page plays, and the only Faction whose Observation it reads.
 *
 * `render/view.ts`'s `VIEWED_FACTION`, and not a second constant: the Faction
 * whose fog is drawn and the Faction a Player commands are one choice, and the
 * day a Match can be started as Carthage both move together.
 */
export const PLAYER_FACTION: Faction = VIEWED_FACTION;

/** The longest a single frame may pay for: a background tab does not owe the Match an hour. */
const FRAME_BUDGET_MS = 250;

/** How many Commands the page keeps for its own inspection: a window, not a recorded Match. */
const APPLIED_LIMIT = 128;

/** A Squad, as the page reports it: what the Observation says, and where it is drawn. */
export interface SquadReport extends VisibleSquad {
  /** The theatre rectangle its men are drawn in, which is the rectangle a click picks. */
  readonly rect: PickRect;
}

/** What the page tells a test or an agent about the game it is playing. */
export interface GameHooks {
  /** The HUD's own model: the words and figures, in Italian. */
  hud(): HudModel;
  /** What the panel is showing, or `null`. */
  selection(): PlayerSelection;
  /** Selects a settlement or a Squad as the panel does, or clears it with `null`. */
  select(selection: Selection | null): void;
  /** Every rectangle the interface covers, which is what a test must not read the theatre through. */
  hudRects(): readonly Rect[];
  /** Where each selectable row stands, so that a test can press the row a Player would. */
  hudRows(): readonly RowRect[];
  /** The Faction's own Squads, with the rectangle each is drawn in. */
  squads(): readonly SquadReport[];
  /** Picks whatever is under a screen point — one click, with or without a shift. */
  selectAt(screenX: number, screenY: number, additive?: boolean): void;
  /** Picks every Squad a box dragged between two screen points touches. */
  selectIn(fromX: number, fromY: number, toX: number, toY: number, additive?: boolean): void;
  /** Gives the selected Squads a `move` or an `attackMove` to the tile under a screen point. */
  orderAt(kind: 'move' | 'attackMove', screenX: number, screenY: number): boolean;
  /** Gives the selected Squads an order that needs no map point. */
  orderNow(kind: 'hold' | 'withdraw'): boolean;
  /** Sets the shape the selected Squads hold. */
  setFormation(shape: Formation): boolean;
  /** Binds the selected Squads to a control group. */
  bindGroup(index: number): boolean;
  /** Picks the Squads a control group holds, as pressing its digit does. */
  recallGroup(index: number): boolean;
  /** The Squads a control group holds. */
  groupOf(index: number): readonly number[];
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
  knowledge(): readonly Knowledge[];
  /**
   * Shows or hides the Squads' blocks.
   *
   * A debugging lens, for the pixel comparisons that are about the theatre and
   * the fog rather than about the army standing on them. It changes nothing
   * about the Match — the men are still there, and no Controller can see
   * through it — so it is a view hook and not a Command.
   */
  showSquads(visible: boolean): void;
  /**
   * The Commands the page has applied lately, stamped with the tick, oldest
   * first: the beginning of the log a replay is made of (E2).
   *
   * Bounded, because a page left open for an hour must not grow a log nobody
   * asked for. It is here so that "this click issued a real Command" is
   * something a test can read rather than infer from what moved — which matters
   * for the Commands whose effect is a later ticket's (a `withdraw` is obeyed by
   * C3, and it is still a Command today).
   */
  applied(): readonly LoggedCommand<Command>[];
}

/** The running game: its hooks, and the two calls that redraw it. */
export interface Game {
  readonly hooks: GameHooks;
  /** Recomposes the interface, the men and the minimap from the Match as it stands. */
  sync(): void;
  /** Recomposes only the minimap, which is all a camera move changes. */
  syncMinimap(): void;
  /** Starts the real-time loop. Idempotent. */
  start(): void;
  /** Stops it. Idempotent. */
  stop(): void;
}

/** What a game needs to exist: a stage, a seed, the viewport, the camera and the fog. */
export interface GameOptions {
  readonly stage: Stage;
  readonly seed: number;
  readonly size: HudSize;
  /** The container the camera is applied to: where the theatre is drawn, and where the men go. */
  readonly world: Container;
  /** What the camera is showing, in stage pixels, read fresh on every redraw. */
  readonly viewport: () => ViewportRect;
  /** Where the camera is, for turning a screen point into a tile and back. */
  readonly camera: () => Camera;
  /**
   * What the Faction knows of the theatre, read fresh on every redraw.
   *
   * B4's own fog, which the page owns and refreshes: the HUD is a second drawing
   * of the object the theatre is veiled with, and not a second opinion about it.
   */
  readonly fog: () => FogView;
  /**
   * The eyes the Faction has, whenever they move.
   *
   * The page cannot refresh its own fog from inside the loop without knowing
   * what a Squad's vision is (a rule, `sim/fog.ts`) and where its Squads are (an
   * Observation). So the loop reports the eyes and the page redraws the veil:
   * one list, and the fog sprite, the minimap and the rules cannot disagree.
   */
  readonly vision: (eyes: readonly Eye[]) => void;
}

/**
 * Opens the Match and puts its interface and its army on the stage.
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
  const human: HumanController = createHuman(PLAYER_FACTION);
  const pacing = createPacing();
  const player = pacing.wrap(human);

  const layer: HudLayer = createHudLayer(options.stage);
  const field: SquadLayer = createSquadLayer(options.world);

  let running = false;
  let lastFrame = 0;
  let scheduled: number | null = null;
  let seenEyes = '';
  const applied: LoggedCommand<Command>[] = [];

  // The army first, then the eyes it gives the Faction, and only then a picture:
  // the fog is what the minimap is drawn through, so a minimap composed before
  // the fog existed would be a corner of the screen that quietly lied for one
  // frame.
  musterOpeningArmy(match.state.world, PLAYER_FACTION);
  reportVision(match.state.world);

  let model = readModel();
  let minimap = readMinimap();

  repaint();

  const hooks: GameHooks = {
    hud: () => model,
    selection: () => human.selection,
    select: (next) => {
      human.select(asPicked(next));
      repaint();
    },
    hudRects: () => {
      const layout = hudLayout(model, options.size);
      return [layout.bar, layout.list, layout.detail, layout.minimap];
    },
    hudRows: () => hudLayout(model, options.size).rows,
    squads: () => squadReports(),
    selectAt: (x, y, additive = false) => {
      pickAt(x, y, additive);
    },
    selectIn: (fromX, fromY, toX, toY, additive = false) => {
      pickInBox(fromX, fromY, toX, toY, additive);
    },
    orderAt: (kind, x, y) => orderAt(kind, x, y),
    orderNow: (kind) => human.order({ kind }) && repainted(),
    setFormation: (shape) => human.order({ kind: 'formation', formation: shape }) && repainted(),
    bindGroup: (index) => human.bindGroup(index) && repainted(),
    recallGroup: (index) => human.recallGroup(index) && repainted(),
    groupOf: (index) => human.groupOf(index),
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
    showSquads: (visible) => {
      field.setVisible(visible === true);
      repainted();
    },
    applied: () => [...applied],
    knowledge: () => {
      const fog = options.fog();
      const states: Knowledge[] = [];

      for (let y = 0; y < MAP_HEIGHT; y += 1) {
        for (let x = 0; x < MAP_WIDTH; x += 1) states.push(knows(fog, x, y));
      }

      return states;
    },
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
        const command = validate(emitted);
        commands.push(command);
      }

      const deciding = match.state.tick;
      match.step(commands);
      for (const command of commands) applied.push({ tick: deciding, command });
      if (applied.length > APPLIED_LIMIT) applied.splice(0, applied.length - APPLIED_LIMIT);
      reportVision(match.state.world);
    }
  }

  /** A Controller's Command, read at the seam: the vocabulary, and whose it is. */
  function validate(emitted: Command): Command {
    const command = validateCommand(emitted);
    if (command.faction !== PLAYER_FACTION) {
      throw new ForeignCommandError(PLAYER_FACTION, command.faction);
    }

    return command;
  }

  /** The Faction's window on the economy, which is the only thing the interface reads. */
  function visible(): EconomyVisible {
    return observeEconomy(match.state.world, PLAYER_FACTION);
  }

  /** The Faction's Squads, each with the rectangle its men are drawn in. */
  function squadReports(): readonly SquadReport[] {
    return visible().squads.map((squad) => ({
      ...squad,
      rect: rectOf(squad),
    }));
  }

  /** The rectangle one Squad's block occupies, in theatre pixels. */
  function rectOf(squad: VisibleSquad): PickRect {
    const shape = { men: squad.men, formation: squad.formation, facing: squad.facing };
    const at = blockPlacement(tilePixel(squad.x, squad.y), shape);
    const size = blockSize(shape);

    return { x: at.x, y: at.y, width: size.width, height: size.height };
  }

  /** The HUD's model, with the panel's selection and every picked Squad. */
  function readModel(): HudModel {
    const window = visible();

    return hudModel(window, strongholdIds(window), panelSelection(), human.selection.squads);
  }

  /** What the panel is showing: the picked settlement, or the first Squad that was picked. */
  function panelSelection(): Selection | null {
    if (human.selection.settlement !== null) {
      return { kind: 'settlement', id: human.selection.settlement };
    }

    const first = human.selection.squads[0];

    return first === undefined ? null : { kind: 'squad', id: first };
  }

  /** The minimap, through the fog the page owns, with the camera marked. */
  function readMinimap(): ReturnType<typeof minimapPlate> {
    return minimapPlate(match.state.world.map, options.fog(), options.viewport());
  }

  /** Both plates, every block, and a frame drawn. */
  function repaint(): void {
    model = readModel();
    layer.panels(model, options.size);
    field.update({
      squads: visible().squads,
      selected: human.selection.squads,
      tick: match.state.tick,
      faction: PLAYER_FACTION,
    });
    minimap = readMinimap();
    layer.minimap(model, minimap, options.size);
    options.stage.render();
  }

  /** `repaint`, for a hook that only needs to say whether it did anything. */
  function repainted(): true {
    repaint();
    return true;
  }

  /**
   * Tells the page what the Faction can see, when that has changed.
   *
   * Keyed by the eye tiles rather than by the whole list, because the radius and
   * the order never move: a veil is rebuilt when a Squad enters a tile, and not
   * on every one of the ten ticks a second the Match steps.
   */
  function reportVision(world: EconomyWorld): void {
    const eyes = eyesOfEconomy(world, PLAYER_FACTION);
    const key = eyes.map((eye) => `${String(eye.x)},${String(eye.y)}`).join(';');
    if (key === seenEyes) return;

    seenEyes = key;
    options.vision(eyes);
  }

  /** The selection as the interface names one, which is what a click on a row knows. */
  function asPicked(selection: Selection | null): PlayerSelection {
    if (selection === null) return NOTHING_SELECTED;
    if (selection.kind === 'settlement') return selectSettlement(selection.id);

    return { squads: [selection.id], settlement: null };
  }

  /** A click at a screen point: the interface's rows first, then the men on the map. */
  function pickAt(screenX: number, screenY: number, additive: boolean): void {
    const row = hitTest(model, options.size, screenX, screenY);
    if (row !== null) {
      human.select(asPicked(row));
      repaint();
      return;
    }

    const at = screenToStage(options.camera(), screenX, screenY);
    human.select(selectAt(human.selection, pickables(), at, additive));
    repaint();
  }

  /** Whether a screen point falls on one of the interface's panels rather than on the theatre. */
  function underInterface(x: number, y: number): boolean {
    const layout = hudLayout(model, options.size);

    return [layout.bar, layout.list, layout.detail, layout.minimap].some(
      (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
    );
  }

  /** A drag between two screen points: every block it touched. */
  function pickInBox(fromX: number, fromY: number, toX: number, toY: number, additive: boolean): void {
    const camera = options.camera();
    const box = boxBetween(screenToStage(camera, fromX, fromY), screenToStage(camera, toX, toY));

    human.select(selectIn(human.selection, pickables(), box, additive));
    repaint();
  }

  /**
   * The blocks a pick can land on: the Faction's own Squads, the rectangles they
   * are drawn in, and the row they stand on — which is the order the layer draws
   * them in, so the one a Player sees on top is the one the click takes.
   */
  function pickables(): readonly Pickable[] {
    return squadReports().map((squad) => ({ id: squad.id, rect: squad.rect, depth: squad.y }));
  }

  /** An order to a screen point, given to the Squads picked when the Player clicked. */
  function orderAt(kind: 'move' | 'attackMove', screenX: number, screenY: number): boolean {
    // A right click on the interface is a click on the interface: the panels are
    // drawn over the theatre, and an order that landed on the tile behind a
    // panel would be a destination nobody asked for.
    if (underInterface(screenX, screenY)) return false;

    const at = screenToStage(options.camera(), screenX, screenY);
    const tile = tileAt(at.x, at.y);
    if (tile.x < 0 || tile.y < 0 || tile.x >= MAP_WIDTH || tile.y >= MAP_HEIGHT) return false;

    return human.order({ kind, x: tile.x, y: tile.y }) && repainted();
  }

  /** The settlement ids that are Strongholds, which the Observation does not say and the map does. */
  function strongholdIds(window: EconomyVisible): readonly number[] {
    const sites = match.state.world.map.strongholds;

    return window.settlements
      .filter((settlement) => sites.some((site) => site.x === settlement.x && site.y === settlement.y))
      .map((settlement) => settlement.id);
  }
}
