# The external agent protocol

A Match is played by two **Players**, and a Player is whatever **Controller**
drives a Faction: the human's hands, the built-in AI, a scripted test driver, or
a process that is not this codebase at all (`GLOSSARY.md`, `docs/COMMANDS.md`).
This document is the last of those four.

One Match, one outside process, one pipe. The process reads what a human Player
sees — an **Observation**, filtered through its Faction's fog of war — and writes
what a human Player writes — **Commands** — and it is handed nothing else. There
is no second interface and no privileged one: the agent is a Controller with a
process boundary drawn through it, which is the whole claim of ADR-0003 made
checkable (ADR-0021).

If this document is right, an agent can be written from it alone. The skeleton
near the end is the proof by demonstration, and the test suite runs it.

## Running a Match

```
npm run agent -- --agent examples/agent.ts --seed 7 --opponent idle
```

The harness starts the file `--agent` names with the same Node that runs the
game, speaks this protocol to it over that process's standard input and output,
and plays a whole Match. `examples/agent.ts` is a working agent written from this
document; it imports nothing from the repository.

| Flag                  | What it means                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `--agent <file>`      | The agent: a file run by this Node. Required.                                                  |
| `--seed <n>`          | The Match's seed, an unsigned 32-bit integer. Default `1`.                                     |
| `--ticks <n>`         | The tick bound: the longest the Match may run, in whole ticks. Default three game years.       |
| `--faction <name>`    | The Faction the agent plays: `rome` or `carthage`. Default `rome`.                              |
| `--opponent <name>`   | Who plays the other Faction: `ai` (the built-in AI) or `idle` (nobody at all). Default `ai`.    |
| `--difficulty <name>` | The AI's level: `tiro`, `centurio` or `imperator`. Default `centurio`.                          |
| `--decision-ticks <n>`| How often the agent is asked, in ticks. Default `10`.                                          |
| `--deadline <ms>`     | How long one reply may take, in milliseconds. Default `2000`.                                  |
| `--log <file>`        | Write the Match's Command log here, one JSON line per Command.                                 |
| `--expect-hash <hex>` | Fail unless the Match ends on this state hash.                                                 |

The harness prints a JSON report on **its own** standard output, the way
`npm run match` does, and exits 0 whenever a Match was played — including one the
agent lost, timed out in, or died during. Exit 1 means a game invariant broke and
2 means the command line was misused.

## Framing

**JSON Lines**, both directions: one JSON object per line, UTF-8, `\n` after
each. A message is dispatched on its `type`, and a field the document does not
name makes the message unreadable rather than ignored — the protocol is closed
the way the Command vocabulary is.

- The agent's **standard output** is the protocol. Nothing else may be written
  there: not a log line, not a progress bar.
- The agent's **standard error** is its own. The harness passes it through to its
  own standard error, so an agent author can print whatever they like while
  debugging.

## The exchange

A Match is one `hello`, then a pair of messages per decision, then one `end`:

```
harness                                      agent
   │  hello ───────────────────────────────────►│      once, before the first tick
   │  observation (tick 0) ────────────────────►│      what you may see
   │◄──────────────────────────────── commands  │      what you want done on tick 0
   │                    … 340 turns later …     │
   │  observation (tick 3400) ─────────────────►│
   │◄──────────────────────────────── commands  │
   │  end ─────────────────────────────────────►│      the Match is over
```

The tick rate is 10 Hz and a Season is 210 seconds, so a three-year Match is
25 200 ticks. The harness asks the agent every `decisionTicks` ticks — every
second of Match time by default — and in between it answers "nothing" on the
agent's behalf: silence is always a legal answer, and one decision a second is
what an RTS Player has time to make. An Observation's `tick` is the tick being
decided, and a Command applies on that tick.

A decision interval is a cadence and not a handicap: the Faction the *harness*
plays decides on every tick, so an agent is playing at a coarser rhythm than the
AI unless it asks to be woken every tick (`--decision-ticks 1`). A `move` or an
`assault` is an order that outlives the tick it is given on, so a second between
decisions costs an agent nothing it cannot express.

## Messages

### `hello` — first, once

Who the agent is, what it may say, and what it is looking at.

