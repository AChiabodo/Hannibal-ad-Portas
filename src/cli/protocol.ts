/**
 * The external agent protocol: the seam, on a pipe (E1, docs/PROTOCOL.md).
 *
 * A Match is a Conversation with two Players who are Controllers, and a
 * Controller reads an Observation and writes Commands (`docs/COMMANDS.md`). This
 * module is what that looks like when the Controller is a *process*: one
 * Observation goes out, one line of Commands comes back, and nothing else
 * crosses. It owns the messages and nothing else — no child process, no timer,
 * no Match — so every rule below is a pure function of a string and can be
 * tested without a pipe at all.
 *
 * ## JSON Lines, both ways
 *
 * One message per line, UTF-8, `\n` after each. A line is a JSON object with a
 * `type`, and the protocol is closed the way the Command vocabulary is: a field
 * the document does not name is refused, because a message that silently means
 * something else is the worst kind of accepted input.
 *
 * - **to the agent** — `hello` once, then one `observation` per decision, then
 *   `end` when the Match is over. `stopped` is the harness saying why it has
 *   stopped asking.
 * - **from the agent** — `commands`, one per `observation`, and nothing else.
 *
 * ## The Observation is the Faction's, and the wire form is the projection
 *
 * `wireObservation` is a field-for-field copy of what the rules projected for
 * one Faction — `SiegeVisible` — with the three tile grids run-length encoded and
 * the fog's raw contact list dropped, because `contacts` is the same list read
 * into names (a duplicate is not knowledge, it is weight). Nothing is added: an
 * agent is handed exactly what a Controller is handed, which is the whole point
 * of a protocol rather than an API.
 *
 * ## What is malformed here, and what is not
 *
 * A reply that is not a `commands` message, a `tick` that is not the tick asked
 * about, a Command the vocabulary refuses, a Command addressed to the other
 * Faction — all of those are **malformed**, and `readReply` names the field, the
 * way `validateCommand` does. Whether a well-formed Command is *legal* is the
 * rules' question and not this module's, exactly as it is for the human and for
 * the AI: an order nobody can honour is ignored by the tick.
 */
import {
  COMMAND_KINDS,
  CommandValidationError,
  FORMATIONS,
  validateCommand,
  type Command,
} from '../sim/command.ts';
import type { MatchResult } from '../sim/driver.ts';
import { UNSEEN } from '../sim/fog.ts';
import type { Faction } from '../sim/faction.ts';
import { MAP_HEIGHT, MAP_WIDTH, TERRAIN } from '../sim/map.ts';
import type { Season } from '../sim/season.ts';
import { BUILDINGS } from '../content/buildings.ts';
import { SQUAD_TYPES } from '../content/squads.ts';
import type { ResourceAmounts } from '../content/resources.ts';
import type { KnownContact } from '../sim/siege-fog.ts';
import type { EconomyVisible } from '../sim/economy-match.ts';
import type { SiegeVisible, VisibleFront } from '../sim/siege.ts';

/**
 * The version of this protocol. A harness and an agent that disagree about it
 * have nothing to say to each other, so the number is the first field an agent
 * reads and the one thing it cannot interpret.
 */
export const PROTOCOL_VERSION = 2;

/**
 * How often the harness asks the agent for Commands, in ticks, unless the
 * command line says otherwise: a tenth of a second at the 10 Hz clock, which is
 * a decision every second of Match time.
 *
 * A Match is asked once per tick — that is the seam — but a process on the other
 * end of a pipe does not need every tick, and the wire does not need to carry an
 * Observation twenty-five thousand times. A decision interval is the harness
 * answering "nothing" on the agent's behalf in between, which is a legal answer:
 * returning nothing is always legal (`sim/controller.ts`).
 */
export const DEFAULT_DECISION_TICKS = 10;

/**
 * How long the harness waits for one reply, in milliseconds, unless the command
 * line says otherwise. The only wall clock in the protocol, and it decides
 * nothing about the Match: it decides when the harness stops listening.
 */
