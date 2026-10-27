/**
 * The Command vocabulary: the whole public control surface of a Match.
 *
 * One seam carries every decision in the game (PLAN §3, ADR-0003). A Controller
 * reads an Observation and emits Commands; the human input handler, the built-in
 * AI, a scripted test driver and an external agent are all Controllers, and a
 * Command means the same thing to all four. That is what makes an AI-versus-AI
 * Match a test rather than a demo, and it is why the vocabulary is closed: every
 * Command has to be implemented for a human clicking *and* for a machine
 * emitting it, so the set is kept small on purpose. Adding one is a decision,
 * and `docs/COMMANDS.md` is where it is written down — a test reads that table
 * and fails if the two drift apart.
 *
 * Two kinds of refusal live at different layers, and the difference matters:
 *
 * - **Malformed**: this is not a Command. An unknown kind, a missing field, a
 *   field nobody has, a Squad id that is not a whole non-negative number, a
 *   Squad named twice, an empty Squad list, a Faction nobody implements. That
 *   is `validateCommand`'s job, and it says where the value went wrong.
 * - **Illegal**: this is a Command, but not one the Faction may issue now — an
 *   enemy Squad, a tile under water, a building nobody can afford, a ram
 *   Carthage does not have. That is the rules' job during the tick, because
 *   only they can look at the world and say why.
 *
 * This module owns the first and nothing of the second.
 *
 * Commands are plain data: JSON-shaped, copyable, and written down in the log a
 * replay is made of (E2). Nothing here holds a reference to a Squad or a world,
 * and `validateCommand` copies what it accepts, so a Controller cannot keep a
 * hand on the Match through the object it handed over.
 */
import { FACTIONS, isFaction, type Faction } from './faction.ts';
import type { Formation } from '../content/formation.ts';
import type { Facing } from './squad.ts';

/** The field every Command carries: the Faction that issued it. */
const FACTION_FIELD = 'faction';

/**
 * A Command that cannot be built or read.
 *
 * Deriving `Error` rather than returning a result because there is no sensible
 * way to continue: a Command the vocabulary refuses has no meaning, so it
 * cannot be applied, logged or replayed. The `path` is what a caller shows a
 * human — and, for an external agent, what makes a rejected line debuggable.
 */
export class CommandValidationError extends Error {
  /** Where in the Command the offending value is, e.g. `command.squads[1]`. */
  readonly path: string;

  /**
   * What is wrong with it, without the path: the second half of the message.
   *
   * Kept as a field as well as being in the sentence because a caller that has
   * its own name for the path — a protocol line, where the same Command sits at
   * `message.commands[3]` — has to say it in its own words rather than slice the
   * message and hope it still parses.
   */
  readonly reason: string;

  constructor(path: string, reason: string) {
    super(`the command at ${path} ${reason}`);
    this.name = 'CommandValidationError';
    this.path = path;
    this.reason = reason;
  }
}

/**
 * The shape a Squad holds (PLAN §4): `line` is frontage, `column` is depth.
 *
 * C1 owns what each shape means for movement and combat. The vocabulary names
 * only that the choice exists, because a Controller has to be able to make it.
 */
export type { Formation } from '../content/formation.ts';

/**
 * The part every Command shares: the Faction it is addressed to.
 *
 * A Command names its Faction because the log has to be readable without the
 * Players that produced it — a replay is a seed and a log, with no Controllers
 * at all (E2) — and because the seam can then refuse a Command aimed at the
 * other Faction without asking the rules who owns what.
 */
export interface CommandBase {
  readonly faction: Faction;
}

/** March the Squads to the tile `x, y`. */
export interface MoveCommand extends CommandBase {
  readonly kind: 'move';
  /** The Squads to order, by the ids an Observation names them with. */
  readonly squads: readonly number[];
  /** Tile column, rightwards, as the map lays it out. */
  readonly x: number;
  /** Tile row, downwards, as the map lays it out. */
  readonly y: number;
}

/** March the Squads to `x, y`, engaging whatever they meet on the way. */
export interface AttackMoveCommand extends CommandBase {
  readonly kind: 'attackMove';
  readonly squads: readonly number[];
  readonly x: number;
  readonly y: number;
}