<!-- hello:start -->
| Field           | What it carries                                                                    |
| --------------- | ---------------------------------------------------------------------------------- |
| `type`          | `"hello"`                                                                          |
| `protocol`      | The protocol version: `1`. An agent that does not know it has nothing to say.       |
| `faction`       | The Faction the agent plays: `"rome"` or `"carthage"`.                              |
| `seed`          | The Match's seed: the run's, not your Faction's. Every report this project prints carries it, and it lets an agent re-run the same Match — but it is not knowledge of the enemy, which only an Observation carries. |
| `ticks`         | The tick bound the Match will not run past.                                        |
| `map`           | `{ "width": 96, "height": 96 }`: the theatre in tiles.                              |
| `ticksPerSecond`| `10`: how many ticks a second of Match time holds.                                 |
| `decisionTicks` | How often the agent will be asked, in ticks.                                       |
| `deadlineMs`    | How long the harness waits for a reply, in milliseconds.                            |
| `commands`      | The twelve Command kinds, as `docs/COMMANDS.md` lists them.                         |
| `formations`    | `["line", "column"]`: the shapes a `formation` Command may name.                    |
| `terrain`       | The codes a terrain grid holds, as `{ "id": "plain", "code": 0 }` and so on.        |
| `squadTypes`    | The Squad types **your** Faction may raise: below.                                  |
| `buildings`     | The buildings **your** Faction may raise: below.                                    |
<!-- hello:end -->

Each entry of `squadTypes` — what a `recruit` may name, and what it will cost:

<!-- squad-type:start -->
| Field         | What it carries                                                           |
| ------------- | ------------------------------------------------------------------------- |
| `id`          | The Squad type's id: exactly what a `recruit` Command's `squadType` takes. |
| `faction`     | The Faction that raises it: always yours.                                  |
| `tier`        | The settlement tier it needs: a tier-3 type is not raised in a villa.      |
| `strength`    | The men a Squad of it is counted as.                                       |
| `arm`         | What it fights with: `"sword"`, `"spear"`, `"lance"`, `"bow"`, `"sling"` or `"beast"`. |
| `morale`      | The nerve it comes with.                                                   |
| `ammunition`  | Volleys of missiles it carries.                                            |
| `pace`        | Tiles' worth of ground per tile's cost: `1` on foot, `2` mounted.           |
| `payroll`     | What it owes each Season.                                                  |
| `cost`        | What raising one takes from a settlement's stocks: `{ grain, timber, stone, iron }`. |
<!-- squad-type:end -->

Each entry of `buildings` — what a `build` may name, and what it will cost:

<!-- building:start -->
| Field              | What it carries                                                       |
| ------------------ | ---------------------------------------------------------------------- |
| `id`               | The building's id: exactly what a `build` Command's `building` takes.   |
| `tier`             | The settlement tier it needs.                                          |
| `cost`             | What it takes from the settlement's stocks: `{ grain, timber, stone, iron }`. |
| `buildTicks`       | How much work it needs before it stands.                               |
| `labour`           | How many of the settlement's people it holds while it is being built.  |
| `yields`           | What it adds each Season, same four fields.                            |
| `denarii`          | What it adds to the treasury each Season.                              |
| `housing`          | How many more people the settlement can hold.                          |
| `storage`          | How much more stock the settlement can keep.                           |
| `raisesTier`       | The tier it raises the settlement to, or `0` for one that raises none. |
| `maxPerSettlement` | How many of it a settlement may have standing.                         |
<!-- building:end -->

### `observation` — every decision

One Faction's Observation: the world filtered through its fog of war, and nothing
outside it. What is not here, the Faction cannot know.

<!-- observation-message:start -->
| Field         | What it carries                                                   |
| ------------- | ----------------------------------------------------------------- |
| `type`        | `"observation"`                                                   |
| `tick`        | The tick being decided, before it is stepped.                     |
| `observation` | The Faction's Observation, below.                                  |
<!-- observation-message:end -->

