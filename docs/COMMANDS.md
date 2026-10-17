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

A Controller can read nothing else: not the other Faction's Squads, not the
Match state, not the seed. `Observation` carries a projection of the world that
the rules supply, and a Controller that reaches for anything else fails to
compile — that is tested, not promised.

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
| `move`        | `faction`, `squads`, `x`, `y`             | March the Squads to the tile `x, y` and hold there.                                                     |
| `attackMove`  | `faction`, `squads`, `x`, `y`             | March to `x, y`, engaging whatever is met on the way.                                                   |
| `attack`      | `faction`, `squads`, `target`             | Attack one enemy Squad.                                                                                 |
| `hold`        | `faction`, `squads`                       | Hold position: stand, face the enemy, do not pursue.                                                    |
| `garrison`    | `faction`, `squads`, `settlement`         | Take up garrison inside a settlement: man its walls instead of the field.                                |
| `withdraw`    | `faction`, `squads`                       | Break off and fall back. Which ground is behind you is the rules' question, not the Command's.          |
| `build`       | `faction`, `settlement`, `building`       | Start building `building` in a settlement: a labour allocation plus a timer, not a construction site.   |
| `recruit`     | `faction`, `settlement`, `squadType`, `count` | Raise `count` Squads of `squadType` in a settlement.                                                |
| `assault`     | `faction`, `squads`, `settlement`         | Take a settlement by force. Fast, expensive, needs the ram, and Rome's alone (ADR-0008).                |
| `blockade`    | `faction`, `squads`, `settlement`         | Starve a settlement into surrender. Slow, cheap in lives, breakable by a relieving army (ADR-0008).     |
| `formation`   | `faction`, `squads`, `formation`          | Set the shape the Squads hold: `line` for frontage, `column` for depth (PLAN §4).                       |
| `group`       | `faction`, `group`, `squads`              | Bind Squads to a numbered control group, or clear it with an empty list.                                |
<!-- vocabulary:end -->

`building` and `squadType` are ids from the content table (`content/`, B6 and
C4). The vocabulary fixes that a name goes there; the rules refuse names they do
not know.

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
{ "kind": "recruit", "faction": "carthage", "settlement": 12, "squadType": "libyan-spear", "count": 3 }
{ "kind": "assault", "faction": "rome", "squads": [3], "settlement": 12 }
{ "kind": "blockade", "faction": "carthage", "squads": [7], "settlement": 12 }
{ "kind": "formation", "faction": "rome", "squads": [3, 5], "formation": "column" }
{ "kind": "group", "faction": "rome", "group": 2, "squads": [3, 5] }
```
<!-- examples:end -->

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
