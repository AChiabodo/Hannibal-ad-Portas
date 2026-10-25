/**
 * An agent, written from `docs/PROTOCOL.md` and nothing else.
 *
 * It imports nothing from this repository on purpose: the point of the protocol
 * is that whoever is on the other end of the pipe does not have the game's
 * source, and an example that reached into `src/` would prove the opposite of
 * what it is for. Everything below is JSON in and JSON out.
 *
 * What it plays is a small, honest plan and not an AI: raise two Squads, march
 * them over the theatre a band at a time until the enemy Stronghold is seen, then
 * put everything into a Blockade at its walls. Against an idle opponent that
 * takes the Stronghold and wins the Match; against the built-in AI it usually
 * loses, which is the correct result for a script with no notion of a threat.
 *
 * Run it with:
 *
 *   npm run agent -- --agent examples/agent.ts --seed 7 --opponent idle
 */
import { createInterface } from 'node:readline';

/** A tile, as the protocol carries a coordinate. */
interface Tile {
  readonly x: number;
  readonly y: number;
}

/** A Squad of our own, as far as this script reads one. */
interface Squad {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly goal: Tile | null;
  readonly refused: string | null;
}

/** A settlement we hold. */
interface Settlement {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly tier: number;
  readonly stocks: { readonly grain: number; readonly timber: number; readonly stone: number; readonly iron: number };
}

/** A front we can see: ours, or the enemy's once it is sighted. */
interface Front {
  readonly settlement: number;
  readonly structures: readonly { readonly hp: number }[];
}

/** One Faction's Observation, in the fields this script uses. */
interface Observation {
  readonly squads: readonly Squad[];
  readonly settlements: readonly Settlement[];
  readonly contacts: readonly { readonly kind: string; readonly id: number; readonly x: number; readonly y: number }[];
  readonly fronts: readonly Front[];
}

/** One Squad type the harness says we may raise. */
interface SquadType {
  readonly id: string;
  readonly tier: number;
  readonly cost: { readonly grain: number; readonly iron: number };
  readonly sizes: readonly number[];
}

/** The harness's first message: who we are, what we may say, and how big the theatre is. */
interface Hello {
  readonly type: 'hello';
  readonly faction: string;
  readonly map: { readonly width: number; readonly height: number };
  readonly squadTypes: readonly SquadType[];
}

/** The harness's question. */
interface Question {
  readonly type: 'observation';
  readonly tick: number;
  readonly observation: Observation;
}

/** A message from the harness, as this script reads one. */
type FromHarness = Hello | Question | { readonly type: 'end' | 'stopped' };

/** A Command, as an agent writes one. */
interface Command {
  readonly kind: string;
  readonly faction: string;
  readonly [field: string]: unknown;
}

/** What this script remembers between decisions. */
interface Plan {
  faction: string;
  width: number;
  height: number;
  /** The Squad type we raise: the cheapest tier-1 type our Faction offers. */
  squadType: string;
  /** The real sizes our type offers, and its 24-man price. */
  sizes: readonly number[];
  cost: { readonly grain: number; readonly iron: number };
  /** The enemy Stronghold's settlement id, once it has been seen. */
  target: number | null;
  /** The tiles we march over, in the order we march over them. */
  waypoints: readonly Tile[];
  /** How many of them have been given to a Squad. */
  reached: number;
  /** Whether we have already thrown everything at the walls. */
  besieging: boolean;
}

const plan: Plan = {
  faction: 'rome',
  width: 96,
  height: 96,
  squadType: 'hastati',
  sizes: [24, 60, 120],
  cost: { grain: 8, iron: 2 },
  target: null,
  waypoints: [],
  reached: 0,
  besieging: false,
};

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  if (line.trim() === '') continue;

  const message = JSON.parse(line) as FromHarness;

  if (message.type === 'hello') greet(message);
  else if (message.type === 'observation') answer(message);
}

