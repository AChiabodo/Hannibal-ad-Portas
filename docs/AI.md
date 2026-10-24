# AI Controllers

D1 supplies the clocks, utility selection and registration seam. D2 supplies
the economy policy; D3 supplies military decisions and D4 adds scouting and
last-known contact planning in the headless AI harness.

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
  plan: { posture: 'growth', budget: { reserve: 100 }, objective: '0' },
}
```

`createBehaviourRegistry([economy, military, scouting])` composes the modules;
adding one needs no edit to the registry or Controller. The registry snapshots
the registrations and rejects duplicate or blank behaviour ids. No behaviour
module imports another: the contact memory and its age limit live in
`ai/contacts.ts`, the tile and its Chebyshev distance in `ai/site.ts`, and each
module reaches only for shared leaves. Hooks are pure
functions of their context; retained strategic memory belongs in the plan,
which is copied for each hook. A module may describe the narrow visible fields
it needs and return inferred Command records (`kind: 'build' as const`, for
example); concrete simulation types are checked at the composition root outside
`ai/`. The three modules under `tests/ai/behaviours/` are test adapters showing
independent registration, not shipped policies.

The closed vocabularies are types: `posture` is a `Posture` (growth, commerce or
recovery), `objective` is the decimal word naming the settlement a plan works
toward, and every Observation's `season` is a `Season`, so a misspelt word is a
type error rather than a comparison that silently never matches. `objective`
stays the word the decision log already carried, so typed it changes nothing a
Match logs.

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
behaviour id then candidate id in UTF-16 code-unit order, independent of
registration order. Negative candidates therefore cannot force an unwanted Command.

A candidate may also carry `contributions`: the behaviours that took part in it,
each with the Commands of its own that survived into the batch — possibly none,
when another behaviour's orders superseded them. A module that stands alone
leaves it unset and the Controller names the single author; the composition root
sets it when it folds one behaviour's orders into another's candidate. Every
logged candidate and the selected summary carry the attribution either way.

## Reading a Match

```sh
npm run match -- --rules ai --seed 1 --ticks 2101
```

The default bound remains three game years. This harness runs two fresh AIs
against the complete Siege Match rules and their existing filtered projections.
The default `armyRegistry` installs economy, field, scouting and siege policies
at Centurio. `economyRegistry`, `militaryRegistry` and `scoutingRegistry` (D4's
field and patrols, without a siege) remain available for isolated scenarios.
An explicitly empty registry
still runs the foundation alone, ending at the bound without Commands.

## Economy policy (D2)

`createEconomyBehaviour` receives the building and Squad catalogues and economic
constants from the composition root, outside `ai/`. It reads only owned economic
facts and observed fronts; it never imports the rules, world or hidden map.

Both postures prioritize the first affordable detachment. Rome starts a Market
to fund its first Payroll before spending the opening timber on a Villa;
Carthage can initially afford a small Gaul detachment from ordinary taxes.
Both pursue Tier 2 and then Tier 3 when resources and staffed food production
can support the Villa and Forum. A second Market waits until Tier 2 exists
so it cannot consume the labour needed to reach it. Housing follows population
pressure; resource producers follow measured stock shortages and winter food
needs, with utilities and reasons in the decision log.

The first Roman Market and payable detachment can be planned together when
construction finishes before Payroll. The combined purchase pays both costs,
retains food and treasury reserves, and requires enough existing labour.
Granaries receive priority when storage cannot hold the food floor plus an
otherwise sustainable recruit. Difficulty never reduces that food floor.

Labour allocation remains automatic: there is no assignment Command (ADR-0005).
The policy changes the demand by choosing which work to raise, waits for current
construction, and rejects works it cannot staff. It keeps hands on land unless
grain works can feed the population. This is the same allocation every Controller
uses, with no AI-only production rule.

Every operational decision recomputes recurring tax and staffed Market income
available by the next Payroll. A staffed Market still under construction counts
only if its remaining work finishes before that boundary; the calendar owner
supplies `ticksUntilSeason` through the composition root rather than the policy
deriving Season boundaries. Unstaffed works and blockaded settlements contribute
no Market income; blockaded settlements contribute no tax either. Recruitment prices
every real size a type offers with the content table's own `recruitCost` and
`payrollBill`, emits one Squad at a time, requires total Payroll no greater than
recurring income, retains two Seasons of the proposed Payroll plus
`WORKING_TREASURY` (six) denarii, and leaves three Seasons of population food in
stock. It prefers the larger real size when the treasury and income can carry it. Unpaid Squads
suspend recruitment and put
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
terrain fog. Garrisons and enemies outside that disc are absent. D4 adds the
Faction's authoritative `fog` and its decoded `contacts` beside current sight;
reading the projection never refreshes memory. Since D4, a settlement's front is
shown on the same predicate as every other sighting — owned, besieged by the
Faction, or covered by one of its eyes (`observeSiege`, ADR-0020) — so unobserved
minor settlement fronts, as well as Strongholds, stay outside the projection. An
open settlement has no wall to keep a secret, and that is what a hold takes and
an assault refuses (ADR-0008); it is not a licence to skip the fog, because a
front read for free would be knowledge the fog beside it never recorded.

Every tactical decision rebuilds a sparse threat map of `REGION_SIZE`×`REGION_SIZE`-tile regions from
that Observation. Unoccupied regions have zero threat. Friendly power scales
the Squad's remaining strength and morale, discounted up to half by fatigue.
Enemy power uses the observed type's full nominal morale, since its actual
condition is private; an unknown type gets a conservative default estimate.
An owned settlement's region also includes enemies within `DEFENCE_RADIUS` tiles of the
settlement, including across region edges. Regions with the largest deficit
between threat and friendly power receive defensive allocation first. The
`threat-map` candidate logs the region totals and deficits on every tick.

The highest-id ready, unengaged Squad is the reserve when at least two ready
Squads are available.
The line answers settlement threats first. It commits that reserve only when
the remaining line cannot cover a defensible threat. It declines a defence
whose observed enemy power exceeds all available ready power, rather than
feeding in reinforcements. In the field, attacks require `attackPercent` of the observed local enemy power; a nearby reserve may provide that margin.
Each Squad receives at most one military Command per tick. Commands and reasons
are batched under `defend`, `commit-reserve` or `withdraw`; commitment reasons
name the reserve and the enemy or settlement that needs it. Unassigned Squads
hold the line instead of pursuing an unobserved target.

A Squad at half nominal morale or strength, or facing greater enemy power
within `CONTACT_RADIUS` tiles than its nearby support, leaves the ready pool. It withdraws from contact or a
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
or siege-prosecution evidence. Siege Commands belong to D5.

## Scouting and last-known contacts (D4)

The complete Siege Match owns two independent fog memories. It refreshes them
at creation and after every tick, using the same circular settlement and Squad
vision as current sight. Enemy field Squads and enemy-owned settlements enter
memory only in vision. A contact keeps its observed type, tile and tick after
losing sight. Looking at its empty tile disproves it; hidden movement, death or
capture cannot erase it. Settlement ids are negative within the fog's contact
namespace and Squad ids positive, so the two cannot overwrite each other. A
contact's kind is a typed value (`ContactKind`) over the one integer the fog
holds, so a reader never unpacks a category and a Squad type index by hand. The
Observation decodes these records into `squad`, `settlement` or `stronghold`,
without consulting the live enemy. Memory is state, hashed and replayed.

`createScoutingBehaviour` receives only public map dimensions, terrain codes,
vision radius, tick rate, Squad catalogue and explicit eligible scout types.
It sends up to one third of
the army to explore, rounded up; after observing the enemy Stronghold the quota
falls to one eighth, with at least one patrol. It prefers Numidian horse and
otherwise uses the Tier-1 sword line: hastati or Gauls, since neither roster
has a separate light arm in v1. Elephants are excluded. Routing, garrisoned, engaged, beaten or locally
threatened Squads and marches home are ineligible.

Scouts search connected, observed walkable ground for tiles whose vision would
reveal unexplored terrain. They score information gain against travel distance,
prefer progress away from home and toward the interior, and spread detachments
across different targets. A march continues while its destination can still
reveal ground or refresh a contact. There is no random choice, hidden terrain
lookup or enemy-position hint. Before finding the enemy, the first crossing is
biased toward the region opposite its own home; once that region is observed,
ordinary information-gain scoring resumes. This geographical heuristic can
search the wrong latitude and does not guarantee a contact deadline.
After thirty seconds a remembered contact can
draw a patrol back within circular vision, refreshing it through the ordinary
Match rules. Exploration continues after discovery.

The fixed passive-human pressure matrix, retained failures and changed
AI-vs-AI outcome baseline are in
[the #71 diagnostic report](reviews/issue-71-visible-pressure.md).
Neither discovery tests nor headless pacing prove normal-browser visual pressure.

The search is the most expensive thing the AI does, and it is done on every tick:
a whole-theatre walk per light Squad, asking of every tile how much unknown ground
stands within vision of it. Both halves are paid once rather than repeatedly, and
neither answer changes — the unknown count around every tile is summed for the
whole theatre in one pass (a row of it summed once, a disc then being a handful of
those sums subtracted from each other), and the composition root plans a patrol
once per Observation and hands the same plan to the two callers that want it in a
tick. E3 found this: a Match spent about five sixths of its time in that search, and a
two-hundred-Match tournament took eleven minutes rather than four. The decisions, the Commands and
the state hashes are identical either way, which is how the change was checked.

Military planning includes recent remembered enemy Squads in its regional
threat map. A favourable line may investigate their last-known tile with a
`move`; an `attack` always requires current sight. Squad sightings expire as
planning evidence after `SQUAD_CONTACT_SECONDS` (120) seconds, settlement
sightings after `SETTLEMENT_CONTACT_SECONDS` (600). This
forgets their tactical relevance, leaving the historical fog record intact;
there is no second espionage memory. Visible contacts refresh their timestamps
and never expire while in sight.

The composition root merges patrols with the selected military field decision.
Attacks, investigations and withdrawals take precedence; idle holds release
the patrols. A higher-utility scouting candidate carries the combined Commands,
both explanations, and a `contributions` list naming scouting and the field with
the Commands each authored. The general utility registry and its one-winner rule
remain unchanged; the highest utility wins and a tie keeps the first candidate,
the rule `bestCandidate` states once and the composition harness reads.
Independent military and economy registries still work.

`tests/ai/scouting.test.ts` checks frontier orders, eligibility, quota reduction,
continued patrols, contact refresh and age limits through the Controller.
`tests/ai/scouting-match.test.ts` checks actual contact refresh and disproval,
hidden-world independence, early shipped scouting and replay to the same hash.
The discovery comparison uses seeds 1, 7 and 42, identical three-Squad Roman
openings and a stationary opponent: the scouting AI must discover the enemy
Stronghold in less than half the 12,000-tick observation window. The military
baseline remains undiscovered at that bound; its discovery time is censored,
not measured as exactly 12,000 ticks. This is a headless scouting comparison,
not a tournament or browser rendering check.

The JSON report adds `decisions`, sorted by tick, Rome before Carthage, and then
strategic, operational, tactical. Each record names the Faction, tick, observed
year and Season, layer, every candidate's behaviour/id/utility/reason/Commands
(and proposed plan), and the selected behaviour/id. `behaviour` names the
proposer whose candidate won — for a merged candidate, the proposer alone, not
the only author. Every candidate and the selected summary also carry
`contributions`, so a merged candidate names each behaving module and the
Commands it authored rather than attributing the whole batch to the proposer. An
absent hook contributes
no candidate; idle still explains the decision. `readLog()` returns the same
history on an individual AI as a detached snapshot. Mutating a proposed
candidate, a returned Command or a log snapshot cannot rewrite past decisions.

Decision explanations are diagnostic output, separate from the simulation's
Command log and state hash. A selected plan is AI memory, not authoritative
Match state. Replaying the emitted Command log through scripted Controllers
reproduces the same final hash without running the AI. Other harness reports
keep their previous shape.

## Siege policy (D5)

`createSiegeBehaviour` (`src/ai/siege.ts`) chooses a path to a settlement and
commits an army to it. Its target is a Stronghold the Faction has actually seen,
still inside the age limit: the siege draws on the same `planningContacts`
memory the field and its patrols plan against, so a sighting that has aged out
is history and not grounds for a march. With no fresh contact there is no siege
candidate at all, and the field and its patrols decide as before. Every siege
decision states how old the sighting it acted on is, so a reader can see the
grounds rather than infer them.

The choice between Assault and Blockade is stated in the decision log with the
numbers it read:

- Rome assaults when its ram is already at the walls, when it has already paid
  for one, or when the treasury can pay `RAM_COST` and the level is willing. A
  breach is always assaulted, because a storm is the only way through it.
- Carthage never assaults: `canAssault` is false, so it always blockades, and
  says so rather than waiting for a ram that will never be built (ADR-0008).
- A Rome that cannot pay for a ram blockades instead, and says which of the two
  grounds sent it there.

Committed Squads are the Faction's field Squads at the walls or already marching
to them. The policy re-issues the same order each tick, which costs the marchers
nothing (`movement.ts`). Every decision prices the observed garrison — the front
reports a count, not a composition, so one unseen garrison is worth
`garrisonEstimate` — plus any enemy field Squads inside `RELIEF_RADIUS` of the
place, priced from the public roster. When a relieving army approaches, the
policy either brings the reserve in to match it (`reinforce`) or withdraws what
is already at the walls (`abandon`): it never feeds a losing ring. A siege too
weak to start is not laid at all.

A siege owns the Squads it commits. `scoutingRegistry` remains the D4 field and
its patrols; `difficultyRegistry` adds the siege, and its candidate outranks the
field's so a `hold` cannot stand down a Squad already at the walls. A field
`withdraw` is the one exception, and the siege releases the men it names.
Recovery also owns an existing march to friendly quarters on subsequent ticks.
Spent scouts receive that march even outside combat; at home they remain out of
scouting and siege until eligible again. Siege force excludes spent and returning
Squads before choosing its path, and an empty ring never emits an empty withdrawal.

## The three difficulty levels (D5)

`DIFFICULTY` (`src/ai/difficulty.ts`) names Tiro, Centurio and Imperator.
Each has four axes and nothing else:

| Axis | Tiro | Centurio | Imperator |
| --- | --- | --- | --- |
| Reaction time (operational window) | 60 s | 30 s | 15 s |
| Aggression (`attackPercent`) | 130% | 125% | 115% |
| Planning horizon (Seasons of reserve) | 1 | 2 | 3 |
| Scouting quota (`scoutsPer`/`scoutsPerFound`) | 5/12 | 3/8 | 2/5 |
| Minimum opening patrols, when available | 1 | 1 | 2 |
| Contact refresh | 60 s | 30 s | 15 s |

Reaction time is `createAi`'s `operationalSeconds`; the default 30 is Centurio,
and D2–D4's shipped numbers are Centurio's — 125%, a two-Season payroll reserve
and a three-Season grain floor — so the engine's baseline is the middle level.
Aggression sets the margin the field needs before attacking and biases the siege
toward the fast path. Horizon is the Seasons of Payroll the economy holds back
and one less than its grain floor. Scouting quality is how large a share of the
army explores and how soon a contact is worth refreshing.

Before finding the enemy, patrols favor the opposite end of the theatre in
longitude, exploring unknown ground across latitudes. They do not assume that
the enemy's latitude mirrors their home. Multiple patrols choose distinct goals;
neither hidden coordinates nor a seed-specific route enters the policy.

Difficulty changes the opponent's thinking and nothing else. It never grants
resources, production or vision: every value is a threshold or a clock the
behaviours read, the AI still sees only its Observation, and the rules are the
same Match at every level. `playAiMatchAt(seed, ticks, name)` builds the
level's registry and supplies the matching Controller clock; `playAiMatch`
remains available for an independent registry.

`tests/ai/siege.test.ts` checks the assault-versus-blockade grounds, the
Carthaginian blockade, reinforcement, abandonment and the age limit through the
Controller.
`tests/ai/difficulty.test.ts` checks the four axes, the operational clock, and
that every level sees the same rule-filtered Observation. `tests/ai/siege-match.test.ts`
plays whole Matches with no human. Its historical victory assertions currently
expose unresolved stalls; see [the recovery report](reviews/issue-21-24-ai-recovery.md).
The Command log replays to the same hash, the
decisions do not move when a hidden army moves, and the three levels' decision
logs are distinguishable on one seed. These are deterministic policy checks, not
tournament balance: the balance numbers are E3's and F1's.

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
