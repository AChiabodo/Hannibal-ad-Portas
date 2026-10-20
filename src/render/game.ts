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
import {
  attack,
  attackMove,
  assault,
  blockade,
  build,
  formation,
  garrison,
  hold,
  move,
  recruit,
  withdraw,
  type Command,
  type Formation,
} from '../sim/command.ts';
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
  pickableAt,
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
import {
  CONTROL_GROUPS,
} from '../input/human.ts';
import {
  SETTLEMENT_TABS,
  controlGroupViews,
  enemyAt,
  enemyTargets,
  garrisonReach,
  settlementAt,
  settlementTargets,
  type ControlGroupView,
  type OrderOption,
  type SettlementTab,
} from '../ui/orders.ts';
import {
  hudHit,
  hudLayout,
  hudModel,
  type HudAction,
  type HudLayout,
  type HudModel,
  type HudOrderStatus,
  type HudSize,
  type Rect,
  type RowRect,
  type Selection,
} from '../ui/hud.ts';
import { minimapPlate, type ViewportRect, type KnownMinimapSite } from '../ui/minimap.ts';
import { knownSites, siteIdentities, type KnownSite } from '../ui/sites.ts';
import { createNoticeBook, markedConditions, moraleOf, squadConditions, type Notice, type SquadCondition } from '../ui/conditions.ts';
import { forecastLine } from '../ui/forecast.ts';
import type { OrderMarkKind } from '../art/markers.ts';
import { createHudLayer, type HudLayer } from './hud.ts';
import { screenToStage, type Camera } from './camera.ts';
import { textureOf } from './stage.ts';
import { SETTLEMENT_LAYER, createSettlementLayer, type SettlementLayer } from './settlement-layer.ts';
import { siteDepth, siteRect } from './settlements.ts';
import { SQUAD_LAYER, createSquadLayer, type SquadLayer } from './squad-layer.ts';
import { blockPlacement, blockSize, visualShape } from './squads.ts';
import { tileAt, tilePixel } from './terrain.ts';
import { VIEWED_FACTION } from './view.ts';
import type { PixelPoint, Stage } from './stage.ts';
import { DEFAULT_UI_PREFERENCES, fittedUiScale, loadUiPreferences, saveUiPreferences, type UiPreferences } from '../ui/preferences.ts';
import { matchMenu, desktopMatchMenu, menuPlate, contains, type MatchMenu } from '../ui/match-menu.ts';
import { GUIDE_CLOSED, GUIDE_FIRST_ENTRY, guideNext, guidePanel, type GuideActionName, type GuideEvent, type GuideState } from '../ui/guide.ts';
import { message, translate } from '../ui/strings.ts';

/** Fixture/default Faction only; each running Match uses its setup configuration. */
export const PLAYER_FACTION: Faction = VIEWED_FACTION;

/** The longest a single frame may pay for: a background tab does not owe the Match an hour. */
const FRAME_BUDGET_MS = 250;

/**
 * Where an armed action's click landed, as the thing the Command will name.
 *
 * A closed set rather than a bag of optional fields: a `move` has a tile and no
 * settlement, an `attack` has an enemy and no tile, and the type says so.
 */
type OrderPoint =
  | { readonly kind: 'ground'; readonly x: number; readonly y: number }
  | { readonly kind: 'enemy'; readonly squad: number }
  | { readonly kind: 'settlement'; readonly settlement: number };

/** A Squad, as the page reports it: what the Observation says, and where it is drawn. */
export interface SquadReport extends VisibleSquad {
  /** The theatre rectangle its men are drawn in, which is the rectangle a click picks. */
  readonly rect: PickRect;
}

/**
 * A settlement, as the page reports it: what the Faction knows of it, and where it
 * is drawn (ticket U6).
 *
 * `rect` is the rectangle the structure is drawn in — the same one the layer blits
 * and `input/selection.ts` picks — so a test can click what a Player sees and
 * assert the two agree, instead of guessing at a tile.
 */
export interface SiteReport extends KnownSite {
  /** The theatre rectangle the structure is drawn in, which is the rectangle a click picks. */
  readonly rect: PickRect;
}

/**
 * What the theatre shows *about* one Squad, as data (#58).
 *
 * The block itself is the Observation's; this is the annotation layer's own
 * answer — which destination mark it wears, how full its Morale bar is, what
 * shapes it carries, the way it faces and which Faction's standard stands over
 * it. A test reads it instead of guessing at pixels, and the page builds it from
 * the same `render/indicators.ts` decisions the layer draws from, so what a test
 * reads and what a Player sees cannot drift apart.
 */
export interface SquadIndicator {
  /** The Squad it is about. */
  readonly id: number;
  /** Whether the Player has picked it, which is what makes it carry a full plate. */
  readonly selected: boolean;
  /** Its Morale now, and the most its type ever has. */
  readonly morale: number;
  readonly maxMorale: number;
  /** The conditions it is in, in the journal's ranking. */
  readonly conditions: readonly SquadCondition[];
  /** The way it faces, which the chevron on the ground repeats. */
  readonly facing: VisibleSquad['facing'];
  /** The destination mark it wears, or `null` when it has nowhere to go. */
  readonly orderMark: OrderMarkKind | null;
  /** Where it is walking, when it is. */
  readonly destination: { readonly x: number; readonly y: number } | null;
  /** The Faction whose standard stands above its block. */
  readonly standard: Faction;
  /**
   * What the theatre wears above the block: the full plate for a selected
   * Squad, one small condition pin for an unselected one in trouble, and nothing
   * at all for a healthy Squad nobody has picked (#58).
   */
  readonly annotation: 'plate' | 'pin' | 'none';
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

