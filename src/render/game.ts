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
 * C3 adds the dead: the men a fight costs are laid on the field as residue
 * (`render/corpses.ts`, `sim/residue.ts`), drawn under the living and swept away
 * after their thirty seconds. They are read from the world's residue and never
 * from an Observation, because a corpse is drawing and nothing else.
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
 * The Match now starts from `siegeMatchRules`, with no demonstration army.
 * `input/match-host.ts` asks both Controllers in Faction order and validates
 * their Commands. The interface reads only its chosen Faction's Observation.
 */
import { type Container } from 'pixi.js';
import { pixelAt, type Rgba } from '../art/pixel-buffer.ts';
import { type Command, type Formation } from '../sim/command.ts';
import { type MatchResult } from '../sim/driver.ts';
import {
  eyesOfEconomy,
  type EconomyVisible,
  type EconomyWorld,
  type VisibleSquad,
} from '../sim/economy-match.ts';
import { factionCode, type Faction } from '../sim/faction.ts';
import { MAP_HEIGHT, MAP_WIDTH } from '../sim/map.ts';
import { type Speed } from '../sim/pacing.ts';
import { corpsesOf, type Corpse } from '../sim/residue.ts';
import { MATCH_TICKS } from '../sim/season.ts';
import { visibleCorpses } from './corpses.ts';
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
import { createBrowserMatch, type BrowserMatchOptions } from '../input/match-host.ts';
import type { MatchConfiguration } from '../input/match-setup.ts';
import { type SiegeVisible } from '../sim/siege.ts';
import { hudLayout, hudModel, hitTest, type HudLayout, type HudModel, type HudSize, type Rect, type RowRect, type Selection } from '../ui/hud.ts';
import { minimapPlate, type ViewportRect, type KnownMinimapSite } from '../ui/minimap.ts';
import { createHudLayer, type HudLayer } from './hud.ts';
import { screenToStage, type Camera } from './camera.ts';
import { textureOf } from './stage.ts';
import { createSquadLayer, type SquadLayer } from './squad-layer.ts';
import { blockPlacement, blockSize } from './squads.ts';
import { tileAt, tilePixel } from './terrain.ts';
import { VIEWED_FACTION } from './view.ts';
import type { PixelPoint, Stage } from './stage.ts';
import { DEFAULT_UI_PREFERENCES, loadUiPreferences, saveUiPreferences, type UiPreferences } from '../ui/preferences.ts';
import { matchMenu, desktopMatchMenu, menuPlate, contains, type MatchMenu } from '../ui/match-menu.ts';
import { message, translate } from '../ui/strings.ts';

/** Fixture/default Faction only; each running Match uses its setup configuration. */
export const PLAYER_FACTION: Faction = VIEWED_FACTION;

/** The longest a single frame may pay for: a background tab does not owe the Match an hour. */
const FRAME_BUDGET_MS = 250;

/** A Squad, as the page reports it: what the Observation says, and where it is drawn. */
export interface SquadReport extends VisibleSquad {
  /** The theatre rectangle its men are drawn in, which is the rectangle a click picks. */
  readonly rect: PickRect;
}

/**
 * Everything the running page believes, as one plain-data copy (ticket E4).
 *
 * This is what `state()` hands an inspector: the whole of what a Player can see
 * and what the page has done with it, in one object rather than a handful of calls. It is
 * *data* and not a handle — the page copies it before anyone sees it — so a
 * caller may keep it, diff it, or carry it across a browser bridge, which is what
 * makes "the game exposes its state" a fact rather than a promise (ADR-0003).
 *
 * What it deliberately does not hold is the other half of what an inspector might
 * want: the world, the economy, the rules' own state, and the Commands that could
 * be issued next. A snapshot is what the Faction knows and what the page drew
 * from it — an Observation and its drawing, not a Match — so there is nothing
 * here a Controller could not have been handed, and nothing here an agent could
 * hand back as an order.
 */