/** Attack one enemy Squad. */
export interface AttackCommand extends CommandBase {
  readonly kind: 'attack';
  readonly squads: readonly number[];
  /** The enemy Squad to attack, by id. */
  readonly target: number;
}

/** An explicit attack on an observed camp or completed economic work. */
export interface AttackStructureCommand extends CommandBase {
  readonly kind: 'attackStructure';
  readonly squads: readonly number[];
  readonly target: { readonly kind: 'camp'; readonly id: number } |
    { readonly kind: 'work'; readonly settlement: number; readonly building: string; readonly ordinal: number };
}

/** Hold position: stand, face the enemy, and do not pursue. */
export interface HoldCommand extends CommandBase {
  readonly kind: 'hold';
  readonly squads: readonly number[];
}

/** Take up garrison inside a settlement: the Squads man its walls instead of the field. */
export interface GarrisonCommand extends CommandBase {
  readonly kind: 'garrison';
  readonly squads: readonly number[];
  /** The settlement to garrison, by id. */
  readonly settlement: number;
}

/**
 * Break off and fall back.
 *
 * A Withdraw carries no destination on purpose: which ground is behind you is a
 * question about the map, the enemy and the nearest friendly settlement, and the
 * rules answer it (C3). A Controller says only that the fight is over.
 */
export interface WithdrawCommand extends CommandBase {
  readonly kind: 'withdraw';
  readonly squads: readonly number[];
}

/** Start building in a settlement, as a labour allocation plus a timer (ADR-0005). */
export interface BuildCommand extends CommandBase {
  readonly kind: 'build';
  readonly settlement: number;
  /** A building id from the content table (B6); unknown ids are the rules' to refuse. */
  readonly building: string;
}

/** Recruit Squads in a settlement. */
export interface RecruitCommand extends CommandBase {
  readonly kind: 'recruit';
  readonly settlement: number;
  /** A Squad type id from the content table (C4). */
  readonly squadType: string;
  /** The men each Squad is raised with: one of the type's real sizes (ADR-0026). */
  readonly men: number;
  /** How many Squads to raise; at least one. */
  readonly count: number;
}

/** Cancel an owned construction/recruitment request which has not yet started. */
export interface CancelPendingCommand extends CommandBase {
  readonly kind: 'cancelPending';
  readonly settlement: number;
  readonly order: number;
}

/** Order or cancel repair of one owned fortification. */
export interface FortificationRepairCommand extends CommandBase {
  readonly kind: 'repairFortification' | 'cancelFortificationRepair';
  readonly settlement: number;
  readonly structure: 'wall' | 'gate';
  readonly side: Facing;
}

/** Take a settlement by force: the fast, expensive path of a Siege, and Rome's alone (ADR-0008). */
export interface AssaultCommand extends CommandBase {
  readonly kind: 'assault';
  readonly squads: readonly number[];
  readonly settlement: number;
}

/** Starve a settlement into surrender: the slow path of a Siege (ADR-0008). */
export interface BlockadeCommand extends CommandBase {
  readonly kind: 'blockade';
  readonly squads: readonly number[];
  readonly settlement: number;
}

/**
 * The two paths of a Siege (GLOSSARY: Siege, ADR-0008).
 *
 * A Siege is one or the other and never both, and the words are the Command
 * kinds because choosing a path is exactly issuing one of them: `assault`
 * breaks the walls with the ram, and `blockade` starves the settlement into
 * surrender. The two are alternatives rather than stages.
 */
export type SiegePath = 'assault' | 'blockade';

/** Set the shape the Squads hold: their frontage and depth (PLAN §4). */
export interface FormationCommand extends CommandBase {
  readonly kind: 'formation';
  readonly squads: readonly number[];
  readonly formation: Formation;
}

/**
 * Bind Squads to a numbered control group, so the Player can call them back
 * with one key instead of re-selecting them.
 *
 * The binding belongs to the Player, not to the Squads: it orders nobody. It is
 * in the vocabulary because the human emits it into the same stream as every
 * other Command, and a recorded log has to carry it so a replay re-enacts the
 * selection as well as the Commands (E2). An empty `squads` list clears the
 * group.
 */