export const DEFAULT_DEADLINE_MS = 2000;

/** How long the harness waits for the agent to exit on its own after `end`. */
export const DEFAULT_GRACE_MS = 1000;

/** A tile grid as the wire carries it: one string per row, run-length encoded. */
export type WireGrid = readonly string[];

/** One tile of the theatre, as the wire names it: terrain is an integer in state. */
export interface WireTerrain {
  readonly id: string;
  readonly code: number;
}

/**
 * What the harness says first: who the agent is, what it may say, and how often
 * it will be asked.
 *
 * Everything in it is a fact the agent cannot learn any other way — its own
 * Faction, the seed and the bound of the Match, the size of the theatre, the
 * legend for the terrain codes it is about to read, and the content tables its
 * Commands name. A document that had to repeat those numbers would be a second
 * source of truth, which is why they are on the wire.
 */
export interface HelloMessage {
  readonly type: 'hello';
  readonly protocol: number;
  readonly faction: Faction;
  readonly seed: number;
  readonly ticks: number;
  readonly map: { readonly width: number; readonly height: number };
  readonly ticksPerSecond: number;
  readonly decisionTicks: number;
  readonly deadlineMs: number;
  readonly commands: readonly string[];
  readonly formations: readonly string[];
  readonly terrain: readonly WireTerrain[];
  readonly squadTypes: readonly WireSquadType[];
  readonly buildings: readonly WireBuildingType[];
}

/** A Squad type the agent's Faction may raise, as the content table states it. */
export interface WireSquadType {
  readonly id: string;
  readonly faction: Faction;
  readonly tier: number;
  /** The largest size the type may be raised at: a full-strength Squad is counted as this. */
  readonly strength: number;
  /** Every real size a `recruit` may name for it, smallest first (ADR-0026). */
  readonly sizes: readonly number[];
  /**
   * What one of its men is worth in a blow, against one man of the line
   * (ADR-0028): `1` for infantry and slingers, `2` for the Numidian horse, `4`
   * for the elephant. An agent's own Squads also carry their `bearing`, which is
   * `men × impact`; this is the roster fact it needs to price a purchase.
   */
  readonly impact: number;
  readonly arm: string;
  readonly morale: number;
  readonly ammunition: number;
  readonly pace: number;
  /** The Payroll rate: denarii each Season per 24 surviving men (ADR-0027). */
  readonly payroll: number;
  /** The 24-man resource price; a larger size scales in exact proportion. */
  readonly cost: ResourceAmounts;
}

/** A building the agent's Faction may raise, as the content table states it. */
export interface WireBuildingType {
  readonly id: string;
  readonly tier: number;
  readonly cost: ResourceAmounts;
  readonly buildTicks: number;
  readonly labour: number;
  readonly yields: ResourceAmounts;
  readonly denarii: number;
  readonly housing: number;
  readonly storage: number;
  readonly raisesTier: number;
  readonly maxPerSettlement: number;
}

/**
 * One Faction's Observation, as the wire carries it: the projection, field for
 * field, with the three grids run-length encoded and the fog's raw contacts
 * dropped in favour of the named ones.
 */
export interface WireObservation {
  readonly season: Season;
  readonly year: number;
  readonly treasury: number;
  readonly territory: WireGrid;
  readonly settlements: EconomyVisible['settlements'];
  readonly squads: EconomyVisible['squads'];
  readonly fog: { readonly terrain: WireGrid; readonly visible: WireGrid };
  readonly contacts: readonly KnownContact[];
  readonly enemies: SiegeVisible['enemies'];
  readonly fronts: readonly VisibleFront[];
  readonly appearances?: SiegeVisible['appearances'];
}

/** The harness's question: what the Faction may see, on the tick being decided. */
export interface ObservationMessage {
  readonly type: 'observation';
  readonly tick: number;
  readonly observation: WireObservation;
}