export interface GameSnapshot {
  /** The tick the Match is on. */
  readonly tick: number;
  /** The tick the Match ends on, which is what `fastForward` plays it to. */
  readonly bound: number;
  /** The seed the Match was created from. */
  readonly seed: number;
  /** The Faction the page plays, and the only one whose Observation it reads. */
  readonly faction: Faction;
  /** Whether the clock is stopped (B5). */
  readonly paused: boolean;
  /** The pace the Match runs at when it is not paused. */
  readonly speed: Speed;
  /** How the Match ended, or `null` while it is still being played. */
  readonly result: MatchResult | null;
  /** The hash of the authoritative state: the fingerprint two runs can be compared on. */
  readonly hash: string;
  /** The Faction's own window on the economy: the Observation the interface reads. */
  readonly visible: SiegeVisible;
  /** The Italian interface's model, as it stands. */
  readonly hud: HudModel;
  /** What a Player has picked, which is the Player's memory and not the Match's. */
  readonly selection: PlayerSelection;
  /** The Faction's Squads, each with the rectangle its men are drawn in. */
  readonly squads: readonly SquadReport[];
  /** The dead this Faction can see: residue, drawn, faded and never hashed (C3). */
  readonly corpses: readonly Corpse[];
  /** What each tile of the theatre is known as, row-major (B4). */
  readonly knowledge: readonly Knowledge[];
  /** The Commands the page has applied lately, oldest first: a record, not a door. */
  readonly applied: readonly LoggedCommand<Command>[];
}

/** What the page tells a test or an agent about the game it is playing. */
export interface GameHooks {
  preferences(): UiPreferences;
  setUiScale(scale: number): void;
  toggleNavigator(): void;
  toggleGuide(): void;
  resetPreferences(): void;
  centerSelection(): void;
  navigateMinimap(x: number, y: number): boolean;
  doubleClickAt(x: number, y: number): void;
  /** The validated human submission surface shared by current and future panels. */
  submit(command: Command): boolean;
  configuration(): MatchConfiguration;
  matchLayout(): MatchMenu;
  restart(): void;
  newMatch(): void;
  copySeed(): Promise<boolean>;
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
  /** The exact text, controls and scrolling windows drawn by the HUD. */
  hudLayout(): HudLayout;
  /** Scrolls a HUD region by bitmap text lines; presentation only. */
  scrollHud(region: 'list' | 'detail', lines: number): void;
  /** The Faction's own Squads, with the rectangle each is drawn in. */
  squads(): readonly SquadReport[];
  /**
   * The men who have fallen lately where this Faction can see them, as residue:
   * drawn on the field, faded by their age, and never part of the Match (C3).
   *
   * The whole list is both Factions', so this is the field filtered through the
   * same fog the theatre is veiled with — a test can read what a Player is being
   * shown without a screenshot.
   */
  corpses(): readonly Corpse[];
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
  /**
   * Steps the Match a whole number of ticks without waiting for wall time.
   *
   * The debugging step: one call, exactly that many ticks, no wall clock. It
   * refuses a Match that has ended and a count that would run past the bound,
   * because a step that silently did half of what it was asked is a step a test
   * would have to check twice — `fastForward` is how a caller asks for the end.
   *
   * @throws RangeError when the count is not a whole number of ticks, when the
   *   Match has already ended, or when the count would run past its bound.
   */
  advance(ticks: number): void;
  /** The tick the Match ends on: its bound, and how far an inspector can fast-forward. */
  bound(): number;
  /** How the Match ended, or `null` while it is still being played. */
  result(): MatchResult | null;
  /** Everything the page believes, as one plain-data copy (E4). */
  state(): GameSnapshot;
  /** The fingerprint of the authoritative state, which is what two runs can be compared on. */
  hash(): string;
  /**
   * Plays the Match to its end without waiting for wall time, and says how it ended.
   *
   * This is the fast-forward the ticket asks for: the wall clock is skipped
   * rather than accelerated, so a whole three-game-year Match is played in the
   * time the rules take and two runs of it are the same Match on the same hash.
   * A Match that has already ended answers with the ending it had.
   */
  fastForward(): MatchResult;
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
   * for the Commands whose effect is a rule somebody else owns (a `withdraw` is
   * obeyed by combat, and the log says it was issued whatever happened next).
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
  readonly relayout?: (preferences: UiPreferences) => void;
  readonly centerOn?: (x: number, y: number) => void;
  readonly faction?: Faction;
  readonly difficulty?: MatchConfiguration['difficulty'];
  readonly rules?: BrowserMatchOptions['rules'];
  readonly opponent?: BrowserMatchOptions['opponent'];
  readonly restart?: () => void;
  readonly newMatch?: () => void;
  readonly ended?: () => void;
  /** A composed visual fixture can omit navigation chrome. Normal Matches always show it. */
  readonly sessionControls?: boolean;
  readonly stage: Stage;
  readonly seed: number;
  readonly size: HudSize;
  /** The container the camera is applied to: where the theatre is drawn, and where the men go. */
  readonly world: Container;
  /** What the camera is showing, in stage pixels, read fresh on every redraw. */
  readonly viewport: (layout?: HudLayout) => ViewportRect;
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
  const config: MatchConfiguration = { seed: options.seed, faction: options.faction ?? PLAYER_FACTION,
    difficulty: options.difficulty ?? 'centurio' };
  const faction = config.faction;
  const host = createBrowserMatch({ ...config, rules: options.rules, opponent: options.opponent });
  const match = host.match;
  const human = host.human;
  const pacing = host.pacing;