export interface GroupCommand extends CommandBase {
  readonly kind: 'group';
  readonly group: number;
  readonly squads: readonly number[];
}

/** The closed vocabulary: one union, twelve Commands, and no way to add one quietly. */
export type Command =
  | MoveCommand
  | AttackMoveCommand
  | AttackCommand
  | AttackStructureCommand
  | HoldCommand
  | GarrisonCommand
  | WithdrawCommand
  | BuildCommand
  | RecruitCommand
  | AssaultCommand
  | BlockadeCommand
  | FormationCommand
  | GroupCommand
  | CancelPendingCommand
  | FortificationRepairCommand;

/** The `kind` of any Command in the vocabulary. */
export type CommandKind = Command['kind'];

/**
 * Every kind, in the order `docs/COMMANDS.md` documents them.
 *
 * A runtime list rather than only a type, because three callers need the
 * vocabulary as data: the reader that refuses an unknown kind, the test that
 * checks the document against the code, and the protocol that lets an external
 * agent ask what it may say.
 */
export const COMMAND_KINDS: readonly CommandKind[] = [
  'move',
  'attackMove',
  'attack',
  'hold',
  'garrison',
  'withdraw',
  'build',
  'recruit',
  'assault',
  'blockade',
  'formation',
  'group',
  'cancelPending',
  'repairFortification',
  'cancelFortificationRepair',
  'attackStructure',
];

/** Every formation a Squad can hold: frontage and depth, in the order `docs/COMMANDS.md` lists them. */
export const FORMATIONS: readonly Formation[] = ['line', 'column'];

/** The control groups a Player can bind: the digits on the keyboard's top row. */
const MIN_GROUP = 1;
const MAX_GROUP = 9;

/** Builds a Move Command. @throws CommandValidationError when it names no Squad, or a tile that is not one. */
export function move(
  faction: Faction,
  squads: readonly number[],
  x: number,
  y: number,
): MoveCommand {
  return readMove({ kind: 'move', faction, squads, x, y }, ROOT);
}

/** Builds an Attack-move Command. @throws CommandValidationError as `move` does. */
export function attackMove(
  faction: Faction,
  squads: readonly number[],
  x: number,
  y: number,
): AttackMoveCommand {
  return readAttackMove({ kind: 'attackMove', faction, squads, x, y }, ROOT);
}

/** Builds an Attack Command. @throws CommandValidationError when it names no attacker or no enemy Squad. */
export function attack(
  faction: Faction,
  squads: readonly number[],
  target: number,
): AttackCommand {
  return readAttack({ kind: 'attack', faction, squads, target }, ROOT);
}

/** Build an explicit structure attack. */
export function attackStructure(faction: Faction, squads: readonly number[],
  target: AttackStructureCommand['target']): AttackStructureCommand {
  return readAttackStructure({ kind: 'attackStructure', faction, squads, target }, ROOT);
}

/** Builds a Hold Command. @throws CommandValidationError when it names no Squad. */
export function hold(faction: Faction, squads: readonly number[]): HoldCommand {
  return readHold({ kind: 'hold', faction, squads }, ROOT);
}

/** Builds a Garrison Command. @throws CommandValidationError when it names no Squad or no settlement. */
export function garrison(
  faction: Faction,
  squads: readonly number[],
  settlement: number,
): GarrisonCommand {
  return readGarrison({ kind: 'garrison', faction, squads, settlement }, ROOT);
}

/** Builds a Withdraw Command. @throws CommandValidationError when it names no Squad. */
export function withdraw(faction: Faction, squads: readonly number[]): WithdrawCommand {
  return readWithdraw({ kind: 'withdraw', faction, squads }, ROOT);
}

/** Builds a Build Command. @throws CommandValidationError when the building has no id or the settlement is not one. */
export function build(faction: Faction, settlement: number, building: string): BuildCommand {
  return readBuild({ kind: 'build', faction, settlement, building }, ROOT);
}

/** Builds a Recruit Command. @throws CommandValidationError when the size or count is not positive, or the type has no id. */
export function recruit(
  faction: Faction,
  settlement: number,
  squadType: string,
  men: number,
  count: number,
): RecruitCommand {
  return readRecruit({ kind: 'recruit', faction, settlement, squadType, men, count }, ROOT);
}