/** The harness's last word: what happened, and the hash two runs are compared by. */
export interface EndMessage {
  readonly type: 'end';
  readonly result: MatchResult;
  readonly hash: string;
}

/** Why the harness stopped asking, when it did. */
export type StopReason = 'malformed' | 'timeout' | 'gone';

/** The harness telling the agent that its part in the Match is over. */
export interface StoppedMessage {
  readonly type: 'stopped';
  readonly reason: StopReason;
  readonly detail: string;
}

/** Everything the harness can say. */
export type HarnessMessage = HelloMessage | ObservationMessage | StoppedMessage | EndMessage;

/** The agent's answer to one `observation`: the Commands to apply on its tick. */
export interface CommandsMessage {
  readonly type: 'commands';
  readonly tick: number;
  readonly commands: readonly Command[];
}

/** A message from either side that is not a message of this protocol. */
export class ProtocolError extends Error {
  /** Where in the message the offending value is, e.g. `message.commands[1]`. */
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`the protocol message at ${path} ${reason}`);
    this.name = 'ProtocolError';
    this.path = path;
  }
}

/** Everything `hello` needs from the run it opens. */
export interface HelloOptions {
  readonly faction: Faction;
  readonly seed: number;
  readonly ticks: number;
  readonly ticksPerSecond: number;
  readonly decisionTicks: number;
  readonly deadlineMs: number;
}

/**
 * The first line of a Match: what the agent is, and what it may say.
 *
 * The content tables are filtered to the agent's own Faction — Rome is not
 * offered Libyan spearmen — because a roster it cannot recruit from is not
 * something it may know, and the rules would refuse the Recruit anyway.
 */
export function helloMessage(options: HelloOptions): HelloMessage {
  return {
    type: 'hello',
    protocol: PROTOCOL_VERSION,
    faction: options.faction,
    seed: options.seed,
    ticks: options.ticks,
    map: { width: MAP_WIDTH, height: MAP_HEIGHT },
    ticksPerSecond: options.ticksPerSecond,
    decisionTicks: options.decisionTicks,
    deadlineMs: options.deadlineMs,
    commands: [...COMMAND_KINDS],
    formations: [...FORMATIONS],
    terrain: terrainLegend(),
    squadTypes: SQUAD_TYPES.filter((type) => type.faction === options.faction).map(asWireSquadType),
    buildings: BUILDINGS.filter(
      (building) => building.faction === undefined || building.faction === options.faction,
    ).map(asWireBuildingType),
  };
}

/** The terrain codes a grid can hold, as words: what a remembered tile's number means. */
function terrainLegend(): readonly WireTerrain[] {
  const named = Object.entries(TERRAIN).map(([id, code]) => ({ id, code }));
  return [...named, { id: 'unseen', code: UNSEEN }];
}

/** One Squad type, narrowed to the fields an agent plans with. */
function asWireSquadType(type: (typeof SQUAD_TYPES)[number]): WireSquadType {
  return {
    id: type.id,
    faction: type.faction,
    tier: type.tier,
    strength: type.strength,
    sizes: type.sizes,
    impact: type.impact,
    arm: type.arm,
    morale: type.morale,
    ammunition: type.ammunition,
    pace: type.pace,
    payroll: type.payroll,
    cost: type.cost,
  };
}

/** One building, narrowed to the fields an agent plans with. */
function asWireBuildingType(building: (typeof BUILDINGS)[number]): WireBuildingType {
  return {
    id: building.id,
    tier: building.tier,
    cost: building.cost,
    buildTicks: building.buildTicks,
    labour: building.labour,
    yields: building.yields,
    denarii: building.denarii,
    housing: building.housing,
    storage: building.storage,
    raisesTier: building.raisesTier,
    maxPerSettlement: building.maxPerSettlement,
  };
}

/**
 * The Faction's Observation as a line of the protocol.
 *
 * Nothing is filtered here and nothing is added: what an agent across a pipe is
 * handed is the projection the rules built for a Controller in this process, with
 * the grids encoded for the wire. The filtering happened once, in `observeSiege`,
 * which is the only place that can decide what a Faction may know.
 */