  const layer: HudLayer = createHudLayer(options.stage);
  const field: SquadLayer = createSquadLayer(options.world);
  const menu = options.stage.spriteOf(menuPlate(options.size, matchMenu(options.size, 0, config, 1, null)));
  options.stage.root.addChild(menu);
  menu.visible = options.sessionControls !== false;
  let sessionOpen = false;
  let resultDismissed = false;
  let navigatorExpanded = false;
  let notice = '';
  const desktop = options.sessionControls !== false;
  let preferences = desktop ? loadUiPreferences() : { ...DEFAULT_UI_PREFERENCES };

  let running = false;
  let lastFrame = 0;
  let scheduled: number | null = null;
  let seenEyes = '';
  let listOffset = 0;
  let detailOffset = 0;
  let detailSelection: Selection | null = null;
  const applied: LoggedCommand<Command>[] = [];

  /**
   * The tick the page's Match ends on: a Match's own horizon, the same three game
   * years a headless Match runs to (ADR-0022), so that a whole Match can be played
   * through the page in the time the rules take.
   */
  const BOUND = MATCH_TICKS;

  /** How the Match ended, or `null` while it is on. Every stepper stops here. */
  let result: MatchResult | null = host.result;

  // The rules first, then the eyes the Faction has, and only then a picture:
  // the fog is what the minimap is drawn through, so a minimap composed before
  // the fog existed would be a corner of the screen that quietly lied for one
  // frame.
  reportVision(match.state.world);

  let model = readModel();
  let minimap = readMinimap();
  let dead: readonly Corpse[] = readCorpses();

  repaint();