/** Builds an Assault Command. @throws CommandValidationError when it names no Squad or no settlement. */
export function assault(
  faction: Faction,
  squads: readonly number[],
  settlement: number,
): AssaultCommand {
  return readAssault({ kind: 'assault', faction, squads, settlement }, ROOT);
}

/** Builds a Blockade Command. @throws CommandValidationError when it names no Squad or no settlement. */
export function blockade(
  faction: Faction,
  squads: readonly number[],
  settlement: number,
): BlockadeCommand {
  return readBlockade({ kind: 'blockade', faction, squads, settlement }, ROOT);
}

/** Builds a Formation Command. @throws CommandValidationError when it names no Squad or no shape. */
export function formation(
  faction: Faction,
  squads: readonly number[],
  shape: Formation,
): FormationCommand {
  return readFormation({ kind: 'formation', faction, squads, formation: shape }, ROOT);
}

/**
 * Builds a control-group binding. `squads` may be empty, which clears the group.
 * @throws CommandValidationError when the group is not one to nine.
 */
export function group(
  faction: Faction,
  groupIndex: number,
  squads: readonly number[] = [],
): GroupCommand {
  return readGroup({ kind: 'group', faction, group: groupIndex, squads }, ROOT);
}

/**
 * Reads a Command out of data that has not been checked: a JSON line from an
 * external agent, a message from another process, a hand-written fixture.
 *
 * The returned Command is a fresh plain object with fresh arrays, holding only
 * the fields the vocabulary names. Unknown fields are refused rather than
 * ignored, because `squad` is a typo for `squads` and a Command that silently
 * commands nobody is the worst kind of accepted input.
 *
 * @throws CommandValidationError when the value is not a Command, or is one
 *   carrying something the vocabulary does not allow.
 */
export function validateCommand(value: unknown): Command {
  const candidate = requireRecord(value, ROOT);
  const kind = requireKind(candidate.kind, `${ROOT}.kind`);

  return READERS[kind](candidate, ROOT);
}

/** The path a Command read from outside is rooted at, so errors say `command.x`. */
const ROOT = 'command';

/** A candidate Command, once it is known to be a plain object. */
type Candidate = Record<string, unknown>;

/** A reader per kind: the vocabulary is closed, so this table is exhaustive. */
const READERS: {
  readonly [Kind in CommandKind]: (value: Candidate, path: string) => Command;
} = {
  move: readMove,
  attackMove: readAttackMove,
  attack: readAttack,
  attackStructure: readAttackStructure,
  hold: readHold,
  garrison: readGarrison,
  withdraw: readWithdraw,
  build: readBuild,
  recruit: readRecruit,
  assault: readAssault,
  blockade: readBlockade,
  formation: readFormation,
  group: readGroup,
  cancelPending: readCancelPending,
  repairFortification: (value, path) => readFortificationRepair('repairFortification', value, path),
  cancelFortificationRepair: (value, path) => readFortificationRepair('cancelFortificationRepair', value, path),
};

function readFortificationRepair(kind: FortificationRepairCommand['kind'], value: Candidate, path: string): FortificationRepairCommand {
  requireFields(value, path, kind, ['kind', FACTION_FIELD, 'settlement', 'structure', 'side']);
  if (value.structure !== 'wall' && value.structure !== 'gate') throw new CommandValidationError(`${path}.structure`, 'must be wall or gate');
  if (value.side !== 'north' && value.side !== 'east' && value.side !== 'south' && value.side !== 'west')
    throw new CommandValidationError(`${path}.side`, 'must be a cardinal direction');
  return { kind, faction: requireFaction(value.faction, `${path}.faction`),
    settlement: requireId(value.settlement, `${path}.settlement`, 'settlement'), structure: value.structure, side: value.side };
}

export function repairFortification(faction: Faction, settlement: number, structure: 'wall' | 'gate', side: Facing): FortificationRepairCommand {
  return readFortificationRepair('repairFortification', { kind: 'repairFortification', faction, settlement, structure, side }, ROOT);
}

