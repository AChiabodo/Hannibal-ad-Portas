/** Reproduce the #76 geography probe through ordinary Match Commands. */
import { appendFileSync, writeFileSync } from 'node:fs';
import { DIFFICULTY_NAMES } from '../src/ai/difficulty.ts';
import { buildingCode, WORK_MAX_HP } from '../src/content/buildings.ts';
import { explicitSeed } from '../src/input/match-setup.ts';
import { build, move, recruit } from '../src/sim/command.ts';
import { allocate, landCapacity, seasonYield } from '../src/sim/economy.ts';
import { MAP_WIDTH, terrainAt } from '../src/sim/map.ts';
import { createMatch } from '../src/sim/match.ts';
import { orderSquadTo, routeCacheFor } from '../src/sim/movement.ts';
import { paceCost } from '../src/sim/route.ts';
import { SEASON_TICKS } from '../src/sim/season.ts';
import { observeSiege, siegeMatchRulesForDifficulty } from '../src/sim/siege.ts';

const [output, difficulty = 'centurio', ...requestedSeeds] = process.argv.slice(2);
if (!output || difficulty !== 'all' && !DIFFICULTY_NAMES.includes(difficulty)) {
  throw new Error('Usage: node scripts/map-opportunities.mjs output.jsonl [centurio|tiro|imperator|all] [uint32 seeds...]');
}
const seeds = requestedSeeds.length === 0 ? Array.from({ length: 200 }, (_unused, index) => index)
  : requestedSeeds.map((seed) => {
    const value = explicitSeed(seed);
    if (value === null) throw new Error(`Invalid seed: ${seed}`);
    return value;
  });
const levels = difficulty === 'all' ? DIFFICULTY_NAMES : [difficulty];

/** Housing supports twenty citizens without adding labour or resource yields. */
function normalizedProduction(world, site) {
  const grown = { ...site, population: 20,
    works: [0, 1].map((ordinal) => ({ building: buildingCode('house'), remaining: 0, ordinal })) };
  return seasonYield(grown, allocate(grown, landCapacity(world.map, site)), 'spring');
}

/** Scenario knowledge chooses destinations; this is a calibration fixture, not an AI. */
function cheapestOpportunity(world, squad) {
  const routes = routeCacheFor(world.map);
  const candidates = world.economy.settlements.slice(2).filter((site) => site.owner === -1).flatMap((site) => {
    const probe = { ...structuredClone(squad), steps: [], wait: 0 };
    orderSquadTo(world.map, probe, site, routes);
    if (probe.refused !== -1) return [];
    const cost = probe.steps.reduce((total, index) => total + paceCost(terrainAt(world.map,
      index % MAP_WIDTH, Math.floor(index / MAP_WIDTH)), 1), 0);
    return [{ id: site.id, x: site.x, y: site.y, cost,
      normalized20WithHousing: normalizedProduction(world, site) }];
  });
  return candidates.sort((a, b) => a.cost - b.cost || a.id - b.id)[0];
}

function measure(seed, level, faction) {
  const match = createMatch({ seed, rules: siegeMatchRulesForDifficulty(level) });
  const world = match.state.world, owner = faction === 'rome' ? 0 : 1;
  const captures = [], chosen = [], damage = [], failures = [];
  let target = null, orderedAt = null, arrived = null, engaged = false, minimumMen = 24;
  // Both sides receive their normal opening stocks; the opposite player is idle.
  match.step([build(faction, owner, 'farm'), recruit(faction, owner, faction === 'rome' ? 'hastati' : 'gaul', 24, 1)]);
  for (let tick = 1; tick < 2 * SEASON_TICKS; tick += 1) {
    const commands = [];
    if (tick % 10 === 1) {
      const visible = observeSiege(world, faction), body = visible.squads[0];
      minimumMen = body === undefined ? 0 : Math.min(minimumMen, body.men);
      engaged ||= body?.engaged === true;
      if (target !== null) {
        if (arrived === null && body?.x === target.x && body?.y === target.y) arrived = tick;
        if (visible.settlements.some((site) => site.id === target.id)) {
          const site = world.economy.settlements[target.id], capacity = landCapacity(world.map, site);
          captures.push({ id: site.id, orderedAt, arrival: arrived, captured: tick, population: site.population,
            production: seasonYield(site, allocate(site, capacity), 'spring'),
            normalized20WithHousing: normalizedProduction(world, site) });
          commands.push(build(faction, site.id, 'farm'));
          target = null;
        }
      }
      for (const site of visible.settlements) for (const work of site.works) {
        if ((work.hp ?? WORK_MAX_HP) < (work.maxHp ?? WORK_MAX_HP) && !damage.some((entry) => entry.site === site.id && entry.building === work.building))
          damage.push({ tick, site: site.id, building: work.building, hp: work.hp });
      }
      // Let the queued Farm establish its footprint before pricing the next march.
      if (captures.length < 2 && target === null && body !== undefined && !body.routing && commands.length === 0) {
        const squad = world.economy.squads.find((squad) => squad.id === body.id);
        const candidate = cheapestOpportunity(world, squad);
        if (candidate === undefined) failures.push({ tick, reason: 'no reachable neutral' });
        else {
          target = candidate;
          chosen.push(candidate);
          orderedAt = tick;
          arrived = null;
          commands.push(move(faction, [body.id], target.x, target.y));
        }
      }
    }
    match.step(commands);
  }
  const visible = observeSiege(world, faction);
  minimumMen = visible.squads[0] === undefined ? 0 : Math.min(minimumMen, visible.squads[0].men);
  engaged ||= visible.squads[0]?.engaged === true;
  return { seed, level, faction, captures, chosen, minimumMen, engaged, failures, damage,
    sites: visible.settlements.map((site) => ({ id: site.id, population: site.population, stocks: site.stocks, works: site.works })) };
}

writeFileSync(output, '');
let count = 0;
for (const seed of seeds) for (const level of levels) for (const faction of ['rome', 'carthage']) {
  appendFileSync(output, `${JSON.stringify(measure(seed, level, faction))}\n`);
  count += 1;
}
console.log(`Recorded ${count} two-Season expansion scenarios in ${output}.`);
