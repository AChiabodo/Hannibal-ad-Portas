# The Command vocabulary

A Match is driven by exactly one kind of thing: a **Controller** that reads an
**Observation** and emits **Commands**. The human input handler, the built-in
AI, a scripted test driver and an external agent are all Controllers
(`GLOSSARY.md` defines the words); they differ in nothing else.

This file is the whole public control surface. If it is not here, a Player
cannot do it, and adding a Command means implementing it twice — once for a
human clicking and once for a machine emitting it — which is why the set is
kept small on purpose (PLAN §3, ADR-0003).

## The seam

```
Observation  ──►  Controller  ──►  Commands
what a Faction     the mind          the Commands
may know
```

Once per tick, for each of the two Players, the driver:

1. hands the Controller the world filtered for **its own Faction**, stamped with
   the Faction and the tick being decided;
2. reads what it returns through the vocabulary below, refusing anything that is
   not a Command;
3. refuses any Command addressed to the *other* Faction: a Controller commands
   its own Faction and no other;
4. applies what is left to the tick, and writes it to the log.

A log comes back the same way. The entry point for one that arrived from outside
a Match — as text from an external agent, or a file attached to a bug report —
is `replayCommands` (`src/sim/replay.ts`), and it reads every line through the
vocabulary below before the first tick runs, so a word that is not a Command is
refused with the field named instead of reaching the rules.

This file is the vocabulary; the *transport* an external agent uses — the messages
it is handed, how often it is asked, what a deadline means — is
[docs/PROTOCOL.md](PROTOCOL.md). The Commands below are what it writes on that
wire, unchanged: a process emits exactly what a human's hands and the built-in AI
emit.

A Controller can read nothing else: not the other Faction's Squads, not the
Match state, not the seed. `Observation` carries a projection of the world that
the rules supply, and a Controller that reaches for anything else fails to
compile — that is tested, not promised.

The one thing an external agent is told that is not in its Observation is the
run's own paperwork — its Faction, the seed, the tick bound, its roster — in the
protocol's `hello`, which is the harness speaking and not a second window on the
world: an agent still learns where the enemy is only by looking (`PROTOCOL.md`).

## What every Command carries

- **`kind`** — one of the twelve Commands in the table below. Nothing else is a
  Command.
- **`faction`** — `"rome"` or `"carthage"`: the Faction that issued the Command. It
  is part of the Command because a log has to be readable without the Players
  that produced it, and because it is how the seam refuses a Command aimed at the
  other Faction.
- **Squad ids and settlement ids** — whole numbers, zero or more, exactly as an
  Observation names them. A list of Squads is never empty and never names the
  same Squad twice; the one exception is a control-group binding, where an empty
  list means "clear this group".
- **`x`, `y`** — tile coordinates: whole numbers, zero or more. Whether a tile
  exists, is walkable, or is held by the enemy is a question about the map, and
  the rules of the tick answer it.

## The vocabulary

<!-- vocabulary:start -->
| Command       | Fields                                    | What it orders                                                                                          |
| ------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `move`        | `faction`, `squads`, `x`, `y`             | March to separate legal arrivals near `x, y` and hold there (see below).                               |
| `attackMove`  | `faction`, `squads`, `x`, `y`             | Use the same arrival allocation, engaging whatever is met on the way.                                 |
| `attack`      | `faction`, `squads`, `target`             | Attack one enemy Squad.                                                                                 |
| `hold`        | `faction`, `squads`                       | Hold position: stand, face the enemy, do not pursue.                                                    |
| `garrison`    | `faction`, `squads`, `settlement`         | Take up garrison inside a settlement: man its walls instead of the field.                                |
| `withdraw`    | `faction`, `squads`                       | Break off and fall back. Which ground is behind you is the rules' question, not the Command's.          |
| `build`       | `faction`, `settlement`, `building`       | Start building `building` in a settlement: a labour allocation plus a timer, not a construction site.   |
| `recruit`     | `faction`, `settlement`, `squadType`, `men`, `count` | Raise `count` Squads of `squadType`, each of `men` real soldiers, in a settlement.                  |
| `assault`     | `faction`, `squads`, `settlement`         | Take a settlement by force. Fast, expensive, needs the ram, and Rome's alone (ADR-0008).                |
| `blockade`    | `faction`, `squads`, `settlement`         | Starve a settlement into surrender. Slow, cheap in lives, breakable by a relieving army (ADR-0008).     |
| `formation`   | `faction`, `squads`, `formation`          | Set the shape the Squads hold: `line` for frontage, `column` for depth (PLAN §4).                       |
| `group`       | `faction`, `group`, `squads`              | Bind Squads to a numbered control group, or clear it with an empty list.                                |
<!-- vocabulary:end -->

### Ground arrival allocation (#68)

One eligible Squad still marches to the exact clicked Tile. For a group, owned
Squads in good order are allocated in ascending ID order, independently of the
Command's list order. The first reachable Squad claims the click; subsequent
Squads take the nearest available walkable Tile within twelve Tiles on each
axis. Squared distance to the click orders candidates, then y, then x. Each
candidate must be on the click's connected landmass and reachable from the Squad.

Separation uses the purchased files/ranks shared with the formation declaration,
including column depth and a specialist's declared Figure count. Its conservative
radius in Tiles is `ceil(max(files, ranks) / 6) + 1`; two arrival centres must be
at least the sum of their radii apart on one axis, regardless of arrival facing.
This reserves arrivals within this Command only. It introduces no occupancy or
collision rules: routes may overlap, including through one-Tile fords.