export function cancelFortificationRepair(faction: Faction, settlement: number, structure: 'wall' | 'gate', side: Facing): FortificationRepairCommand {
  return readFortificationRepair('cancelFortificationRepair', { kind: 'cancelFortificationRepair', faction, settlement, structure, side }, ROOT);
}

/** The fields a march carries: a Move and an Attack-move differ only in their name. */
interface March {
  readonly faction: Faction;
  readonly squads: readonly number[];
  readonly x: number;
  readonly y: number;
}

/** The fields Hold and Withdraw carry: the Faction, and the Squads it addresses. */
interface SquadFields {
  readonly faction: Faction;
  readonly squads: readonly number[];
}

/** The field list a Command that names only Squads carries. */
const SQUAD_FIELDS = ['kind', FACTION_FIELD, 'squads'] as const;

function readMove(value: Candidate, path: string): MoveCommand {
  return { kind: 'move', ...readMarch('move', value, path) };
}

function readAttackMove(value: Candidate, path: string): AttackMoveCommand {
  return { kind: 'attackMove', ...readMarch('attackMove', value, path) };
}

function readMarch(kind: 'move' | 'attackMove', value: Candidate, path: string): March {
  requireFields(value, path, kind, ['kind', FACTION_FIELD, 'squads', 'x', 'y']);

  return {
    faction: requireFaction(value.faction, `${path}.faction`),
    squads: requireSquads(value.squads, `${path}.squads`),
    x: requireCoordinate(value.x, `${path}.x`),
    y: requireCoordinate(value.y, `${path}.y`),
  };
}

function readAttack(value: Candidate, path: string): AttackCommand {
  requireFields(value, path, 'attack', ['kind', FACTION_FIELD, 'squads', 'target']);

  return {
    kind: 'attack',
    faction: requireFaction(value.faction, `${path}.faction`),
    squads: requireSquads(value.squads, `${path}.squads`),
    target: requireId(value.target, `${path}.target`, 'Squad'),
  };
}

function readAttackStructure(value: Candidate, path: string): AttackStructureCommand {
  requireFields(value, path, 'attackStructure', ['kind', FACTION_FIELD, 'squads', 'target']);
  const target = requireRecord(value.target, `${path}.target`);
  if (target.kind === 'work') {
    requireFields(target, `${path}.target`, 'attackStructure', ['kind', 'settlement', 'building', 'ordinal']);
    return { kind: 'attackStructure', faction: requireFaction(value.faction, `${path}.faction`),
      squads: requireSquads(value.squads, `${path}.squads`),
      target: { kind: 'work', settlement: requireId(target.settlement, `${path}.target.settlement`, 'settlement'),
        building: requireContentId(target.building, `${path}.target.building`, 'building'),
        ordinal: requireId(target.ordinal, `${path}.target.ordinal`, 'ordinal') } };
  }
  requireFields(target, `${path}.target`, 'attackStructure', ['kind', 'id']);
  if (target.kind !== 'camp') throw new CommandValidationError(`${path}.target.kind`, 'must be camp or work');
  return { kind: 'attackStructure', faction: requireFaction(value.faction, `${path}.faction`),
    squads: requireSquads(value.squads, `${path}.squads`),
    target: { kind: 'camp', id: requireId(target.id, `${path}.target.id`, 'camp') } };
}

function readHold(value: Candidate, path: string): HoldCommand {
  requireFields(value, path, 'hold', SQUAD_FIELDS);

  return { kind: 'hold', ...readSquadFields(value, path) };
}

/** The fields a settlement Command carries, shared by Garrison, Assault and Blockade. */
const SETTLEMENT_COMMAND_FIELDS = ['kind', FACTION_FIELD, 'squads', 'settlement'] as const;

function readGarrison(value: Candidate, path: string): GarrisonCommand {
  requireFields(value, path, 'garrison', SETTLEMENT_COMMAND_FIELDS);

  return {
    kind: 'garrison',
    faction: requireFaction(value.faction, `${path}.faction`),
    squads: requireSquads(value.squads, `${path}.squads`),
    settlement: requireId(value.settlement, `${path}.settlement`, 'settlement'),
  };
}

function readWithdraw(value: Candidate, path: string): WithdrawCommand {
  requireFields(value, path, 'withdraw', SQUAD_FIELDS);

  return { kind: 'withdraw', ...readSquadFields(value, path) };
}