/** Takes the harness's greeting: our Faction, the shape of the map, our roster. */
function greet(hello: Hello): void {
  plan.faction = hello.faction;
  plan.width = hello.map.width;
  plan.height = hello.map.height;

  const tier1 = hello.squadTypes.filter((type) => type.tier === 1);
  const cheapest = tier1.reduce<SquadType | undefined>(
    (best, type) => (best === undefined || type.cost.grain < best.cost.grain ? type : best),
    undefined,
  );
  if (cheapest !== undefined) {
    plan.squadType = cheapest.id;
    plan.sizes = cheapest.sizes;
    plan.cost = cheapest.cost;
  }
}

/** One decision: raise, scout, or storm. */
function answer(question: Question): void {
  const visible = question.observation;
  const commands = decide(visible);

  process.stdout.write(`${JSON.stringify({ type: 'commands', tick: question.tick, commands })}\n`);
}

/** What to do with the Faction this tick, reading nothing but the Observation. */
function decide(visible: Observation): readonly Command[] {
  // Home is our own walled settlement — the only one with structures standing.
  const home = visible.settlements.find((settlement) =>
    visible.fronts.some((front) => front.settlement === settlement.id && front.structures.length > 0),
  );

  // Nothing to march: raise two Squads where they will be paid, which is home.
  // The size is the largest the settlement's stock can pay for right now; the
  // agent asks again on the next decision, so a second Squad is raised as soon
  // as production has covered it.
  if (visible.squads.length < 2) {
    if (home === undefined) return [];

    const price = (men: number) => Math.ceil((plan.cost.grain * men) / 24);
    const iron = (men: number) => Math.ceil((plan.cost.iron * men) / 24);
    const men = [...plan.sizes].reverse().find((size) => price(size) <= home.stocks.grain && iron(size) <= home.stocks.iron);
    if (men === undefined) return [];

    return [command({ kind: 'recruit', settlement: home.id, squadType: plan.squadType, men, count: 1 })];
  }

  // A Stronghold of the other Faction in our last-known contacts — the fog's
  // memory of a place, which is the only way we will ever know where it is.
  const enemyContact = visible.contacts.find((contact) => contact.kind === 'stronghold');
  if (enemyContact !== undefined) plan.target = enemyContact.id;

  const squads = visible.squads.map((squad) => squad.id);

  if (plan.target !== null) {
    if (plan.besieging) return [];

    plan.besieging = true;

    return [command({ kind: 'blockade', squads, settlement: plan.target })];
  }

  // Otherwise: sweep the theatre in bands, and see what is out there. A move is
  // given only when nobody is walking, so the Squads are never re-routed
  // mid-march, and a refused tile is skipped rather than asked for twice.
  if (home !== undefined && plan.waypoints.length === 0) plan.waypoints = sweep(home);

  if (visible.squads.some((squad) => squad.goal !== null)) return [];
  if (visible.squads.some((squad) => squad.refused !== null)) plan.reached += 1;

  const next = plan.waypoints[plan.reached];
  if (next === undefined) return [];

  plan.reached += 1;

  return [command({ kind: 'move', squads, x: next.x, y: next.y })];
}

/** A Command before the Faction is stamped on it: its kind, and the fields that kind carries. */
interface CommandFields {
  readonly kind: string;
  readonly [field: string]: unknown;
}

/** One Command, stamped with the Faction this agent plays. */
function command(fields: CommandFields): Command {
  return { ...fields, faction: plan.faction };
}

/**
 * The tiles to march over: bands of the theatre eight tiles apart, ordered from
 * the one nearest home, because a Squad sees four tiles and a band nobody walks
 * is a band nobody has looked at.
 */
function sweep(home: Settlement): readonly Tile[] {
  const rows: number[] = [];
  for (let y = 4; y < plan.height; y += 8) rows.push(y);
  rows.sort((left, right) => Math.abs(left - home.y) - Math.abs(right - home.y));

  return rows.flatMap((y, band) => {
    const columns: number[] = [];
    for (let x = 4; x < plan.width; x += 8) columns.push(x);
    if (band % 2 === 1) columns.reverse();

    return columns.map((x) => ({ x, y }));
  });
}
