# AI Controllers

D1 supplies the clocks, utility selection and registration seam. D2 supplies
the economy policy; D3 composes it with military decisions in the headless AI
harness. Scouting belongs to D4.

`createAi` (`src/ai/controller.ts`) is structurally a Controller: `decide` reads
an `Observation<Visible>` and returns Commands. Create a fresh instance for each
Faction and each Match. Reusing one across Factions, repeating a tick or moving
backwards fails explicitly. The composition root supplies `ticksPerSecond`
from `TICK_HZ`, and supplies the concrete `Visible` and Command type parameters;
the AI imports neither simulation values nor world types.

The three clocks execute in this order:

| Layer | When it decides | What carries forward |
| --- | --- | --- |
| Strategic | First Observation, then each observed change of `year` or `season` | The selected candidate's optional `plan`: posture, budget and objective |
| Operational | First Observation, then each 30-second tick window | Commands from the selected candidate |
| Tactical | Every Observation | Commands from the selected candidate |

The calendar always comes from the Observation, never from a second derivation
of Season lengths. Operational windows are anchored at tick zero. If a caller
skips ticks, each due layer runs once with the current Observation; it does not
invent Observations of missed ticks. The driver normally asks on every tick.

## Registering behaviours

Each independent module exports a `Behaviour<Visible, Command>` with a stable
`id` and any of `strategic`, `operational`, `tactical`. Each hook receives
`{ observation, plan }` and returns candidate records:

```ts
{
  id: 'defend-home',
  utility: 8,
  reason: 'Winter quarters take priority.',
  commands: [],
  // Strategic candidates alone may replace the plan:
  plan: { posture: 'defensive', budget: { reserve: 100 }, objective: 'home' },
}
```

`createBehaviourRegistry([economy, military, scouting])` composes the modules;
adding one needs no edit to the registry or Controller. The registry snapshots
the registrations and rejects duplicate or blank behaviour ids. Hooks are pure
functions of their context; retained strategic memory belongs in the plan,
which is copied for each hook. A module may describe the narrow visible fields
it needs and return inferred Command records (`kind: 'build' as const`, for
example); concrete simulation types are checked at the composition root outside
`ai/`. The three modules under `tests/ai/behaviours/` are test adapters showing
independent registration, not shipped policies.

On each due layer, all registered hooks propose alternatives against the same
plan. One candidate wins across all behaviours on that layer. It may emit a
batch of Commands, applied in strategic, operational, tactical order. Only a
selected strategic candidate can replace the plan; later layers on that tick
already read its replacement. A candidate without a plan retains the old one.

Utilities must be signed safe integers; larger is better. Candidates need a
nonempty id unique within their behaviour and layer, and a nonempty reason.
Malformed scores and ambiguous ids fail rather than silently disappearing from
JSON. Every decision includes a built-in `idle` candidate at utility zero that
keeps the current plan and emits nothing. Idle wins a zero tie; other ties use
behaviour id then candidate id in code-point order, independent of registration
order. Negative candidates therefore cannot force an unwanted Command.

## Reading a Match

```sh
npm run match -- --rules ai --seed 1 --ticks 2101
```

The default bound remains three game years. This harness runs two fresh AIs
against the complete Siege Match rules and their existing filtered projections.
The default registry installs economy and military policies. `economyRegistry`
remains available for isolated economic scenarios. An explicitly empty registry
still runs the foundation alone, ending at the bound without Commands.

## Economy policy (D2)

`createEconomyBehaviour` receives the building and Squad catalogues and economic
constants from the composition root, outside `ai/`. It reads only owned economic
facts and observed fronts; it never imports the rules, world or hidden map.

Rome's growth posture puts its Villa first. Carthage's commerce posture puts a
Market first, then grows the labour pool and production needed for a Villa.
Both pursue Tier 2 deliberately. A second Market waits until that Tier exists
so it cannot consume the labour needed to reach it. Housing follows population
pressure; resource producers follow measured stock shortages and winter food
needs, with utilities and reasons in the decision log.

Labour allocation remains automatic: there is no assignment Command (ADR-0005).
The policy changes the demand by choosing which work to raise, waits for current
construction, and rejects works it cannot staff. It keeps hands on land unless
grain works can feed the population. This is the same allocation every Controller
uses, with no AI-only production rule.

Every operational decision recomputes recurring tax and staffed, standing Market
income. Unfinished or unstaffed works and blockaded settlements contribute no
Market income; blockaded settlements contribute no tax either. Recruitment emits
one Squad at a time, requires total Payroll no greater than recurring income,
retains two Seasons of the proposed Payroll plus six denarii, and leaves three
Seasons of population food in stock. Unpaid Squads suspend recruitment and put
the next strategic plan into recovery posture. Externally imposed bankruptcy
still follows the ordinary morale and desertion rules; there is no rescue grant.

