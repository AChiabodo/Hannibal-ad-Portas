import { expect, it } from 'vitest';
import { createTutorial } from '../../src/input/tutorial.ts';
import { build, recruit, move, attackMove, blockade } from '../../src/sim/command.ts';

it('cannot award an unfinished objective with Next; refused construction stays incomplete and a standing work advances', () => {
  const practice = createTutorial('economy');
  expect(practice.next()).toBe(false);
  practice.host.human.submit(build('rome', 0, 'unknown'));
  practice.host.advance(1);
  expect(practice.progress).toBe(0);
  practice.host.human.submit(build('rome', 0, 'farm'));
  practice.host.advance(500);
  expect(practice.progress).toBe(1);
  expect(practice.next()).toBe(false);
  practice.host.advance(2100 - practice.host.match.state.tick);
  expect(practice.complete).toBe(true);
  expect(practice.next()).toBe(true);
});

it('requires two real moving Squads before combat and does not complete from a refused move', () => {
  const practice = createTutorial('combat');
  const host = practice.host;
  host.human.submit(recruit('rome', 0, 'hastati', 24, 2));
  host.advance(1);
  host.human.submit(move('rome', [999, 1000], 0, 0));
  host.advance(5);
  expect(practice.progress).toBe(0);
  const squads = host.observe().squads;
  const home = host.observe().settlements[0]!;
  host.human.submit(move('rome', squads.map(({ id }) => id), home.x + 5, home.y));
  host.advance(100);
  expect(practice.progress).toBe(1);
  expect(practice.complete).toBe(false);
});

it('does not credit a refused group order for earlier individual movement', () => {
  const practice = createTutorial('combat');
  const host = practice.host;
  host.human.submit(recruit('rome', 0, 'hastati', 24, 2));
  host.advance(1);
  const squads = host.observe().squads;
  for (const squad of squads) host.human.submit(move('rome', [squad.id], squad.x + 10, squad.y));
  host.advance(1);
  host.human.submit(move('rome', squads.map(({ id }) => id), 1000, 1000));
  host.advance(1);
  expect(host.observe().squads.every(({ refused }) => refused === 'off-map')).toBe(true);
  host.advance(100);
  expect(practice.progress).toBe(0);
});

it('reaches a real encounter with the shipped normal AI in the final exercise', () => {
  const practice = createTutorial('siege');
  const host = practice.host;
  host.human.submit(recruit('rome', 0, 'hastati', 24, 2));
  host.advance(1);
  // A human can order any map tile; the fixed exercise seed puts the opposing end here.
  host.human.submit(attackMove('rome', host.observe().squads.map(({ id }) => id), 88, 89));
  let encounter = false;
  for (let tick = 0; tick < 10000 && host.result === null && !encounter; tick += 1) {
    host.advance(1);
    encounter = host.observe().squads.some(({ engaged }) => engaged);
  }
  expect(host.applied().some(({ command }) => command.faction === 'carthage')).toBe(true);
  expect(encounter).toBe(true);
  host.human.submit(move('rome', host.observe().squads.map(({ id }) => id), 4, 73));
  host.advance(800);
  expect(host.observe().settlements.some(({ id }) => id === 2)).toBe(true);
  expect(practice.progress).toBe(2);
  host.human.submit(attackMove('rome', host.observe().squads.map(({ id }) => id), 88, 89));
  for (let tick = 0; tick < 3000 && host.result === null && !practice.complete; tick += 1) {
    const squads = host.observe().squads.filter(({ x, y }) => Math.abs(x - 88) <= 1 && Math.abs(y - 89) <= 1);
    if (squads.length) host.human.submit(blockade('rome', squads.map(({ id }) => id), 1));
    host.advance(1);
  }
  expect(practice.complete).toBe(true);
  expect(host.observe().fronts.find(({ settlement }) => settlement === 1)).toMatchObject({ siege: 'blockade', besieger: 'rome' });
}, 30000);

it('requires real small Squads and a completed work; a new chapter attempt starts clean', () => {
  const practice = createTutorial('recruitment');
  practice.host.human.submit(recruit('rome', 0, 'hastati', 120, 1));
  practice.host.advance(1);
  expect(practice.progress).toBe(0);
  const retry = createTutorial('recruitment');
  retry.host.human.submit(recruit('rome', 0, 'hastati', 24, 2));
  retry.host.advance(1);
  expect(retry.progress).toBe(1);
  expect(practice.progress).toBe(0);
  retry.host.human.submit(build('rome', 0, 'farm'));
  retry.host.advance(500);
  expect(retry.complete).toBe(true);
});