Off-map and water clicks refuse the whole ground order with `off-map` or `water`.
Disconnected Squads receive `unreachable` and claim no slot. An eligible Squad
with no separated reachable candidate in the neighbourhood receives `no-space`
(**Spazio insufficiente vicino alla destinazione**). Allocation is greedy in ID
order; it never relocates an earlier assignment to fit a later Squad. Refused
Squads keep their previous route and step timer; accepted peers proceed. The
Observation exposes each assigned goal and refusal; selection exceptions and
notices explain partial execution. Rout/ownership eligibility remains unchanged.

Repeating an unchanged group order yields the same arrivals and preserves step
progress. A later accepted order replaces the route; paused Commands retain
their submission order and are applied on resume. Explicit `attack`, `garrison`,
`assault` and `blockade` retain their enemy/settlement target semantics.

This intentionally changes rule hashes for Records containing multi-Squad ground
Commands (including `march` and `roster`); old checkpoints can diverge. The seed
and logged Commands still reproduce deterministically under these rules. No
Command fields, random draws or state fields were added; `no-space` appends
refusal code 3 without renumbering the existing codes.

### Content and control groups

`building` and `squadType` are ids from the content table (`content/`, B6 and
C4). The vocabulary fixes that a name goes there; the rules refuse names they do
not know.

`men` is one of the type's real sizes, not a free number: Rome raises its melee
infantry at `24`, `60` or `120`, Carthage at `24` or `48`, and a specialist at
its one starting size (24 Balearic slingers, 12 Numidian horse, one elephant
whose abstract strength is 24). A size the type does not offer is a Command the
rules refuse, not one rounded to another size. The purchase is quoted from the
type's 24-man price and scales in exact proportion, and the Squads raised
remember the men they were recruited with as their capacity even after combat
reduces their survivors (ADR-0026, ADR-0027).

`group` is a number from 1 to 9. A control group binds Squads to a key: it
**commands nobody**. It is the Player's own memory of a selection, recorded so
that a replay re-enacts the selection as well as the Commands. A human's
interface turns "order group 2" into the Commands for the Squads in it; a machine
keeps its own lists.

## Examples

One Command per line — JSON Lines, which is how a log is written too — as an
external agent would write them. Every example below is a valid Command: it is fed back through the
vocabulary's own reader by the test suite, so a document that drifts from the
code fails the build.

<!-- examples:start -->
```jsonl
{ "kind": "move", "faction": "rome", "squads": [3, 5], "x": 42, "y": 17 }
{ "kind": "attackMove", "faction": "carthage", "squads": [7], "x": 12, "y": 30 }
{ "kind": "attack", "faction": "rome", "squads": [3, 5], "target": 9 }
{ "kind": "hold", "faction": "rome", "squads": [3, 5] }
{ "kind": "garrison", "faction": "rome", "squads": [3], "settlement": 12 }
{ "kind": "withdraw", "faction": "carthage", "squads": [7] }
{ "kind": "build", "faction": "rome", "settlement": 12, "building": "castrum" }
{ "kind": "recruit", "faction": "carthage", "settlement": 12, "squadType": "libyan-spear", "men": 48, "count": 3 }
{ "kind": "assault", "faction": "rome", "squads": [3], "settlement": 12 }
{ "kind": "blockade", "faction": "carthage", "squads": [7], "settlement": 12 }
{ "kind": "formation", "faction": "rome", "squads": [3, 5], "formation": "column" }
{ "kind": "group", "faction": "rome", "group": 2, "squads": [3, 5] }
```
<!-- examples:end -->

## Compatibility with earlier logs

Before P2 a `recruit` had no `men` field. Such a log is **rejected explicitly**
at the vocabulary (`the command at command.men is not a positive size: undefined`)
rather than given a default: a deterministic default would silently reinterpret
an old purchase at a different size and price. Re-record the log with the real
size it meant. The rules' state hash also moved with P2's capacity and Payroll
fields; that is a documented baseline change, not a presentation-neutral one.

## Malformed, and illegal

Two refusals live at different layers, and the difference matters.

**Malformed** means it is not a Command: the vocabulary refuses it at the seam,
saying where the value went wrong.

- a `kind` that is not one of the twelve;
- a field the vocabulary does not have — `squad` is a typo for `squads`, and a
  Command that silently orders nobody is the worst kind of accepted input;
- a missing field, a field of the wrong type, a fraction, a negative id, an
  integer past the exact range of a number;
- an empty or repeated Squad list, where an empty one is not meaningful;
- a `faction` that is neither Rome nor Carthage, a `formation` that is neither
  `line` nor `column`, a control group outside 1 to 9.

A refusal names the path, so a log can be debugged from the message alone:

```
the command at command.squads[1] is not a Squad id: 1.5
```

**Illegal** means it is a Command, but not one that Faction may issue now: an
enemy Squad, a tile in the sea, a building nobody can afford, an Assault by
Carthage, a Blockade with nothing to besiege. Only the rules of the tick can answer that,
because only they can look at the world and say why, so `command.ts` owns the
first question and nothing of the second.

## Replay

The driver writes down every Command it applied, stamped with the tick it
applied on, in application order — Rome's Commands before Carthage's, always,
whatever order the two Players were handed to the driver in. A Match is a seed
plus that log and nothing else: a scripted Controller plays the log back, and the
Match happens again, hash for hash (E2).

Commands are plain JSON, so a log is small enough to attach to an issue, and an
agent can be handed one to imitate.

## Adding a Command

Three places, in one commit:

1. `src/sim/command.ts` — the interface, the reader, the constructor, and the
   new kind in `COMMAND_KINDS`;
2. this file — the table row, its field list and a JSON example;
3. `tests/sim/one-of-each.ts` — the fixture, which the tests read.

The documentation test fails until all three agree. Before adding one, sit with
the rule at the top of this file: a Command has to be implementable twice, once
for a human clicking and once for a machine emitting it. If it cannot be, it is
not a Command.