export function observationMessage(tick: number, visible: SiegeVisible): ObservationMessage {
  return { type: 'observation', tick, observation: wireObservation(visible) };
}

/** The projection, in the wire's shape: the grids run-length encoded, nothing added or dropped. */
export function wireObservation(visible: SiegeVisible): WireObservation {
  return {
    season: visible.season,
    year: visible.year,
    treasury: visible.treasury,
    territory: rowsOf(visible.territory),
    settlements: visible.settlements,
    squads: visible.squads,
    fog: { terrain: rowsOf(visible.fog.terrain), visible: rowsOf(visible.fog.visible) },
    contacts: visible.contacts,
    enemies: visible.enemies,
    fronts: visible.fronts,
    ...(visible.appearances === undefined ? {} : { appearances: visible.appearances }),
  };
}

/** The last line of a Match, or the last thing said when nobody is asking any more. */
export function endMessage(result: MatchResult, hash: string): EndMessage {
  return { type: 'end', result, hash };
}

/** The harness saying it has stopped listening, and why. */
export function stoppedMessage(reason: StopReason, detail: string): StoppedMessage {
  return { type: 'stopped', reason, detail };
}

/** One message as a line of the protocol: `JSON` and a final newline. */
export function formatMessage(message: HarnessMessage | CommandsMessage): string {
  return `${JSON.stringify(message)}\n`;
}

/**
 * A line of the protocol from an agent, read: the Commands for the tick that was
 * asked about.
 *
 * Everything a reply can get wrong is refused here, before the driver sees
 * anything: a line that is not JSON, a message that is not `commands`, a field
 * nobody documents, a `tick` that is not the one in the Observation, a Command
 * the vocabulary refuses, and a Command addressed to the other Faction — the last
 * of which the driver would call a breach of the seam and abort the Match, and
 * which for a process on a pipe is simply input that cannot be read.
 *
 * @throws ProtocolError when the line is not an answer to the question asked.
 */
export function readReply(line: string, asked: { readonly faction: Faction; readonly tick: number }): CommandsMessage {
  const message = requireRecord(parse(line), 'message');

  requireField(message, 'message', 'type', 'commands');
  const tick = requireTick(message.tick, 'message.tick');
  if (tick !== asked.tick) {
    throw new ProtocolError('message.tick', `is not the tick that was asked about: expected ${asked.tick}, got ${tick}`);
  }

  requireOnlyFields(message, 'message', ['type', 'tick', 'commands']);

  return { type: 'commands', tick, commands: readCommands(message.commands, asked.faction) };
}

/** The Commands in a reply, each read through the vocabulary and addressed to the agent's own Faction. */
function readCommands(value: unknown, faction: Faction): readonly Command[] {
  if (!Array.isArray(value)) {
    throw new ProtocolError('message.commands', 'is not a list of Commands');
  }

  return value.map((entry, index) => {
    const path = `message.commands[${index}]`;
    const command = readCommand(entry, path);

    if (command.faction !== faction) {
      throw new ProtocolError(
        `${path}.faction`,
        `is not the Faction this agent plays: expected ${faction}, got ${command.faction}`,
      );
    }

    return command;
  });
}

/**
 * One Command of a reply, read through the vocabulary.
 *
 * The vocabulary names its refusals from the root of a Command (`command.kind`),
 * because that is where a Command read on its own begins; in a reply the same
 * mistake is at `message.commands[3].kind`, and that is where an agent author has
 * to look. The path is rebased rather than the message rewritten, so the sentence
 * an agent reads is the vocabulary's own words at the place it typed them.
 */
function readCommand(entry: unknown, path: string): Command {
  try {
    return validateCommand(entry);
  } catch (error) {
    if (!(error instanceof CommandValidationError)) throw error;

    throw new ProtocolError(`${path}${error.path.slice(ROOT.length)}`, error.reason);
  }
}