/** The fields a Command carries when all it says is whom it addresses. */
function readSquadFields(value: Candidate, path: string): SquadFields {
  return {
    faction: requireFaction(value.faction, `${path}.faction`),
    squads: requireSquads(value.squads, `${path}.squads`),
  };
}

function readBuild(value: Candidate, path: string): BuildCommand {
  requireFields(value, path, 'build', ['kind', FACTION_FIELD, 'settlement', 'building']);

  return {
    kind: 'build',
    faction: requireFaction(value.faction, `${path}.faction`),
    settlement: requireId(value.settlement, `${path}.settlement`, 'settlement'),
    building: requireContentId(value.building, `${path}.building`, 'building'),
  };
}

function readCancelPending(value: Candidate, path: string): CancelPendingCommand {
  requireFields(value, path, 'cancelPending', ['kind', FACTION_FIELD, 'settlement', 'order']);
  return { kind: 'cancelPending', faction: requireFaction(value.faction, `${path}.faction`),
    settlement: requireId(value.settlement, `${path}.settlement`, 'settlement'),
    order: requireId(value.order, `${path}.order`, 'pending order') };
}

export function cancelPending(faction: Faction, settlement: number, order: number): CancelPendingCommand {
  return readCancelPending({ kind: 'cancelPending', faction, settlement, order }, ROOT);
}

function readRecruit(value: Candidate, path: string): RecruitCommand {
  requireFields(value, path, 'recruit', [
    'kind',
    FACTION_FIELD,
    'settlement',
    'squadType',
    'men',
    'count',
  ]);

  return {
    kind: 'recruit',
    faction: requireFaction(value.faction, `${path}.faction`),
    settlement: requireId(value.settlement, `${path}.settlement`, 'settlement'),
    squadType: requireContentId(value.squadType, `${path}.squadType`, 'Squad type'),
    men: requirePositive(value.men, `${path}.men`, 'size'),
    count: requirePositive(value.count, `${path}.count`, 'count'),
  };
}

function readAssault(value: Candidate, path: string): AssaultCommand {
  requireFields(value, path, 'assault', SETTLEMENT_COMMAND_FIELDS);

  return {
    kind: 'assault',
    faction: requireFaction(value.faction, `${path}.faction`),
    squads: requireSquads(value.squads, `${path}.squads`),
    settlement: requireId(value.settlement, `${path}.settlement`, 'settlement'),
  };
}

function readBlockade(value: Candidate, path: string): BlockadeCommand {
  requireFields(value, path, 'blockade', SETTLEMENT_COMMAND_FIELDS);

  return {
    kind: 'blockade',
    faction: requireFaction(value.faction, `${path}.faction`),
    squads: requireSquads(value.squads, `${path}.squads`),
    settlement: requireId(value.settlement, `${path}.settlement`, 'settlement'),
  };
}

function readFormation(value: Candidate, path: string): FormationCommand {
  requireFields(value, path, 'formation', ['kind', FACTION_FIELD, 'squads', 'formation']);

  return {
    kind: 'formation',
    faction: requireFaction(value.faction, `${path}.faction`),
    squads: requireSquads(value.squads, `${path}.squads`),
    formation: requireFormation(value.formation, `${path}.formation`),
  };
}

function readGroup(value: Candidate, path: string): GroupCommand {
  requireFields(value, path, 'group', ['kind', FACTION_FIELD, 'group', 'squads']);

  return {
    kind: 'group',
    faction: requireFaction(value.faction, `${path}.faction`),
    group: requireGroup(value.group, `${path}.group`),
    squads: requireBoundSquads(value.squads, `${path}.squads`),
  };
}

/** A control-group binding may be empty, because an empty group is how one is cleared. */
function requireBoundSquads(value: unknown, path: string): readonly number[] {
  return requireSquads(value, path, true);
}

/**
 * A Command is a plain object: not a class instance, not an array, not a Map
 * that happens to have the fields. `JSON.parse` and the constructors above both
 * produce exactly this, and nothing else is data a replay can carry.
 */