  const hooks: GameHooks = {
    preferences: () => ({ ...preferences }),
    setUiScale: (scale) => {
      if (![1, 2, 3].includes(scale)) throw new RangeError('UI scale must be 1, 2 or 3');
      updatePreferences({ ...preferences, uiScale: scale });
    },
    toggleNavigator: () => {
      const show = hudLayout(model, options.size).list.width === 0;
      navigatorExpanded = show && (model.view.scaleWarning === true || model.view.smallWindow === true);
      updatePreferences({ ...preferences, navigator: show });
    },
    toggleGuide: () => updatePreferences({ ...preferences, guideDismissed: !preferences.guideDismissed }),
    resetPreferences: () => {
      navigatorExpanded = false;
      updatePreferences({ ...DEFAULT_UI_PREFERENCES });
    },
    centerSelection: () => {
      const selected = panelSelection();
      const window = visible();
      const site = selected?.kind === 'settlement' ? window.settlements.find((s) => s.id === selected.id)
        : window.squads.find((s) => s.id === selected?.id);
      if (site) { const at = tilePixel(site.x, site.y); options.centerOn?.(at.x, at.y); }
    },
    navigateMinimap: (x, y) => {
      const rect = hudLayout(model, options.size).minimap;
      if (!contains(rect, x, y)) return false;
      const scale = desktop ? preferences.uiScale : 1;
      const tileX = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor((x - rect.x) / scale) - 2));
      const tileY = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor((y - rect.y) / scale) - 2));
      const at = tilePixel(tileX, tileY);
      options.centerOn?.(at.x, at.y);
      return true;
    },
    doubleClickAt: (x, y) => {
      if (menu.visible && contains(readMenu().rect, x, y)) return;
      if (hitTest(model, options.size, x, y) !== null) hooks.centerSelection();
    },
    submit: (command) => human.submit(command),
    configuration: () => ({ ...config }),
    matchLayout: () => readMenu(),
    restart: () => options.restart?.(),
    newMatch: () => options.newMatch?.(),
    copySeed: async () => {
      try {
        await navigator.clipboard.writeText(String(config.seed));
        notice = translate('match.copied');
        repaint();
        return true;
      } catch {
        notice = message('match.copyFailed', { seed: config.seed });
        repaint();
        return false;
      }
    },
    hud: () => model,
    selection: () => human.selection,
    select: (next) => {
      human.select(asPicked(next));
      repaint();
    },
    hudRects: () => {
      const layout = hudLayout(model, options.size);
      return [layout.bar, layout.list, layout.detail, layout.minimap, ...(menu.visible ? [readMenu().rect] : [])];
    },
    hudRows: () => hudLayout(model, options.size).rows,
    hudLayout: () => hudLayout(model, options.size),
    scrollHud: (region, lines) => {
      if (!Number.isSafeInteger(lines)) throw new RangeError('HUD scroll must be whole text lines');
      const layout = hudLayout(model, options.size);
      if (region === 'list') listOffset = layout.listScroll.offset + lines;
      else detailOffset = layout.detailScroll.offset + lines;
      repaint();
    },
    squads: () => squadReports(),
    corpses: () => dead,
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
      const count = requireTickCount(ticks, 'ticks', 0);
      requireUnended();

      if (match.state.tick + count > BOUND) {
        throw new RangeError(
          `advancing ${String(count)} ticks from tick ${String(match.state.tick)} would run past the ` +
            `Match's end of ${String(BOUND)} ticks: fast-forward to it instead`,
        );
      }

      step(count);
      repaint();
    },
    bound: () => BOUND,
    result: () => result,
    state: () => snapshot(),
    hash: () => match.hash(),
    fastForward: () => playToEnd(),
    pause: () => {
      pacing.pause();
      repaint();
    },
    resume: () => {
      if (result !== null) return;
      pacing.resume();
      lastFrame = performance.now();
      repaint();
    },
    paused: () => pacing.paused,
    speed: () => pacing.speed,
    setSpeed: (speed) => {
      if (result !== null) return;
      pacing.setSpeed(speed);
      repaint();
    },
    minimapSamples: (points) => points.map(([x, y]) => pixelAt(minimap, x, y)),
    showSquads: (visible) => {
      field.setVisible(visible === true);
      repainted();
    },
    applied: () => [...applied],
    knowledge: () => knowledgeStates(),
  };

  return {
    hooks,
    sync: repaint,
    syncMinimap: () => {
      minimap = readMinimap();
      layer.minimap(model, minimap, options.size);
    },
    start: startLoop,
    stop: stopLoop,
  };

  function updatePreferences(next: UiPreferences): void {
    preferences = next;
    saveUiPreferences(next);
    options.relayout?.(next);
    repaint();
  }

  /** Starts the real-time loop, unless it is already running or the Match is over. */
  function startLoop(): void {
    if (running || result !== null) return;

    running = true;
    lastFrame = performance.now();
    scheduled = requestAnimationFrame(frame);
  }

  /** Stops it. Idempotent. */
  function stopLoop(): void {
    running = false;
    if (scheduled !== null) cancelAnimationFrame(scheduled);
    scheduled = null;
  }

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

    const before = match.state.tick;
    host.elapse(elapsed, () => reportVision(match.state.world));
    if (before !== match.state.tick) {
      applied.splice(0, applied.length, ...host.applied(faction));
      settle();
      repaint();
    }

    // A tick that ended the Match stopped the loop from inside `step`, and a frame
    // scheduled after that would be one asking a finished Match for another one.
    if (result === null) scheduled = requestAnimationFrame(frame);
  }

  /**
   * Steps the Match a whole number of ticks, stopping at its end.
   *
   * A tick that ends the Match — the rules' verdict, or the bound — is the last
   * one stepped: `settle` is asked after every tick, so a page left running, or a
   * test fast-forwarding it, cannot step a Match past the tick it ended on.
   */
  function step(ticks: number): void {
    if (result !== null) return;
    host.advance(Math.min(ticks, BOUND - match.state.tick), () => reportVision(match.state.world));
    applied.splice(0, applied.length, ...host.applied(faction));
    settle();
  }

  /**
   * Ends the Match when the rules decide it or the clock runs out.
   *
   * The verdict is asked before the bound, in the order the headless driver asks
   * it, so a Match decided on its very last tick reports the victory rather than
   * the clock. Ending also stops the loop: a page must not keep presenting a
   * Match that is over, and a Match that is over must not be stepped again.
   */
  function settle(): void {
    if (result !== null) return;

    result = host.result;
    if (result === null) return;
    options.ended?.();
    stopLoop();
  }

  /**
   * Plays the Match to its end without waiting for wall time, and redraws it once.
   *
   * The fast-forward E4 asks for, and the one an agent inspecting a page plays a
   * whole Match with: skipping the wall clock rather than accelerating it means
   * the answer is the rules' and not the frame rate's.
   */
  function playToEnd(): MatchResult {
    step(BOUND - match.state.tick);
    repaint();

    if (result === null) {
      // Unreachable by construction — `step` settles on its last tick — and a
      // refusal rather than a type assertion, so a broken bound is never
      // reported as an ending that did not happen.
      throw new Error(`the Match did not end at its bound of ${String(BOUND)} ticks`);
    }

    return result;
  }

  /**
   * @throws RangeError when the Match has already ended: nothing steps a Match
   *   past the tick it ended on.
   */
  function requireUnended(): void {
    if (result === null) return;

    throw new RangeError(`the Match ended on tick ${String(result.tick)}, and cannot be advanced further`);
  }

  /**
   * Everything the page believes, as one copy (E4).
   *
   * Copied through `structuredClone` rather than assembled as a shallow record,
   * because the point of a snapshot is that an inspector may keep it: a caller
   * that wrote through what it was handed would be reaching into the Match, the
   * interface or the fog, which is exactly what the seam forbids. It is plain
   * data for the same reason — it crosses into a test or into an agent, and
   * nothing that crosses may be a function or a handle.
   */
  function snapshot(): GameSnapshot {
    return structuredClone({
      tick: match.state.tick,
      bound: BOUND,
      seed: options.seed,
      faction: faction,
      paused: pacing.paused,
      speed: pacing.speed,
      result,
      hash: match.hash(),
      visible: visible(),
      hud: model,
      selection: human.selection,
      squads: squadReports(),
      corpses: dead,
      knowledge: knowledgeStates(),
      applied: [...applied],
    });
  }

  /** What each tile of the theatre is known as, row-major, as B4's fog holds it. */
  function knowledgeStates(): readonly Knowledge[] {
    const fog = options.fog();
    const states: Knowledge[] = [];

    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) states.push(knows(fog, x, y));
    }

    return states;
  }

  /** The Faction's window on the economy, which is the only thing the interface reads. */
  function visible(): SiegeVisible {
    return host.observe();
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
    // The block is drawn from the figures the Squad is drawn as, which is its
    // strength for a body of men and one for a beast (C4).
    const shape = { men: squad.figures, formation: squad.formation, facing: squad.facing };
    const at = blockPlacement(tilePixel(squad.x, squad.y), shape);
    const size = blockSize(shape);

    return { x: at.x, y: at.y, width: size.width, height: size.height };
  }

  /** The HUD's model, with the panel's selection and every picked Squad. */
  function readModel(): HudModel {
    const window = visible();
    const next = hudModel(window, strongholdIds(window), panelSelection(), human.selection.squads,
      { ended: result !== null, paused: pacing.paused, listOffset, detailOffset });
    if (next.selected?.id !== detailSelection?.id || next.selected?.kind !== detailSelection?.kind) detailOffset = 0;
    detailSelection = next.selected;
    return { ...next, view: { ended: result !== null, paused: pacing.paused, listOffset, detailOffset,
      desktop, navigatorExpanded, sessionOpen, speed: pacing.speed, ...preferences, tick: match.state.tick,
      scaleWarning: desktop && (windowSize().width < 640 * preferences.uiScale || windowSize().height < 360 * preferences.uiScale),
      smallWindow: desktop && (windowSize().width < 1280 || windowSize().height < 720) } };
  }

  function windowSize(): HudSize { return { width: window.innerWidth, height: window.innerHeight }; }

  /** What the panel is showing: the picked settlement, or the first Squad that was picked. */
  function panelSelection(): Selection | null {
    if (human.selection.settlement !== null) {
      return { kind: 'settlement', id: human.selection.settlement };
    }

    const first = human.selection.squads[0];

    return first === undefined ? null : { kind: 'squad', id: first };
  }

  /**
   * The men who fell where this Faction can see them: the world's residue, cut
   * down by the fog the page draws the theatre through.
   */
  function readCorpses(): readonly Corpse[] {
    return visibleCorpses(corpsesOf(match.state.world.economy, match.state.tick), options.fog());
  }

  /** The minimap, through the fog the page owns, with the camera marked. */
  function readMinimap(): ReturnType<typeof minimapPlate> {
    const window = visible();
    const ownership: KnownMinimapSite[] = window.settlements.map((site) => ({ ...site, owner: factionCode(faction) }));
    for (const contact of window.contacts) {
      if (contact.kind !== 'squad') ownership.push({ ...contact, owner: factionCode(faction === 'rome' ? 'carthage' : 'rome') });
    }
    for (const site of [...match.state.world.map.strongholds, ...match.state.world.map.settlements]) {
      if (knows(window.fog, site.x, site.y) === 2 && !ownership.some((known) => known.x === site.x && known.y === site.y)) ownership.push({ ...site, owner: -1 });
    }
    return minimapPlate(match.state.world.map, options.fog(), options.viewport(hudLayout(model, options.size)), ownership);
  }

  /** Both plates, every block, and a frame drawn. */
  function repaint(): void {
    model = readModel();
    const layout = hudLayout(model, options.size);
    listOffset = layout.listScroll.offset;
    detailOffset = layout.detailScroll.offset;
    dead = readCorpses();
    layer.panels(model, options.size);
    field.update({
      squads: visible().squads,
      selected: human.selection.squads,
      tick: match.state.tick,
      faction: faction,
      // The dead are not in the Observation — they are not state, and a
      // Faction's eyes do not report its corpses — so the page reads them from
      // the world's residue, through its own fog, which is a drawing decision
      // and nothing else. One read, which the `corpses` hook hands back too.
      corpses: dead,
    });
    minimap = readMinimap();
    layer.minimap(model, minimap, options.size);
    menu.visible = desktop && (sessionOpen || (result !== null && !resultDismissed));
    const oldMenu = menu.texture;
    menu.texture = textureOf(menuPlate(options.size, readMenu(), null, desktop ? preferences.uiScale : 1));
    oldMenu.destroy(true);
    options.stage.canvas.setAttribute('aria-label', [...layout.readouts.map(({ line }) => `${line.label} ${line.value}`), ...layout.buttons.map(({ text }) => text), ...(menu.visible ? [...readMenu().lines, ...readMenu().buttons.map(({ text }) => text)] : [])].join('. '));
    options.stage.render();
  }

  function readMenu(): MatchMenu {
    return desktop
      ? desktopMatchMenu(options.size, hudLayout(model, options.size).bar.height, config, pacing.speed, result, notice, preferences)
      : matchMenu(options.size, hudLayout(model, options.size).bar.height, config, pacing.speed, result, notice);
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
    const eyes = eyesOfEconomy(world, faction);
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
    if (hooks.navigateMinimap(screenX, screenY)) return;
    const menuButton = menu.visible ? readMenu().buttons.find(({ rect }) => contains(rect, screenX, screenY)) : undefined;
    if (menuButton !== undefined) {
      if (!menuButton.enabled) return;
      if (menuButton.action === 'restart') hooks.restart();
      else if (menuButton.action === 'new') hooks.newMatch();
      else if (menuButton.action === 'copy') void hooks.copySeed();
      else if (menuButton.action === 'scale') hooks.setUiScale(preferences.uiScale % 3 + 1);
      else if (menuButton.action === 'reset') hooks.resetPreferences();
      else if (menuButton.action === 'guide') hooks.toggleGuide();
      else if (menuButton.action === 'close') { sessionOpen = false; resultDismissed = true; repaint(); }
      else if (menuButton.speed !== undefined) hooks.setSpeed(menuButton.speed);
      return;
    }
    if (menu.visible && contains(readMenu().rect, screenX, screenY)) return;
    const layout = hudLayout(model, options.size);
    const button = layout.buttons.find(({ rect }) => containsPoint(rect, screenX, screenY));
    if (button !== undefined) {
      if (!button.enabled) return;
      if (button.action === 'pause') {
        if (pacing.paused) hooks.resume();
        else hooks.pause();
      } else if (button.action === 'session') { sessionOpen = !sessionOpen; repaint(); }
      else if (button.action === 'speed1') hooks.setSpeed(1);
      else if (button.action === 'speed2') hooks.setSpeed(2);
      else if (button.action === 'speed3') hooks.setSpeed(3);
      else if (button.action === 'center') hooks.centerSelection();
      else if (button.action === 'navigator') hooks.toggleNavigator();
      else {
        const region = button.action.startsWith('list') ? 'list' : 'detail';
        const scroll = region === 'list' ? layout.listScroll : layout.detailScroll;
        hooks.scrollHud(region, button.action.endsWith('Next') ? scroll.page : -scroll.page);
      }
      return;
    }
    const row = hitTest(model, options.size, screenX, screenY);
    if (row !== null) {
      human.select(asPicked(row));
      repaint();
      return;
    }

    if (underInterface(screenX, screenY)) return;

    const at = screenToStage(options.camera(), screenX, screenY);
    human.select(selectAt(human.selection, pickables(), at, additive));
    repaint();
  }

  /** Whether a screen point falls on one of the interface's panels rather than on the theatre. */
  function underInterface(x: number, y: number): boolean {
    const layout = hudLayout(model, options.size);

    return [layout.bar, layout.list, layout.detail, layout.minimap, ...(menu.visible ? [readMenu().rect] : [])].some(
      (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
    );
  }

  /** A drag between two screen points: every block it touched. */
  function pickInBox(fromX: number, fromY: number, toX: number, toY: number, additive: boolean): void {
    if (underInterface(fromX, fromY)) return;
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

function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}