<!-- observation:start -->
| Field         | What it carries                                                                       |
| ------------- | ------------------------------------------------------------------------------------- |
| `season`      | `"spring"`, `"summer"`, `"autumn"` or `"winter"`.                                     |
| `year`        | The game year, counted from one.                                                       |
| `treasury`    | Your denarii: one treasury per Faction.                                                |
| `territory`   | A **grid**: `1` on the tiles you draw supply from, `0` everywhere else.                |
| `settlements` | The settlements you hold, one record each: below.                                      |
| `squads`      | The Squads you keep, one record each: below.                                           |
| `fog`         | What you have seen of the ground, and what you see now.                                |
| `contacts`    | The enemies you have seen, at the tile you last saw them: `kind` (`squad`, `settlement`, `stronghold`), `id`, `x`, `y`, `seen` (the tick), `type` (for a Squad, or `null`). A place is a memory, not a live position. |
| `enemies`     | Enemy field Squads **in your sight right now**: `id`, `type`, `x`, `y`.                |
| `fronts`      | The Sieges you can read (see below).                                                   |
<!-- observation:end -->

Each entry of `settlements`:

<!-- settlement:start -->
| Field        | What it carries                                                             |
| ------------ | --------------------------------------------------------------------------- |
| `id`         | The settlement's id: what a `build`, `recruit` or `garrison` names it with.  |
| `x`, `y`     | The tile its centre stands on.                                              |
| `tier`       | `1`, `2` or `3`: what it may build and which Squad types it may raise.       |
| `population` | The people in it: the pool labour and land are divided from.                 |
| `stocks`     | What it holds of each resource: `{ grain, timber, stone, iron }`.            |
| `land`       | How its labour is divided between the works and the land, same four fields.  |
| `works`      | Its buildings in the order it raised them: `{ building, remaining, standing }`, where `remaining` is the ticks of work left. |
<!-- settlement:end -->

Each entry of `squads`:

<!-- squad:start -->
| Field         | What it carries                                                                    |
| ------------- | ---------------------------------------------------------------------------------- |
| `id`          | The Squad's id: what a Command names it with.                                      |
| `type`        | Its Squad type, by the id a `recruit` would name.                                  |
| `x`, `y`      | The tile it stands on.                                                             |
| `men`         | How many men are left in it: what a fight moves and what an army is worth.          |
| `figures`     | How many figures it is drawn as — its men, or one for a Beast.                     |
| `formation`   | `"line"` or `"column"`: the shape it holds.                                        |
| `facing`      | The side it faces: `"north"`, `"east"`, `"south"` or `"west"`.                     |
| `goal`        | The tile it is still walking to, `{ "x": …, "y": … }`, or `null` when it has arrived.|
| `refused`     | Why the last `move` could not be walked, or `null`.                                 |
| `morale`      | What it has left to fight with: the primary resource of a fight.                    |
| `fatigue`     | How tired it is: a tired Squad strikes weakly.                                      |
| `ammunition`  | Volleys of missiles it still carries: the first rounds of a contact are worth more. |
| `routing`     | Whether it has broken and is running.                                               |
| `engaged`     | Whether an enemy Squad is in contact with it right now.                             |
| `payroll`     | What it owes each Season.                                                          |
| `unpaid`      | Seasons in a row it has gone unpaid.                                               |
| `garrison`    | The settlement it is manning, or `null` when it is in the field.                    |
| `home`        | The settlement that raised it.                                                     |
| `inTerritory` | Whether it stands on ground of yours, where it draws supply.                        |
| `inCamp`      | Whether it stands in a camp, which counts as quarters for the winter.               |
<!-- squad:end -->

`fog`:

<!-- fog:start -->
| Field     | What it carries                                                              |
| --------- | ---------------------------------------------------------------------------- |
| `terrain` | A **grid** of terrain as last seen: `255` where you have never looked.        |
| `visible` | A **grid** of `1` where an eye covers the tile now, `0` where it does not.     |
<!-- fog:end -->

A **front** is one settlement's Siege as you read it — one of yours, one you are
besieging, or one an eye of yours covers:

```json
{
  "settlement": 12,
  "structures": [{ "kind": "gate", "side": "east", "hp": 120, "standing": true }],
  "breached": false,
  "siege": null,
  "besieger": null,
  "ram": null,
  "hold": 0,
  "garrison": 0
}
```