function requireRecord(value: unknown, path: string): Candidate {
  if (!isPlainRecord(value)) {
    throw new CommandValidationError(
      path,
      `is not a Command: expected a plain object, got ${describe(value)}`,
    );
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new CommandValidationError(path, 'is keyed by a symbol, and a Command has plain string fields only');
  }

  return value;
}

/** @throws CommandValidationError when the kind is not one of the vocabulary's. */
function requireKind(value: unknown, path: string): CommandKind {
  if (typeof value !== 'string' || !(COMMAND_KINDS as readonly string[]).includes(value)) {
    throw new CommandValidationError(
      path,
      `is not a Command kind: expected one of ${COMMAND_KINDS.join(', ')}, got ${String(value)}`,
    );
  }

  return value as CommandKind;
}

/**
 * Every field a Command carries must be one the vocabulary names, and the
 * vocabulary names only these: a typo becomes an error at the seam rather than
 * a Command that quietly does nothing.
 */
function requireFields(value: Candidate, path: string, kind: CommandKind, allowed: readonly string[]): void {
  for (const field of Object.keys(value)) {
    if (!allowed.includes(field)) {
      throw new CommandValidationError(
        `${path}.${field}`,
        `is not a field of a ${kind} command`,
      );
    }
  }
}

/** @throws CommandValidationError when the value is not one of the two Factions. */
function requireFaction(value: unknown, path: string): Faction {
  if (!isFaction(value)) {
    throw new CommandValidationError(
      path,
      `is not one of the two Factions (${FACTIONS.join(', ')}), got ${String(value)}`,
    );
  }

  return value;
}

/**
 * The Squads a Command addresses: each a whole non-negative id, no id twice, and
 * at least one unless the Command is one where an empty list means something —
 * a control-group binding clears a group that way.
 */
function requireSquads(value: unknown, path: string, allowEmpty = false): readonly number[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new CommandValidationError(
      path,
      allowEmpty ? 'is not a list of Squad ids' : 'is not a non-empty list of Squad ids',
    );
  }

  const squads = value.map((id, index) => requireId(id, `${path}[${index}]`, 'Squad'));

  if (new Set(squads).size !== squads.length) {
    throw new CommandValidationError(path, `names the same Squad twice: ${squads.join(', ')}`);
  }

  return squads;
}

/** @throws CommandValidationError when the value is not a whole number of at least one. */
function requirePositive(value: unknown, path: string, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new CommandValidationError(path, `is not a positive ${what}: ${String(value)}`);
  }

  return value;
}

/** @throws CommandValidationError when the value is not a non-empty id from the content table. */
function requireContentId(value: unknown, path: string, what: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new CommandValidationError(path, `is not a ${what} id: ${String(value)}`);
  }

  return value;
}

/** @throws CommandValidationError when the value is not one of the formations a Squad can hold. */
function requireFormation(value: unknown, path: string): Formation {
  if (typeof value !== 'string' || !(FORMATIONS as readonly string[]).includes(value)) {
    throw new CommandValidationError(
      path,
      `is not a formation: expected ${FORMATIONS.join(' or ')}, got ${String(value)}`,
    );
  }

  return value as Formation;
}

/** @throws CommandValidationError when the value is not one of the control group numbers. */
function requireGroup(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_GROUP || value > MAX_GROUP) {
    throw new CommandValidationError(
      path,
      `is not a control group number: expected ${MIN_GROUP} to ${MAX_GROUP}, got ${String(value)}`,
    );
  }

  return value;
}

/** @throws CommandValidationError when the value is not a whole, non-negative id. */
function requireId(value: unknown, path: string, what: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new CommandValidationError(path, `is not a ${what} id: ${String(value)}`);
  }

  return value;
}

/**
 * A tile coordinate. The vocabulary says it is a whole number and no less than
 * zero; the map says which tiles exist, and that is the rules' question, not
 * the vocabulary's (B1).
 */
function requireCoordinate(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new CommandValidationError(path, `is not a tile coordinate: ${String(value)}`);
  }

  return value;
}

/** Whether `value` is the kind of plain object a Command has to be. */
function isPlainRecord(value: unknown): value is Candidate {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

/** A short description of a value that cannot be a Command, for the failure message. */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') return 'an object that is not plain';

  return `${typeof value} ${String(value)}`;
}
