/** Physical-ground contract checked from the generated map and the public plan. */
import { containsTile, intersects, settlementLayout, turnRect, type GroundRect } from '../../src/content/settlement-layout';
import { isWalkable, MAP_HEIGHT, MAP_WIDTH, MIN_FORDS_PER_RIVER, TERRAIN, TILE_COUNT,
  tileIndex, tileX, tileY, type MapGrid } from '../../src/sim/map';

export function plans(map: MapGrid) {
  return [...map.strongholds, ...map.settlements].map((site, id) => {
    const other = map.strongholds[id === 0 ? 1 : 0];
    const dx = other.x - site.x;
    const dy = other.y - site.y;
    const side = id >= 2 ? 2 : Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? 1 : 3 : dy >= 0 ? 2 : 0;
    const layout = settlementLayout(id < 2 ? 'stronghold' : 'settlement');
    const at = (rect: GroundRect) => {
      const turned = turnRect(rect, side);
      return { ...turned, x: site.x + turned.x, y: site.y + turned.y };
    };
    return { site, id, side, layout, at, grounds: at(layout.grounds), core: at(layout.core), gate: at(layout.gate) };
  });
}

export function tileInFutureStructure(plan: ReturnType<typeof plans>[number], x: number, y: number): boolean {
  if (plan.layout.lots.some((lot) => containsTile(plan.at(lot), x, y))) return true;
  if (plan.id >= 2 || !containsTile(plan.core, x, y)) return false;
  const border = x === plan.core.x || y === plan.core.y ||
    x === plan.core.x + plan.core.width - 1 || y === plan.core.y + plan.core.height - 1;
  return border && !containsTile(plan.gate, x, y);
}

export function broadCrossing(map: MapGrid, tile: number): boolean {
  const x = tileX(tile);
  const y = tileY(tile);
  if (x < 1 || y < 1 || x >= MAP_WIDTH - 1 || y >= MAP_HEIGHT - 1) return false;
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    const here = map.terrain[tileIndex(x + dx, y + dy)];
    if (here === undefined || !isWalkable(here)) return false;
  }
  return true;
}

/** Physical additions join the original thousand-seed fairness/connectivity gate. */
export function settlementGroundProblems(map: MapGrid): readonly string[] {
  const problems: string[] = [];
  const sites = plans(map);
  const structures = new Uint8Array(TILE_COUNT);
  const publicGround = new Uint8Array(TILE_COUNT);
  const mark = (mask: Uint8Array, rect: GroundRect): void => {
    for (let y = Math.max(0, rect.y); y < Math.min(MAP_HEIGHT, rect.y + rect.height); y += 1)
      for (let x = Math.max(0, rect.x); x < Math.min(MAP_WIDTH, rect.x + rect.width); x += 1) mask[tileIndex(x, y)] = 1;
  };
  for (const [index, plan] of sites.entries()) {
    for (const lot of plan.layout.lots) mark(structures, plan.at(lot));
    if (plan.id < 2) {
      for (let y = plan.core.y; y < plan.core.y + plan.core.height; y += 1) {
        for (let x = plan.core.x; x < plan.core.x + plan.core.width; x += 1) {
          const edge = x === plan.core.x || y === plan.core.y || x === plan.core.x + plan.core.width - 1 || y === plan.core.y + plan.core.height - 1;
          if (edge && !containsTile(plan.gate, x, y)) structures[tileIndex(x, y)] = 1;
        }
      }
    }
    if (plan.grounds.x < 3 || plan.grounds.y < 3 || plan.grounds.x + plan.grounds.width > MAP_WIDTH - 3 ||
      plan.grounds.y + plan.grounds.height > MAP_HEIGHT - 3) problems.push(`settlement ${index} has no ground margin`);
    for (const other of sites.slice(index + 1)) {
      if (intersects({ ...plan.grounds, x: plan.grounds.x - 3, y: plan.grounds.y - 3,
        width: plan.grounds.width + 6, height: plan.grounds.height + 6 }, other.grounds)) problems.push(`settlements ${index}/${other.id} overlap manoeuvring space`);
    }
    let wet = false;
    for (let y = plan.grounds.y; y < plan.grounds.y + plan.grounds.height; y += 1) {
      for (let x = plan.grounds.x; x < plan.grounds.x + plan.grounds.width; x += 1) {
        const terrain = map.terrain[tileIndex(x, y)];
        if (terrain === TERRAIN.river || terrain === TERRAIN.ford) wet = true;
      }
    }
    if (wet) problems.push(`settlement ${index} overlaps a river or ford`);
    mark(publicGround, plan.at(plan.layout.capture));
    mark(publicGround, plan.at(plan.layout.muster));
    mark(publicGround, plan.at({ ...plan.layout.assembly, width: 1, height: 1 }));
    mark(publicGround, plan.at({ x: -1, y: 4, width: 3, height: 11 }));
    if (index < 2) {
      mark(publicGround, plan.at({ x: -1, y: 8, width: 3, height: 10 }));
      const pad = plan.at({ x: -3, y: 8, width: 7, height: 10 });
      for (let y = pad.y; y < pad.y + pad.height; y += 1) for (let x = pad.x; x < pad.x + pad.width; x += 1) {
        const terrain = map.terrain[tileIndex(x, y)];
        if (terrain === TERRAIN.river || terrain === TERRAIN.ford) problems.push(`Stronghold ${index} has no dry column-tail pad`);
      }
    }
    if (index < 2 && !map.roads.some((road) => road.tiles.some((tile) => containsTile(plan.gate, tileX(tile), tileY(tile)))))
      problems.push(`Stronghold ${index} has no road through its Gate`);
  }
  for (const node of map.resources) {
    const tile = tileIndex(node.x, node.y);
    if (structures[tile] === 1 || publicGround[tile] === 1) problems.push(`resource at ${node.x},${node.y} occupies a reserved structure or public space`);
  }
  const riverTiles = new Set(map.rivers.flatMap((river) => river.tiles));
  for (const road of map.roads) {
    for (const tile of road.tiles) {
      if (structures[tile] === 1) { problems.push(`road ${road.from}->${road.to} crosses a future structure`); break; }
      const x = tileX(tile);
      const y = tileY(tile);
      if (riverTiles.has(tile) && x > 0 && y > 0 && x < MAP_WIDTH - 1 && y < MAP_HEIGHT - 1 && !broadCrossing(map, tile)) {
        problems.push(`road crossing at ${x},${y} has no column-width shoulders`);
        break;
      }
    }
  }
  for (const [index, river] of map.rivers.entries()) {
    if (river.tiles.length >= 100 && river.tiles.filter((tile) => map.terrain[tile] === TERRAIN.ford && broadCrossing(map, tile)).length < MIN_FORDS_PER_RIVER)
      problems.push(`river ${index} has insufficient broad crossings`);
  }
  return problems;
}