`siege` is `null`, `"assault"` or `"blockade"`; `besieger` is the Faction at the
walls or `null`; `ram` is `{ hp, remaining, built }` or `null`; `hold` counts
the capture checks the holder has held the centre with, and `garrison` counts the
Squads manning the walls. An open settlement has no `structures`, which is why
it is taken by standing on its centre rather than stormed.

### A grid

Three of an Observation's fields are 96×96 grids of small integers — `territory`,
`fog.terrain` and `fog.visible` — and they are **run-length encoded**, one string
per row, each a comma-separated list of `<count>x<value>` runs that adds up to
96:

<!-- grids:start -->
```jsonl
"96x0"
"4x0,90x1,2x0"
```
<!-- grids:end -->

`"96x0"` is a row that is one value all the way across, and
`"4x0,90x1,2x0"` is four 0s, ninety 1s and two more 0s.

Row 0 is `y = 0`, the top of the theatre, and tile `(x, y)` is the `x`-th tile of
row `y`. The encoding exists because a quarter of a megabyte of JSON arrays, once a
second of Match time, is not a protocol: a theatre that is mostly unexplored, or mostly
yours, is a handful of runs a row. The `terrain` legend arrives in `hello`, and
`255` is `unseen` — a tile no eye of yours has ever covered.

### `commands` — the agent's answer

The Commands to apply on the tick that was asked about, in the vocabulary of
`docs/COMMANDS.md` and stamped with the agent's own Faction.

<!-- reply:start -->
| Field      | What it carries                                        |
| ---------- | ------------------------------------------------------- |
| `type`     | `"commands"`                                            |
| `tick`     | The tick of the `observation` being answered, exactly.   |
| `commands` | A list of Commands, in the order they should be applied. |
<!-- reply:end -->

<!-- replies:start -->
```jsonl
{ "type": "commands", "tick": 0, "commands": [] }
{ "type": "commands", "tick": 10, "commands": [ { "kind": "recruit", "faction": "rome", "settlement": 0, "squadType": "hastati", "count": 2 } ] }
{ "type": "commands", "tick": 3400, "commands": [ { "kind": "assault", "faction": "rome", "squads": [1, 2], "settlement": 1 } ] }
```
<!-- replies:end -->

Three things are worth knowing about what an agent may say:

- **Only your own Faction.** A Command stamped with the other Faction is not a
  clever order, it is a message this protocol cannot read (see *Malformed*).
- **A Command the rules cannot honour is ignored**, exactly as it is for a human
  clicking: an order to a Squad that has broken, a tile in the river, a building
  nobody can pay for. The protocol answers nothing about legality — only the tick
  knows, and it does not say — so an agent watches the world for the effect
  instead. `refused` on one of your Squads names why the last march could not be
  walked.
- **Silence is legal, and so is an empty list.** Any number of Commands from zero
  upwards, on any decision.

### `end` — the Match is over

No more observations follow it, and the agent's input is closed; a process that
lingers is killed after a grace period.

<!-- end:start -->
| Field    | What it carries                                                                 |
| -------- | --------------------------------------------------------------------------------- |
| `type`   | `"end"`                                                                           |
| `result` | How it ended: `{ "kind": "victory", "winner": …, "reason": …, "tick": … }`, `{ "kind": "draw", … }` or `{ "kind": "clock", … }`. |
| `hash`   | The state hash the Match ended on: the fingerprint a replay is compared by.        |
<!-- end:end -->

`reason` is `{ "kind": "stronghold", "stronghold": <settlement id>, "path": "assault"|"blockade" }`
or `{ "kind": "annihilation" }`. `clock` means the Match reached its tick bound
undecided, and is not a victory for anyone.

### `stopped` — the harness has stopped asking

Sent when the harness stops listening to the agent, with the reason. The Match
carries on without that Player.

<!-- stopped:start -->
| Field    | What it carries                                                                  |
| -------- | --------------------------------------------------------------------------------- |
| `type`   | `"stopped"`                                                                       |
| `reason` | `"malformed"` (input that could not be read), `"timeout"` (no reply in time) or `"gone"` (the process ended). |
| `detail` | One sentence naming what happened, for a person reading a log.                     |
<!-- stopped:end -->