`tests/ai/economy.test.ts` checks priorities and budgets through the Controller.
`tests/ai/economy-match.test.ts` plays three Years on seeds 1, 7 and 42, observes
Tier 2, at least two paid Squads per Faction and a final Treasury in [6, 100),
and replays seed 7 to the same hash. A separate bankrupt fixture observes unpaid
elephants disappearing by id. These are headless economic checks, not military
balance or browser rendering evidence.

## Military policy (D3)

`createMilitaryBehaviour` receives the public Squad catalogue, matchup matrix
and fatigue scale at composition. The complete Siege Observation now includes
`enemies`: only enemy field Squads within the ordinary circular vision of owned
settlements or Squads. Each record contains id, type and current tile; it carries
no enemy treasury, stock, strength, morale or goal. Vision uses the same disc as
terrain fog. Garrisons and enemies outside that disc are absent. There is no
remembered contact in this policy, so losing sight stops pursuit; contact memory
and scouting remain D4. This current-sight projection derives no fog memory.

Every tactical decision rebuilds a sparse threat map of 16×16-tile regions from
that Observation. Unoccupied regions have zero threat. Friendly power scales
the Squad's remaining strength and morale, discounted up to half by fatigue.
Enemy power uses the observed type's full nominal morale, since its actual
condition is private; an unknown type gets a conservative default estimate.
An owned settlement's region also includes enemies within twelve tiles of the
settlement, including across region edges. Regions with the largest deficit
between threat and friendly power receive defensive allocation first. The
`threat-map` candidate logs the region totals and deficits on every tick.

The highest-id ready, unengaged Squad is the reserve when at least two ready
Squads are available.
The line answers settlement threats first. It commits that reserve only when
the remaining line cannot cover a defensible threat. It declines a defence
whose observed enemy power exceeds all available ready power, rather than
feeding in reinforcements. In the field, attacks require a quarter more ready
power than the observed local enemy; a nearby reserve may provide that margin.
Each Squad receives at most one military Command per tick. Commands and reasons
are batched under `defend`, `commit-reserve` or `withdraw`; commitment reasons
name the reserve and the enemy or settlement that needs it. Unassigned Squads
hold the line instead of pursuing an unobserved target.

A Squad at half nominal morale or strength, or facing greater local enemy power
than its nearby support, leaves the ready pool. It withdraws from contact or a
nearby threat, replacing an existing attack march when necessary. A march back
to an owned settlement continues until arrival; it is not overwritten by the
next allocation. Routed Squads and garrisons receive no field Commands.

`createMilitaryRecruitment` supplies the economy's optional recruitment
preference. Against the currently observed composition, the injected matchup
matrix adds or subtracts up to thirty utility points; the economic tier and
owned-type diversity preferences remain. No observation means no counter bonus.
All Payroll, treasury, food, tier and resource gates still belong to D2. Rome
cannot invent an arm outside its roster: at Tier 3 it prefers triarii against
observed cavalry and avoids them against archers. Carthage can prefer its
Balearic slingers against observed spears.

`tests/ai/military.test.ts` checks defensive priorities, cross-region threats,
counter recruitment, deliberate reserves, favourable field attacks, withdrawal
and stopping pursuit through the Controller's Commands and decision log.
`tests/ai/military-match.test.ts` checks the shipped registry, circular sight,
hidden-world independence, actual withdrawal to quarters and Command replay to
the same hash. These are deterministic policy checks, not tournament balance
or siege-prosecution evidence. Neither scouting nor siege Commands are added.

The JSON report adds `decisions`, sorted by tick, Rome before Carthage, and then
strategic, operational, tactical. Each record names the Faction, tick, observed
year and Season, layer, every candidate's behaviour/id/utility/reason/Commands
(and proposed plan), and the selected behaviour/id. An absent hook contributes
no candidate; idle still explains the decision. `readLog()` returns the same
history on an individual AI as a detached snapshot. Mutating a proposed
candidate, a returned Command or a log snapshot cannot rewrite past decisions.

Decision explanations are diagnostic output, separate from the simulation's
Command log and state hash. A selected plan is AI memory, not authoritative
Match state. Replaying the emitted Command log through scripted Controllers
reproduces the same final hash without running the AI. Other harness reports
keep their previous shape.

## The import fence

`npm run guard`, CI and `npm run build` enforce the AI fence. The only permitted
edge from the AI into `sim/` is a type-only named `Observation` import from
`sim/observation.ts`. Renaming that type and inline `import(...).Observation`
type expressions are allowed. Runtime imports, world types, dynamic imports,
`require`, type queries and re-export barrels cannot bypass the fence: it walks
every local helper reachable from every source under `ai/`. The permitted
Observation edge is terminal, so its declaration's own dependencies stay owned
by the simulation. Bare package imports and unresolved or computed module
specifiers fail closed. Actual file paths are checked, including Windows case
and local symlink aliases.

This is a source import fence: like the existing guards it does not interpret
`eval`, generated code or aliases of the module loader. The driver still owns
projection copying and Command validation (#35, ADR-0003, ADR-0013); an import
fence does not replace fog filtering by the rules.