  /** Every settlement the Faction may see, each with the rectangle its structure is drawn in (U6). */
  readonly sites: readonly SiteReport[];
  /** The dead this Faction can see: residue, drawn, faded and never hashed (C3). */
  readonly corpses: readonly Corpse[];
  /** The current-Match notice journal (#58): conditions first, then events. */
  readonly notices: readonly Notice[];
  /** What the theatre annotates about each of the Faction's Squads (#58). */
  readonly indicators: readonly SquadIndicator[];
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
  /** Highlights the command under the pointer and exposes its full name/help. */
  hoverAt(x: number, y: number): void;
  /** F6 enters UI focus; Tab traverses, Enter/Space activate, Escape leaves. */
  interfaceKey(key: string, reverse?: boolean): boolean;
  /** Scrolls a HUD region by bitmap text lines; presentation only. */
  scrollHud(region: 'list' | 'detail' | 'commands' | 'notices', lines: number): void;
  /**
   * Performs a contextual action by its stable id, as pressing its button does.
   *
   * One path for every control: an offer that needs a target is **armed** here
   * and waits for the next click, and one that needs none is submitted now. Both
   * end at `human.submit`, so a button cannot become a way around the seam.
   *
   * @returns whether the action existed and was taken (armed or submitted).
   */
  perform(orderId: string): boolean;
  /** Cancels an armed action, and nothing else. @returns whether one was armed. */
  cancelTargeting(): boolean;
  /** What is armed, or `null`. */
  targeting(): string | null;
  /** Completes the armed action at a screen point. */
  targetAt(screenX: number, screenY: number): boolean;
  /** Completes an armed action at a settlement a list row named. */
  targetSettlement(settlement: number): boolean;
  /** Opens one page of a settlement's panel. */
  setTab(tab: SettlementTab): void;
  /** Picks the group an individual exception was opened from. */
  groupBack(): boolean;
  /** The Faction's own Squads, with the rectangle each is drawn in. */
  squads(): readonly SquadReport[];

  /**
   * Every settlement this Faction may see now, with the rectangle each is drawn in (U6).
   *
   * Own settlements, enemy settlements it remembers, and settlements nobody holds that it has
   * looked at: the same list the settlement layer is handed, so what a test reads is
   * what the map is showing and not a second opinion about it.
   */
  sites(): readonly SiteReport[];
  /**
   * The men who have fallen lately where this Faction can see them, as residue:
   * drawn on the field, faded by their age, and never part of the Match (C3).
   *
   * The whole list is both Factions', so this is the field filtered through the
   * same fog the theatre is veiled with — a test can read what a Player is being
   * shown without a screenshot.
   */
  corpses(): readonly Corpse[];
  /** The current-Match notice journal, newest concern first (#58). */
  notices(): readonly Notice[];
  /**
   * Centres a location-bearing notice, when the place it names is still known.
   *
   * A notice whose Squad has left the field or whose settlement the Faction no
   * longer knows is marked `lost` and answers `false`, so a stale target is
   * handled explicitly rather than centring whatever happens to share its id.
   *
   * @returns whether the page centred a place.
   */
  centerNotice(id: string): boolean;
  /** What the theatre annotates about each Squad, as the layer was handed it (#58). */
  indicators(): readonly SquadIndicator[];
  /** Whether the notice history is open. */
  noticesOpen(): boolean;
  /** Opens or closes the notice history, as its own control does. */
  toggleNotices(): void;
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
   * Shows or hides the settlements' structures.
   *
   * The same kind of lens as `showSquads`, for the same reason: the pixel
   * comparisons that ask what the *theatre* shows have to be able to take a town
   * standing on it out of the picture. Nothing about the Match changes — the
   * settlements are still there and still pickable at their own rectangles — so it is a
   * view hook and never a Command.
   */
  showSettlements(visible: boolean): void;
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
  /**
   * Whether this page is the Match's first entry (U8, Q11): the guide opens on it.
   *
   * A composed scenario is not a first entry — it arranges a state and expects a
   * test, not a Player, to read it — so only `main.ts`, the page a Player reaches
   * through setup, asks for the guide. The default is `false` for that reason.
   */
  readonly firstEntry?: boolean;
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
  const ground: SettlementLayer = createSettlementLayer(options.world);
  const field: SquadLayer = createSquadLayer(options.world);
  /** Every settlement on the theatre, by id: the map's own list, and what the minimap walks. */
  const identities = siteIdentities(match.state.world.map);
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
  let commandOffset = 0;
  let detailSelection: Selection | null = null;
  const applied: LoggedCommand<Command>[] = [];
  /** Which page of a settlement's panel is open (#55): the Player's, never the Match's. */
  let tab: SettlementTab = 'overview';
  let focusId: string | null = null;
  let hoveredOrder: string | null = null;
  /** The action waiting for a click, by its stable id, or `null`. */
  let armed: string | null = null;
  /** The last order given on this page, and whether the seam has taken it yet. */
  let submission: HudOrderStatus | null = null;
  /** The group an individual exception was opened from, so there is a way back. */
  let groupMemory: readonly number[] | null = null;
  /** Why the last action pressed is unavailable: the panel's answer to a press it could not obey. */
  let commandNotice: string | null = null;
  /** The current-Match notice journal (#58): the Player's memory, never the Match's. */
  const noticeBook = createNoticeBook();
  let notices: readonly Notice[] = [];
  /** Whether the notice history is open, and how far it is scrolled. */
  let noticesOpen = false;
  let noticeOffset = 0;
  /** The ground mark each Squad's last movement order wears (#58): the page's memory. */
  let orderMarks: Record<number, OrderMarkKind> = {};