## Malformed input, timeouts, and a crashed agent

**A Player who stopped playing is not a crashed harness.** All three failures end
the agent's part in the Match and none of them fails the run:

| What happened                                        | What the harness does                                        |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| A line that is not a `commands` message, a Command the vocabulary refuses, a Command for the other Faction, a `tick` that was not the one asked about | sends `stopped` with `malformed`, and asks nothing more       |
| No reply within `deadlineMs`                          | sends `stopped` with `timeout`, and asks nothing more         |
| The process exits, or its output ends                 | records `gone`, writes nothing, and asks nothing more         |

In each case the Faction is left **idle** for the rest of the Match — the same
state a Match is in when a human gets up and leaves — and the Match runs to its
own end, whether that is a Stronghold, an annihilation or the tick bound. The
report says what happened, and the command still exits 0:

```json
"agent": {
  "faction": "rome",
  "opponent": "ai",
  "status": "stopped",
  "stoppedBy": "timeout",
  "detail": "no reply to the observation at tick 40 within 2000 ms",
  "decisions": 5,
  "commands": 3
}
```

A malformed reply names its field, in the same style as the Command vocabulary's
own refusals, so an agent author can fix the line from the message alone:

```
the protocol message at message.commands[1].kind is not a Command kind: expected one of move, …
```

<!-- malformed:start -->
```jsonl
{ "type": "commands", "tick": 40, "commands": [ { "kind": "teleport", "faction": "rome", "squads": [1] } ] }
{ "type": "commands", "tick": 40, "commands": [ { "kind": "move", "faction": "carthage", "squads": [1], "x": 4, "y": 4 } ] }
{ "type": "commands", "tick": 41, "commands": [] }
{ "type": "orders", "tick": 40, "commands": [] }
{ "type": "commands", "tick": 40, "commands": [], "note": "hello" }
```
<!-- malformed:end -->

## Determinism, and replaying a Match an agent played

A Match is a **seed plus the Command log** and nothing else (ADR-0006). The
harness writes every Command it applied, stamped with the tick it applied on, in
application order, with `--log`:

```
{"tick":0,"command":{"kind":"recruit","faction":"rome","settlement":0,"squadType":"hastati","count":2}}
{"tick":10,"command":{"kind":"move","faction":"rome","squads":[1,2],"x":4,"y":60}}
```

`replayCommands` (`src/sim/replay.ts`) reads exactly that file — one JSON object
per line, `tick` and `command` — through the Command vocabulary, re-runs the
Match from the seed and ends on the same state hash, which is the hash the report
prints. The log is the whole Match, both Factions' Commands included: the agent's
Player and the harness's own.

The deadline is the one wall clock in the picture, and it cannot make a Match
irreproducible: it decides whether the agent was still playing, never what the
rules do. A Match an agent timed out in replays as the Match its log describes,
which is the Match that was played.

## Writing an agent

Read `hello` for what you may say, read `observation` for where you are, write
`commands`, and answer every observation — even with nothing. This is a complete
agent: it writes to standard output only the protocol, and it says nothing at
all, which is a legal way to watch a Match play itself.

<!-- minimal-agent:start -->
```js
// agent.mjs — answers every observation with nothing, and watches.
import { createInterface } from 'node:readline';

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  const message = JSON.parse(line);
  if (message.type !== 'observation') continue;

  process.stdout.write(JSON.stringify({ type: 'commands', tick: message.tick, commands: [] }) + '\n');
}
```
<!-- minimal-agent:end -->

Save it as `agent.mjs`, run
`npm run agent -- --agent agent.mjs --ticks 600 --opponent idle`, and read the
report. To play rather than watch, replace the empty `commands` list with orders:
`observation.settlements` says which settlement is yours and `observation.squads`
which men are, so a first order is a `recruit` beside one and a `move` of the
other — and `docs/COMMANDS.md` is the twelve things you may say.

`examples/agent.ts` is the next step up: raise two Squads, sweep the theatre
until the enemy Stronghold is seen, then assault it. It writes its plan in about
two hundred lines and imports nothing from this repository, which is what an
"agent that is not this codebase" means.
