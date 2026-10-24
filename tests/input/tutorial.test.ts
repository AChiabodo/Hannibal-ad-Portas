import { expect, it } from 'vitest';
import { createTutorial, type Tutorial } from '../../src/input/tutorial.ts';
import { build, recruit, move, attackMove, blockade } from '../../src/sim/command.ts';

function showCurrentControl(practice: Tutorial): void {
  const goal = practice.lesson.goal;
  practice.present({
    settlement: goal === 'enemySelected' ? 1 : goal === 'squadSelected' || goal === 'groupSelected' ? null : 0,
    squads: practice.host.observe().squads.map(({ id }) => id),
    tab: ['construction', 'production', 'farmOffer'].includes(goal) ? 'construction'
      : ['recruitment', 'hastatiOffer'].includes(goal) ? 'recruitment' : 'overview',
    category: 'production', page: goal === 'balance' ? 'balance' : 'summary',
    inspected: goal === 'farmOffer' ? 'build:farm' : goal === 'hastatiOffer' ? 'recruit:hastati:24' : null,
  });
}
/** A reader acknowledges explanations and operates public presentation controls, never fakes a rule outcome. */
function readAvailable(practice: Tutorial): void {
  for (let count = 0; count < practice.lessons.length && !practice.complete; count += 1) {
    showCurrentControl(practice);
    if (!practice.next()) return;
  }
}

it('keeps every explanation on screen and waits for the requested action before Next', () => {
  const practice = createTutorial('economy');
  expect(practice.lesson.id).toBe('welcome');
  expect(practice.ready).toBe(true);
  practice.host.advance(10);
  expect(practice.lesson.id).toBe('welcome');
  expect(practice.next()).toBe(true);
  expect(practice.lesson.id).toBe('home');
  expect(practice.next()).toBe(false);
  showCurrentControl(practice);
  expect(practice.ready).toBe(true);
  expect(practice.lesson.id).toBe('home');
  practice.next();
  expect(practice.lesson.id).toBe('stocks');
});

it('distinguishes opening a farm offer, starting its work, finishing it and receiving a Season', () => {
  const practice = createTutorial('economy');
  readAvailable(practice);
  expect(practice.lesson.id).toBe('farmBuild');
  practice.host.human.submit(build('rome', 0, 'unknown'));
  practice.host.advance(1);
  expect(practice.next()).toBe(false);
  practice.host.human.submit(build('rome', 0, 'farm'));
  practice.host.advance(1);
  expect(practice.ready).toBe(true);
  practice.next();
  expect(practice.lesson.id).toBe('farmWait');
  expect(practice.next()).toBe(false);
  practice.host.advance(500);
  expect(practice.lesson.id).toBe('farmWait');
  readAvailable(practice);
  expect(practice.lesson.id).toBe('season');
  expect(practice.next()).toBe(false);
  practice.host.advance(2100 - practice.host.match.state.tick);
  readAvailable(practice);
  expect(practice.complete).toBe(true);
});

it('teaches recruitment in individual purchases and a new attempt forgets its outcomes', () => {
  const practice = createTutorial('recruitment');
  practice.host.human.submit(build('rome', 0, 'farm'));
  practice.host.advance(500);
  readAvailable(practice);
  expect(practice.lesson.id).toBe('firstRecruit');
  practice.host.human.submit(recruit('rome', 0, 'hastati', 120, 1));
  practice.host.advance(1);
  expect(practice.next()).toBe(false);
  practice.host.human.submit(recruit('rome', 0, 'hastati', 24, 1));
  practice.host.advance(1);
  readAvailable(practice);
  expect(practice.lesson.id).toBe('secondRecruit');
  expect(practice.next()).toBe(false);
  practice.host.human.submit(recruit('rome', 0, 'hastati', 24, 1));
  practice.host.advance(1);
  readAvailable(practice);
  expect(practice.complete).toBe(true);
  const retry = createTutorial('recruitment');
  expect(retry.lesson.id).toBe('welcome');
  readAvailable(retry);
  expect(retry.lesson.id).toBe('farmBuild');
});

it('teaches selection, group movement, binding, discovery and real combat as separate steps', () => {
  const practice = createTutorial('combat');
  const host = practice.host;
  host.human.submit(recruit('rome', 0, 'hastati', 24, 2));
  host.advance(1);
  readAvailable(practice);
  expect(practice.lesson.id).toBe('move');
  host.human.submit(move('rome', [999, 1000], 0, 0));
  host.advance(5);
  expect(practice.next()).toBe(false);
  const squads = host.observe().squads;
  const home = host.observe().settlements[0]!;
  host.human.submit(move('rome', squads.map(({ id }) => id), home.x + 5, home.y));
  host.advance(100);
  readAvailable(practice);
  expect(practice.lesson.id).toBe('groupBind');
  host.human.select({ settlement: null, squads: squads.map(({ id }) => id) });
  host.human.bindGroup(1);
  host.advance(1);
  readAvailable(practice);
  expect(practice.lesson.id).toBe('explore');
  host.human.submit(attackMove('rome', squads.map(({ id }) => id), 88, 89));
  for (let count = 0; count < 2000 && !host.observe().squads.some((squad) => squad.engaged); count += 1) host.advance(1);
  expect(host.observe().squads.some((squad) => squad.engaged)).toBe(true);
  readAvailable(practice);
  expect(practice.complete).toBe(true);
});

it('does not credit a refused group order for earlier individual movement', () => {
  const practice = createTutorial('combat');
  const host = practice.host;
  host.human.submit(recruit('rome', 0, 'hastati', 24, 2));
  host.advance(1);
  readAvailable(practice);
  expect(practice.lesson.id).toBe('move');
  const squads = host.observe().squads;
  for (const squad of squads) host.human.submit(move('rome', [squad.id], squad.x + 10, squad.y));
  host.advance(1);
  host.human.submit(move('rome', squads.map(({ id }) => id), 1000, 1000));
  host.advance(1);
  expect(host.observe().squads.every(({ refused }) => refused === 'off-map')).toBe(true);
  host.advance(100);
  expect(practice.ready).toBe(false);
});

it('finishes the final lesson sequence only after a normal AI encounter, capture and Siege', () => {
  const practice = createTutorial('siege');
  const host = practice.host;
  host.human.submit(recruit('rome', 0, 'hastati', 24, 2));
  host.advance(1);
  readAvailable(practice);
  expect(practice.lesson.id).toBe('capture');
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
  readAvailable(practice);
  host.human.submit(attackMove('rome', host.observe().squads.map(({ id }) => id), 88, 89));
  let opened = false;
  for (let tick = 0; tick < 3000 && host.result === null && !opened; tick += 1) {
    const squads = host.observe().squads.filter(({ x, y }) => Math.abs(x - 88) <= 1 && Math.abs(y - 89) <= 1);
    if (squads.length) host.human.submit(blockade('rome', squads.map(({ id }) => id), 1));
    host.advance(1);
    opened = host.observe().fronts.some((front) => front.settlement === 1 && front.besieger === 'rome');
  }
  expect(opened).toBe(true);
  expect(practice.complete).toBe(false);
  readAvailable(practice);
  expect(practice.complete).toBe(true);
}, 30000);