  /**
   * The tick the page's Match ends on: a Match's own horizon, the same three game
   * years a headless Match runs to (ADR-0022), so that a whole Match can be played
   * through the page in the time the rules take.
   */
  const BOUND = MATCH_TICKS;

  /** How the Match ended, or `null` while it is on. Every stepper stops here. */
  let result: MatchResult | null = host.result;

  /**
   * The first-entry guide (U8, Q11): the Player's progress through the four acts,
   * and whether it is on screen. It opens paused on the welcome line, which is
   * the only thing it does to the clock; `guidePaused` says the guide is the one
   * holding the pause, so closing it can release a clock it stopped and never one
   * a Player did.
   */
  let guide: GuideState = desktop && options.firstEntry === true && !preferences.guideDismissed && result === null
    ? GUIDE_FIRST_ENTRY : GUIDE_CLOSED;
  let guidePaused = guide.open;
  if (guidePaused) pacing.pause();

  // The rules first, then the eyes the Faction has, and only then a picture:
  // the fog is what the minimap is drawn through, so a minimap composed before
  // the fog existed would be a corner of the screen that quietly lied for one
  // frame.
  reportVision(match.state.world);

  notices = noticeBook.read(visible(), match.state.tick);
  let model = readModel(readSites(), visible());
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
    toggleGuide: () => toggleGuide(),
    resetPreferences: () => {
      navigatorExpanded = false;
      // Resetting the *preference* is not opening the panel: the Guide returns on
      // the next first entry, and a Player who wants it now has the drawer's own
      // reopen control. Pausing a live Match from a reset would be a Match change
      // the reset control does not promise (docs/BROWSER.md).
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
      const scale = desktop ? model.view.uiScale ?? 2 : 1;
      const tileX = Math.max(0, Math.min(MAP_WIDTH - 1, Math.floor((x - rect.x) / scale) - 2));
      const tileY = Math.max(0, Math.min(MAP_HEIGHT - 1, Math.floor((y - rect.y) / scale) - 2));
      const at = tilePixel(tileX, tileY);
      options.centerOn?.(at.x, at.y);
      return true;
    },
    doubleClickAt: (x, y) => {
      if (menu.visible && contains(readMenu().rect, x, y)) return;
      if (hudHit(model, options.size, x, y)?.kind === 'selection') hooks.centerSelection();
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
      noteGuide({ kind: 'selection', what: whatIsSelected() });
      repaint();
    },
    hudRects: () => {
      const layout = hudLayout(model, options.size);
      return [...interfaceRects(layout), ...(menu.visible ? [readMenu().rect] : [])];
    },
    hudRows: () => hudLayout(model, options.size).rows,
    hudLayout: () => hudLayout(model, options.size),
    hoverAt: (x, y) => {
      const hit = hudHit(model, options.size, x, y);
      const next = hit?.kind === 'order' && !(menu.visible && contains(readMenu().rect, x, y)) ? hit.order.id : null;
      if (next === hoveredOrder) return;
      hoveredOrder = next;
      repaint();
    },
    interfaceKey: (key, reverse = false) => interfaceKey(key, reverse),
    scrollHud: (region, lines) => {
      if (!Number.isSafeInteger(lines)) throw new RangeError('HUD scroll must be whole text lines');
      const layout = hudLayout(model, options.size);
      if (region === 'list') listOffset = layout.listScroll.offset + lines;
      else if (region === 'commands') commandOffset = layout.commandScroll.offset + lines;
      else if (region === 'notices') noticeOffset = layout.noticeScroll.offset + lines;
      else detailOffset = layout.detailScroll.offset + lines;
      repaint();
    },
    perform: (orderId) => perform(orderId),
    cancelTargeting: () => cancelTargeting(),
    targeting: () => armed,
    targetAt: (screenX, screenY) => targetAt(screenX, screenY),
    targetSettlement: (settlement) => targetSettlement(settlement),
    setTab: (next) => {
      if (!SETTLEMENT_TABS.includes(next)) throw new RangeError(`"${String(next)}" is not a settlement page`);
      tab = next;
      commandOffset = 0;
      commandNotice = null;
      repaint();
    },
    groupBack: () => groupBack(),
    squads: () => squadReports(),
    corpses: () => dead,
    notices: () => [...notices],
    centerNotice: (id) => centerNotice(id),
    indicators: () => indicatorReports(),
    noticesOpen: () => noticesOpen,
    toggleNotices: () => {
      noticesOpen = !noticesOpen;
      noticeOffset = 0;
      repaint();
    },
    selectAt: (x, y, additive = false) => {
      pickAt(x, y, additive);
    },
    selectIn: (fromX, fromY, toX, toY, additive = false) => {
      pickInBox(fromX, fromY, toX, toY, additive);
    },
    orderAt: (kind, x, y) => orderAt(kind, x, y),
    orderNow: (kind) => perform(kind),
    setFormation: (shape) => perform(`formation.${shape}`),
    bindGroup: (index) => {
      const bound = human.bindGroup(index);
      if (bound) repaint();
      return bound;
    },
    recallGroup: (index) => {
      const recalled = human.recallGroup(index);
      if (recalled) { groupMemory = null; noteGuide({ kind: 'selection', what: 'squad' }); repaint(); }
      return recalled;
    },
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
      // An explicit pause is the Player's: closing the guide afterwards must not
      // release a clock the guide was not holding.
      guidePaused = false;
      pacing.pause();
      repaint();
    },
    resume: () => {
      if (result !== null) return;
      // A Player who resumes the clock has begun the Match, which is what the
      // welcome line was waiting for; the guide moves on rather than sitting on a
      // button whose effect has already happened.
      if (guide.open) guide = guideNext(guide, { kind: 'begin' });
      pacing.resume();
      guidePaused = false;
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
    showSettlements: (visible) => {
      ground.setVisible(visible === true);
      repainted();
    },
    sites: () => siteReports(),
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

  /**
   * Tells the guide about a real act, and lets it decide whether that moves on.
   *
   * The guide is told and never asked: it reads the selection and the verbs the
   * page already submitted, and `guideNext` returns the same state when the act
   * teaches it nothing new. Nothing here can issue a Command.
   */
  function noteGuide(event: GuideEvent): void {
    if (!guide.open) return;
    guide = guideNext(guide, event);
  }

  /** What the Player has picked, in the guide's own words. */
  function whatIsSelected(): 'settlement' | 'squad' | 'none' {
    if (human.selection.settlement !== null) return 'settlement';

    return human.selection.squads.length > 0 ? 'squad' : 'none';
  }

  /** Opens the guide at its welcome line, pausing a clock the guide is now holding. */
  function reopenGuide(): void {
    if (result !== null) return;
    guide = guideNext(guide, { kind: 'reopen' });
    sessionOpen = false;
    if (!pacing.paused) {
      pacing.pause();
      guidePaused = true;
    }
  }

  /** Releases the pause the Guide took, and never one a Player took. */
  function releaseGuidePause(): void {
    if (!guidePaused || result !== null) return;
    pacing.resume();
    lastFrame = performance.now();
    guidePaused = false;
  }

  /** Puts the Guide away, releasing its pause and recording the dismissal. */
  function closeGuide(event: 'skip' | 'close' = 'close'): void {
    guide = guideNext(guide, { kind: event });
    releaseGuidePause();
    updatePreferences({ ...preferences, guideDismissed: true });
  }

  /** The Guide's own three controls, pressed as its panel draws them. */
  function guideButton(action: GuideActionName): void {
    if (action === 'guideBegin') {
      guide = guideNext(guide, { kind: 'begin' });
      sessionOpen = false;
      // *Inizia* promises to resume the clock, so it does — even when the Guide
      // was reopened on a clock the Player had already paused.
      if (result === null) {
        pacing.resume();
        lastFrame = performance.now();
      }
      guidePaused = false;
      repaint();
      return;
    }

    closeGuide(action === 'guideSkip' ? 'skip' : 'close');
  }

  /** The Options menu's guide control: opens what is closed, closes what is open. */
  function toggleGuide(): void {
    if (guide.open) closeGuide();
    else {
      reopenGuide();
      updatePreferences({ ...preferences, guideDismissed: false });
    }
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
    // A finished Match belongs to its result, not to the guide: the panel is put
    // away rather than drawn over the announcement. The dismissal preference is
    // not touched, so a Player who never read it meets it again next Match.
    if (guide.open) guide = { ...guide, open: false };
    guidePaused = false;
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
      sites: siteReports(),
      corpses: dead,
      notices: [...notices],
      indicators: indicatorReports(),
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

  /**
   * What the theatre annotates about each Squad, in the same terms the layer draws.
   *
   * `orderMark` is `null` when the Squad has nowhere to go: a mark with no
   * destination would be a lie about an order. The selected flag and the
   * conditions come from the same readers the plates and pins are composed from.
   */
  function indicatorReports(): readonly SquadIndicator[] {
    return visible().squads.map((squad) => {
      const selected = human.selection.squads.includes(squad.id);
      const conditions = squadConditions(squad);

      return {
        id: squad.id,
        selected,
        morale: squad.morale,
        maxMorale: moraleOf(squad).max,
        conditions,
        facing: squad.facing,
        orderMark: squad.goal === null ? null : orderMarks[squad.id] ?? 'move',
        destination: squad.goal === null ? null : { x: squad.goal.x, y: squad.goal.y },
        standard: faction,
        annotation: selected ? 'plate' as const : markedConditions(conditions).length > 0 ? 'pin' as const : 'none' as const,
      };
    });
  }

  /**
   * Centres the place a notice names, when the Faction still knows it.
   *
   * A target that is gone — a Squad that has left the field, a settlement it no
   * longer knows — is recorded as lost and the answer is `false`: the notice says
   * so from then on instead of centring whatever else might share its id.
   */
  function centerNotice(id: string): boolean {
    const notice = notices.find((candidate) => candidate.id === id);
    if (notice === undefined || notice.target === null) return false;

    const target = notice.target;
    const observation = visible();
    const at = target.kind === 'squad'
      ? (() => {
        const squad = observation.squads.find((candidate) => candidate.id === target.id);

        return squad === undefined ? null : tilePixel(squad.x, squad.y);
      })()
      : (() => {
        const site = readSites().find((candidate) => candidate.id === target.id);

        return site === undefined ? null : tilePixel(site.x, site.y);
      })();

    if (at === null) {
      noticeBook.lose(id);
      repaint();

      return false;
    }

    options.centerOn?.(at.x, at.y);

    return true;
  }

  /** The rectangle one Squad's block occupies, in theatre pixels. */
  function rectOf(squad: VisibleSquad): PickRect {
    // The block is drawn from the figures the Squad is drawn as, which is its
    // strength for a body of men and one for a beast (C4).
    const shape = visualShape(squad);
    const at = blockPlacement(tilePixel(squad.x, squad.y), shape);
    const size = blockSize(shape);

    return { x: at.x, y: at.y, width: size.width, height: size.height };
  }

  /** The HUD's model, with the panel's selection, every picked Squad and every known settlement. */
  function readModel(known: readonly KnownSite[], observation: SiegeVisible): HudModel {
    const next = hudModel(observation, strongholdIds(observation), panelSelection(), human.selection.squads,
      { ended: result !== null, paused: pacing.paused, listOffset, detailOffset, commandOffset,
        noticesOpen, noticeOffset },
      session(observation, known));
    if (next.selected?.id !== detailSelection?.id || next.selected?.kind !== detailSelection?.kind) {
      detailOffset = 0;
      commandOffset = 0;
    }
    detailSelection = next.selected;
    return { ...next, view: { ended: result !== null, paused: pacing.paused, listOffset, detailOffset, commandOffset,
      noticesOpen, noticeOffset,
      desktop, navigatorExpanded, sessionOpen, speed: pacing.speed, ...preferences,
      uiScale: fittedUiScale(preferences.uiScale, windowSize()), tick: match.state.tick,
      scaleWarning: desktop && (windowSize().width < 640 * preferences.uiScale || windowSize().height < 360 * preferences.uiScale),
      smallWindow: desktop && (windowSize().width < 1280 || windowSize().height < 720) } };
  }

  /** What the page knows beside the Observation: its Faction, the settlements it sees and the Player's own memory. */
  function session(observation: SiegeVisible, known: readonly KnownSite[]): {
    readonly faction: Faction;
    readonly tab: SettlementTab;
    readonly armed: string | null;
    readonly pending: number;
    readonly last: HudOrderStatus | null;
    readonly groups: readonly ControlGroupView[];
    readonly backToGroup: boolean;
    readonly notice: string | null;
    readonly ended: boolean;
    readonly sites: readonly KnownSite[];
    readonly notices: readonly Notice[];
    readonly forecast: ReturnType<typeof forecastLine>;
    readonly guide: ReturnType<typeof guidePanel>;
  } {
    return {
      faction,
      tab,
      armed,
      pending: human.pending,
      last: submission === null ? null : { ...submission, status: human.pending > 0 ? 'pending' : 'applied' },
      groups: controlGroupViews(observation, boundGroups()),
      backToGroup: groupMemory !== null && human.selection.squads.length === 1,
      notice: commandNotice,
      ended: result !== null,
      sites: known,
      notices,
      forecast: forecastLine(observation, match.state.tick),
      guide: guidePanel(guide),
    };
  }

  /**
   * Every settlement this Faction may see, as `ui/sites.ts` reads its Observation and its
   * fog (ticket U6).
   *
   * One read, three users: the layer draws it, the panel opens what a click on it
   * names, and the `sites` hook hands it back to a test. There is no second list
   * anywhere, so what is drawn and what can be picked cannot drift apart.
   */
  function readSites(): readonly KnownSite[] {
    // The fog the picture is veiled with, not the Observation's copy of it: a town
    // must be drawn exactly when the ground under it is lit on the screen.
    return knownSites(identities, visible(), options.fog(), faction);
  }

  /** Every settlement the Faction may see, with the rectangle each is drawn in. */
  function siteReports(): readonly SiteReport[] {
    return readSites().map((site) => ({ ...site, rect: siteRect(site) }));
  }

  /** The control groups the Player has bound, in digit order, empty ones left out. */
  function boundGroups(): readonly { readonly index: number; readonly squads: readonly number[] }[] {
    return CONTROL_GROUPS
      .map((index) => ({ index, squads: human.groupOf(index) }))
      .filter((group) => group.squads.length > 0);
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

  /** Both plates, every block, every structure, and a frame drawn. */
  function repaint(): void {
    const known = readSites();
    const observation = visible();
    // The journal first: a notice raised on this tick is part of the frame the
    // Player is about to see, and reading it twice in one tick is harmless.
    notices = noticeBook.read(observation, match.state.tick);
    orderMarks = pruneOrderMarks(orderMarks, observation.squads);
    model = readModel(known, observation);
    const focused = interfaceControls().find(({ id }) => id === focusId);
    if (focused === undefined) focusId = null;
    model = { ...model, view: { ...model.view, focus: focused?.rect ?? null,
      hoveredOrder: focused?.id.startsWith('order:') ? focused.id.slice(6) : hoveredOrder } };
    const layout = hudLayout(model, options.size);
    listOffset = layout.listScroll.offset;
    detailOffset = layout.detailScroll.offset;
    commandOffset = layout.commandScroll.offset;
    noticeOffset = layout.noticeScroll.offset;
    dead = readCorpses();
    layer.panels(model, options.size);
    ground.update({ sites: known, selected: human.selection.settlement });
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
      orderMarks,
    });
    minimap = readMinimap();
    layer.minimap(model, minimap, options.size);
    menu.visible = desktop && (sessionOpen || (result !== null && !resultDismissed));
    const oldMenu = menu.texture;
    menu.texture = textureOf(menuPlate(options.size, readMenu(), desktop ? model.view.uiScale ?? 2 : 1, model.view.focus ?? null));
    oldMenu.destroy(true);
    options.stage.canvas.setAttribute('aria-label', [translate('ui.keyboard'), focused?.label ?? '', ...layout.readouts.map(({ line }) => `${line.label} ${line.value}`), ...layout.buttons.map(({ text }) => text), ...(guide.open ? [...layout.guideText.map(({ text }) => text), ...layout.guideButtons.map(({ text }) => text)] : []), ...(menu.visible ? [...readMenu().lines, ...readMenu().buttons.map(({ text }) => text)] : [])].join('. '));
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
    const wasFocused = focusId !== null;
    focusId = null;
    if (wasFocused) repaint();
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
    const hit = hudHit(model, options.size, screenX, screenY);
    if (hit !== null) {
      if (hit.kind === 'button') hudButton(hit.action);
      else if (hit.kind === 'notice') centerNotice(hit.id);
      else if (hit.kind === 'order') perform(hit.order.id);
      else if (hit.kind === 'tab') hooks.setTab(hit.tab);
      else if (hit.kind === 'group') hooks.recallGroup(hit.index);
      else if (armed !== null && hit.selection.kind === 'settlement') targetSettlement(hit.selection.id);
      else pickSelection(hit.selection, layout.exceptions.some((row) => row.selection.kind === hit.selection.kind
        && row.selection.id === hit.selection.id));
      return;
    }

    if (underInterface(screenX, screenY)) return;

    // An armed action owns the next click on the theatre: that is the one thing
    // that makes a button and a keyboard shortcut the same gesture.
    if (armed !== null) {
      targetAt(screenX, screenY);
      return;
    }

    const at = screenToStage(options.camera(), screenX, screenY);
    human.select(selectAt(human.selection, pickables(), at, additive));
    groupMemory = null;
    noteGuide({ kind: 'selection', what: whatIsSelected() });
    repaint();
  }

  /** Only visible controls participate; an options drawer owns its own focus. */
  function interfaceControls(): readonly { id: string; label: string; rect: Rect }[] {
    if (desktop && (sessionOpen || (result !== null && !resultDismissed))) {
      return readMenu().buttons.map((button) => ({ id: `menu:${button.action}`, label: button.text, rect: button.rect }));
    }
    const layout = hudLayout(model, options.size);
    const controls = [
      ...layout.buttons.map((button) => ({ id: `button:${button.action}`, label: button.text, rect: button.rect })),
      ...layout.rows.map((row) => ({ id: `row:${row.selection.kind}:${String(row.selection.id)}`, label: model.rows.find((r) => r.selection.id === row.selection.id && r.selection.kind === row.selection.kind)?.label ?? '', rect: row.rect })),
      ...layout.tabs.map((tab) => ({ id: `tab:${tab.tab}`, label: translate(`tab.${tab.tab}`), rect: tab.rect })),
      ...layout.commands.map(({ order, rect }) => ({ id: `order:${order.id}`, label: order.label, rect })),
      ...layout.groups.map((group) => ({ id: `group:${String(group.index)}`, label: `${translate('ui.groups')} ${String(group.index)}`, rect: group.rect })),
      ...layout.exceptions.map((row) => ({ id: `exception:${String(row.selection.id)}`, label: model.group?.exceptions.find((entry) => entry.squad === row.selection.id)?.name ?? '', rect: row.rect })),
      ...layout.noticeRows.map((row) => ({ id: `notice:${row.id}`, label: notices.find((entry) => entry.id === row.id)?.label ?? '', rect: row.rect })),
      ...layout.guideButtons.map((button) => ({ id: `guide:${button.action}`, label: button.text, rect: button.rect })),
    ];
    const ids = new Set<string>();
    return controls.filter((control) => {
      if (ids.has(control.id)) return false;
      const x = control.rect.x + control.rect.width / 2;
      const y = control.rect.y + control.rect.height / 2;
      if (layout.guide.height > 0 && contains(layout.guide, x, y) && !control.id.startsWith('guide:')) return false;
      ids.add(control.id);
      return true;
    });
  }

  function interfaceKey(key: string, reverse: boolean): boolean {
    if (!desktop || (key !== 'F6' && focusId === null)) return false;
    const controls = interfaceControls();
    if (controls.length === 0) return false;
    if (key === 'F6' || key === 'Tab') {
      const found = controls.findIndex(({ id }) => id === focusId);
      const index = found < 0 && reverse ? 0 : found;
      focusId = controls[(index + (reverse ? -1 : 1) + controls.length) % controls.length]!.id;
      repaint();
      return true;
    }
    if (key === 'Escape') {
      focusId = null;
      cancelTargeting();
      repaint();
      return true;
    }
    if (key === 'Enter' || key === ' ') {
      const focused = controls.find(({ id }) => id === focusId);
      if (focused !== undefined) {
        pickAt(focused.rect.x + focused.rect.width / 2, focused.rect.y + focused.rect.height / 2, false);
        focusId = focused.id;
        repaint();
      }
      return true;
    }
    return false;
  }

  /** One of the bar's own buttons, pressed. */
  function hudButton(action: HudAction): void {
    const layout = hudLayout(model, options.size);
    if (action === 'pause') {
      if (pacing.paused) hooks.resume();
      else hooks.pause();
    } else if (action === 'session') { sessionOpen = !sessionOpen; repaint(); }
    else if (action === 'speed1') hooks.setSpeed(1);
    else if (action === 'speed2') hooks.setSpeed(2);
    else if (action === 'speed3') hooks.setSpeed(3);
    else if (action === 'center') hooks.centerSelection();
    else if (action === 'navigator') hooks.toggleNavigator();
    else if (action === 'groupBack') hooks.groupBack();
    else if (action === 'notices') hooks.toggleNotices();
    else if (action === 'guideBegin' || action === 'guideSkip' || action === 'guideClose') guideButton(action);
    else {
      const region = action.startsWith('list') ? 'list' : action.startsWith('commands') ? 'commands'
        : action.startsWith('notices') ? 'notices' : 'detail';
      const scroll = region === 'list' ? layout.listScroll : region === 'commands' ? layout.commandScroll
        : region === 'notices' ? layout.noticeScroll : layout.detailScroll;
      hooks.scrollHud(region, action.endsWith('Next') ? scroll.page : -scroll.page);
    }
  }

  /**
   * A row a Player pressed: it selects what it names, and an *exception* opened
   * from a group keeps the group it came from, so the panel can offer the way
   * back. A row pressed from the navigator is a new selection and keeps nothing.
   */
  function pickSelection(selection: Selection, fromException = false): void {
    const previous = human.selection.squads;
    human.select(asPicked(selection));
    groupMemory = fromException && previous.length > 1 ? [...previous] : null;
    armed = null;
    commandNotice = null;
    noteGuide({ kind: 'selection', what: whatIsSelected() });
    repaint();
  }

  /**
   * Performs one contextual action: arms it if it has a target to ask for, and
   * submits it now if it has not.
   *
   * The offer is read from the model, so an action the panel is showing as
   * unavailable cannot be taken by calling it here either — which is what keeps
   * a button and a hook from disagreeing about the rules.
   */
  function perform(orderId: string): boolean {
    const offer = model.commands.find((order) => order.id === orderId);
    if (offer === undefined) return false;
    if (!offer.enabled) {
      // A control that cannot be used still answers: the panel says why, in the
      // words the offer already carries, instead of swallowing the press.
      commandNotice = message('ui.unavailable', { name: offer.label, reason: offer.reason ?? '' });
      repaint();
      return false;
    }

    commandNotice = null;
    if (offer.target !== 'none') {
      armed = offer.id;
      repaint();
      return true;
    }

    return submitOrder(offer);
  }

  /** Cancels an armed action. A Command already submitted is not a target, and is never cancelled. */
  function cancelTargeting(): boolean {
    if (armed === null) return false;
    armed = null;
    repaint();
    return true;
  }

  /** Completes the armed action at a screen point. */
  function targetAt(screenX: number, screenY: number): boolean {
    const offer = armed === null ? undefined : model.commands.find((order) => order.id === armed);
    if (offer === undefined) return false;
    if (underInterface(screenX, screenY)) return false;

    const at = screenToStage(options.camera(), screenX, screenY);
    const tile = tileAt(at.x, at.y);
    if (tile.x < 0 || tile.y < 0 || tile.x >= MAP_WIDTH || tile.y >= MAP_HEIGHT) return false;

    if (offer.target === 'ground') return submitOrder(offer, { kind: 'ground', x: tile.x, y: tile.y });
    if (offer.target === 'enemy') {
      const enemy = enemyAt(enemyTargets(visible()), tile.x, tile.y);
      return enemy === null ? false : submitOrder(offer, { kind: 'enemy', squad: enemy.id });
    }
    if (offer.target === 'settlement') {
      // The structure a Player can see is the target, by the rectangle it is drawn
      // in: an armed Assault on the gate of a town is a click on the gatehouse, not
      // a click on the one tile the rules happen to name it by.
      const drawn = pickableAt(pickables().filter((pickable) => pickable.kind === 'settlement'), at);
      const target = drawn?.id ?? settlementAt(settlementTargets(visible()), tile.x, tile.y)?.id;

      return target === undefined ? false : targetSettlement(target);
    }

    return false;
  }

  /**
   * Completes the armed action at a settlement a list row named.
   *
   * The rules still decide whether the settlement is one the action may name — a
   * garrison of ground this Faction does not hold, an assault on open ground, a
   * blockade of nothing. The interface only refuses a target it *knows* is wrong
   * (a remembered settlement is not a walled one), and stays armed when it does,
   * so the requirement line keeps saying what to click.
   */
  function targetSettlement(settlement: number): boolean {
    const offer = armed === null ? undefined : model.commands.find((order) => order.id === armed);
    if (offer === undefined || offer.target !== 'settlement') return false;

    const target = settlementTargets(visible()).find((site) => site.id === settlement);
    if (target === undefined) return false;
    if (offer.id === 'garrison' && (!target.own || target.walled !== true)) return false;
    if (offer.id === 'assault' && (target.own || target.walled !== true)) return false;
    if (offer.id === 'blockade' && target.own) return false;

    return submitOrder(offer, { kind: 'settlement', settlement });
  }

  /** Picks the group an individual exception was opened from. */
  function groupBack(): boolean {
    if (groupMemory === null || groupMemory.length < 2) return false;
    human.select({ squads: [...groupMemory], settlement: null });
    groupMemory = null;
    noteGuide({ kind: 'selection', what: 'squad' });
    repaint();
    return true;
  }

  /**
   * Turns an offer into one real Command and hands it to the human Controller.
   *
   * This is the single submission path every control ends at: a button, a key, a
   * right click and a test hook all arrive here, and nothing here can write to
   * the Match — `human.submit` validates the Command and the tick applies it.
   */
  function submitOrder(offer: OrderOption, point?: OrderPoint): boolean {
    const squads = human.selection.squads;
    const command = commandFor(offer, squads, point);
    if (command === null || !human.submit(command)) return false;

    // The page's own memory of the verb, which is what makes a move and an
    // attack-move different marks on the ground (#58): the rules keep one route.
    if (offer.kind === 'move' || offer.kind === 'attackMove') {
      for (const id of squads) orderMarks[id] = offer.kind;
    }
    noteGuide({ kind: 'command', verb: offer.kind === 'move' || offer.kind === 'attackMove' || offer.kind === 'recruit'
      ? offer.kind : 'other' });

    submission = {
      name: offer.label,
      status: 'pending',
      tick: match.state.tick,
      detail: offer.kind === 'garrison' && point?.kind === 'settlement'
        ? garrisonDetail(squads, point.settlement)
        : null,
    };
    armed = null;
    commandNotice = null;
    repaint();
    return true;
  }

  /** The Command one offer means, or `null` when the selection cannot address it. */
  function commandFor(offer: OrderOption, squads: readonly number[], point?: OrderPoint): Command | null {
    // A Siege names the settlement the click produced, and nothing else: a Squad
    // selection cannot carry one, which is why the target is a separate answer.
    switch (offer.kind) {
      case 'move':
        return point?.kind === 'ground' ? move(faction, squads, point.x, point.y) : null;
      case 'attackMove':
        return point?.kind === 'ground' ? attackMove(faction, squads, point.x, point.y) : null;
      case 'attack':
        return point?.kind === 'enemy' ? attack(faction, squads, point.squad) : null;
      case 'hold':
        return hold(faction, squads);
      case 'withdraw':
        return withdraw(faction, squads);
      case 'formation':
        return offer.subject === 'column' ? formation(faction, squads, 'column') : formation(faction, squads, 'line');
      case 'garrison':
        return point?.kind === 'settlement' ? garrison(faction, squads, point.settlement) : null;
      case 'assault':
        return point?.kind === 'settlement' ? assault(faction, squads, point.settlement) : null;
      case 'blockade':
        return point?.kind === 'settlement' ? blockade(faction, squads, point.settlement) : null;
      case 'build':
        return offer.subject === null || human.selection.settlement === null
          ? null : build(faction, human.selection.settlement, offer.subject);
      case 'recruit':
        return offer.subject === null || human.selection.settlement === null
          ? null : recruit(faction, human.selection.settlement, offer.subject, 1);
    }
  }

  /** How many of the picked Squads stand in reach of the settlement a garrison named. */
  function garrisonDetail(ids: readonly number[], settlement: number): string | null {
    const observation = visible();
    const picked = observation.squads.filter((squad) => ids.includes(squad.id));
    if (picked.length === 0) return null;
    const near = garrisonReach(observation, picked, settlement);

    return message('ui.partial', { near: near.near, total: near.total });
  }

  /** An order to a screen point, given to the Squads picked when the Player clicked. */
  function orderAt(kind: 'move' | 'attackMove', screenX: number, screenY: number): boolean {
    // A right click on the interface is a click on the interface: the panels are
    // drawn over the theatre, and an order that landed on the tile behind a
    // panel would be a destination nobody asked for.
    if (underInterface(screenX, screenY)) return false;
    const offer = model.commands.find((order) => order.id === kind);
    if (offer === undefined || !offer.enabled) return false;
    armed = kind;

    return targetAt(screenX, screenY);
  }

  /** Whether a screen point falls on one of the interface's panels rather than on the theatre. */
  function underInterface(x: number, y: number): boolean {
    const layout = hudLayout(model, options.size);

    return [...interfaceRects(layout), ...(menu.visible ? [readMenu().rect] : [])].some(
      (rect) => x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
    );
  }

  /**
   * Every rectangle the interface draws over the theatre, the notice strip
   * included when it has anything to say (#58).
   *
   * One reader for the click test and the `hudRects` hook, so a panel that
   * appears cannot cover a tile that the pointer still coordinates as bare ground.
   */
  function interfaceRects(layout: HudLayout): readonly Rect[] {
    return [layout.bar, layout.list, layout.detail, layout.minimap,
      ...(layout.notices.height > 0 ? [layout.notices] : []),
      ...(layout.guide.height > 0 ? [layout.guide] : [])];
  }

  /** A drag between two screen points: every block it touched. */
  function pickInBox(fromX: number, fromY: number, toX: number, toY: number, additive: boolean): void {
    if (underInterface(fromX, fromY)) return;
    const camera = options.camera();
    const box = boxBetween(screenToStage(camera, fromX, fromY), screenToStage(camera, toX, toY));

    human.select(selectIn(human.selection, pickables(), box, additive));
    noteGuide({ kind: 'selection', what: whatIsSelected() });
    repaint();
  }

  /**
   * What a pick can land on: the Faction's own Squads and the settlements it can see,
   * with the rectangles they are drawn in, the rows they stand on and the layers
   * they are drawn in.
   *
   * The layer a thing is drawn in is the world `zIndex` of the layer that draws it
   * — `SETTLEMENT_LAYER` under the fog, `SQUAD_LAYER` above it — so the men sort
   * above the settlements for the same reason the stage draws them above: a Squad
   * standing in a Stronghold is what a Player can see under the pointer, and so it
   * is the thing the click takes.
   */
  function pickables(): readonly Pickable[] {
    return [
      ...siteReports().map((site) => ({ kind: 'settlement' as const, id: site.id, rect: site.rect,
        depth: siteDepth(site), layer: SETTLEMENT_LAYER })),
      ...squadReports().map((squad) => ({ kind: 'squad' as const, id: squad.id, rect: squad.rect,
        depth: squad.y, layer: SQUAD_LAYER })),
    ];
  }

  /**
   * Drops the ground marks of Squads that are gone or have arrived.
   *
   * The marks are the page's memory of the verb a Player gave; a Squad with
   * nowhere to walk has no mark to wear, and a Squad that has left the field has
   * no block to wear it on.
   */
  function pruneOrderMarks(
    marks: Readonly<Record<number, OrderMarkKind>>,
    squads: readonly VisibleSquad[],
  ): Record<number, OrderMarkKind> {
    const kept: Record<number, OrderMarkKind> = {};

    for (const squad of squads) {
      const mark = marks[squad.id];
      if (mark !== undefined && squad.goal !== null) kept[squad.id] = mark;
    }

    return kept;
  }

  /** The settlement ids that are Strongholds, which the Observation does not say and the map does. */
  function strongholdIds(window: EconomyVisible): readonly number[] {
    const sites = match.state.world.map.strongholds;

    return window.settlements
      .filter((settlement) => sites.some((site) => site.x === settlement.x && site.y === settlement.y))
      .map((settlement) => settlement.id);
  }
}