/** The root the vocabulary names a Command's own fields from: `command.kind`, and so on. */
const ROOT = 'command';

/** A line as JSON, refused with a sentence when it is not. */
function parse(line: string): unknown {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    throw new ProtocolError('message', `is not JSON: ${line}`);
  }
}

/** @throws ProtocolError when the value is not a plain object. */
function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProtocolError(path, `is not a message: expected a JSON object, got ${String(value)}`);
  }

  return value as Record<string, unknown>;
}

/** @throws ProtocolError when the message is not of the one kind a reply may be. */
function requireField(
  message: Record<string, unknown>,
  path: string,
  field: string,
  expected: string,
): void {
  if (message[field] !== expected) {
    throw new ProtocolError(
      `${path}.${field}`,
      `is not a message of this protocol: expected ${expected}, got ${String(message[field])}`,
    );
  }
}

/** @throws ProtocolError when the message carries a field the protocol does not name. */
function requireOnlyFields(
  message: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
): void {
  for (const field of Object.keys(message)) {
    if (!allowed.includes(field)) {
      throw new ProtocolError(`${path}.${field}`, 'is not a field of this message');
    }
  }
}

/** @throws ProtocolError when the value is not a whole non-negative tick. */
function requireTick(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ProtocolError(path, `is not a tick: ${String(value)}`);
  }

  return value;
}

/**
 * One tile grid, run-length encoded: a string per row, each a comma-separated
 * list of `<run>x<value>` adding up to the map's width.
 *
 * The encoding exists because an Observation carries three 96×96 grids and a
 * Match asks for a decision every second of Match time: sent as JSON arrays that
 * is a quarter of a megabyte a message, and a Theatre that is mostly unexplored
 * or mostly held by one Faction is a handful of runs a row. It is plain text and
 * five lines to decode in any language, which is the point of a protocol an
 * agent is written from a document.
 */
export function rowsOf(grid: Uint8Array, width = MAP_WIDTH, height = MAP_HEIGHT): readonly string[] {
  const rows: string[] = [];

  for (let y = 0; y < height; y += 1) {
    const runs: string[] = [];
    const start = y * width;
    let value = grid[start] ?? 0;
    let count = 0;

    for (let x = 0; x < width; x += 1) {
      const next = grid[start + x] ?? 0;
      if (next === value) {
        count += 1;
        continue;
      }

      runs.push(`${count}x${value}`);
      value = next;
      count = 1;
    }

    runs.push(`${count}x${value}`);
    rows.push(runs.join(','));
  }

  return rows;
}

/**
 * The inverse of `rowsOf`: the grid as `Sim` holds it.
 *
 * An agent needs only the reading direction, but a protocol nobody can check is a
 * protocol that drifts, and the test that puts every grid through both is what
 * makes "the wire carries the projection" a fact rather than a claim.
 *
 * @throws ProtocolError when a row does not add up to the map's width.
 */
export function gridOf(rows: WireGrid, width = MAP_WIDTH, height = MAP_HEIGHT): Uint8Array {
  if (rows.length !== height) {
    throw new ProtocolError('grid', `is not ${height} rows: ${rows.length}`);
  }

  const grid = new Uint8Array(width * height);

  rows.forEach((row, y) => {
    let x = 0;

    for (const run of row.split(',')) {
      const [count, value] = run.split('x').map((part) => Number(part));
      if (count === undefined || value === undefined || !Number.isSafeInteger(count) || !Number.isSafeInteger(value)) {
        throw new ProtocolError(`grid[${y}]`, `is not a list of <count>x<value> runs: ${row}`);
      }

      for (let step = 0; step < count; step += 1) {
        if (x >= width) throw new ProtocolError(`grid[${y}]`, `is wider than ${width} tiles: ${row}`);
        grid[y * width + x] = value;
        x += 1;
      }
    }

    if (x !== width) throw new ProtocolError(`grid[${y}]`, `is narrower than ${width} tiles: ${row}`);
  });

  return grid;
}
