import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEADLINE_MS,
  DEFAULT_DECISION_TICKS,
  PROTOCOL_VERSION,
  ProtocolError,
  endMessage,
  formatMessage,
  gridOf,
  helloMessage,
  observationMessage,
  readReply,
  rowsOf,
  stoppedMessage,
  wireObservation,
  type HelloOptions,
} from '../../src/cli/protocol';
import { MAP_HEIGHT, MAP_WIDTH } from '../../src/sim/map';
import { observeSiege, createSiegeWorld } from '../../src/sim/siege';
import { UNSEEN } from '../../src/sim/fog';

/**
 * The protocol is the seam with a process boundary drawn through it, so what is
 * tested here is that boundary and nothing about the Match: what a message says,
 * what a reply may be, and what refusing one looks like. A Match played over the
 * wire is `agent.test.ts`.
 */
const HELLO: HelloOptions = {
  faction: 'rome',
  seed: 7,
  ticks: 1000,
  ticksPerSecond: 10,
  decisionTicks: DEFAULT_DECISION_TICKS,
  deadlineMs: DEFAULT_DEADLINE_MS,
};

/** One Faction's Observation, as the rules project it, in the wire's shape. */
function wireOf(faction: 'rome' | 'carthage' = 'rome') {
  const world = createSiegeWorld(1);

  return wireObservation(observeSiege(world, faction));
}

describe('the greeting: what an agent is, and what it may say', () => {
  it('names the Faction, the seed, the bound and the theatre', () => {
    const hello = helloMessage(HELLO);

    expect(hello).toMatchObject({
      type: 'hello',
      protocol: PROTOCOL_VERSION,
      faction: 'rome',
      seed: 7,
      ticks: 1000,
      map: { width: MAP_WIDTH, height: MAP_HEIGHT },
      ticksPerSecond: 10,
      decisionTicks: DEFAULT_DECISION_TICKS,
      deadlineMs: DEFAULT_DEADLINE_MS,
    });
  });

  it('offers only the agent’s own roster: Rome does not raise Libyan spearmen', () => {
    const rome = helloMessage(HELLO);
    const carthage = helloMessage({ ...HELLO, faction: 'carthage' });

    expect(rome.squadTypes.map((type) => type.id)).toContain('hastati');
    expect(rome.squadTypes.map((type) => type.id)).not.toContain('libyan-spear');
    expect(carthage.squadTypes.map((type) => type.id)).toContain('libyan-spear');
    expect(carthage.squadTypes.every((type) => type.faction === 'carthage')).toBe(true);
  });

  it('states the Command vocabulary and the formations as data, and the terrain legend', () => {
    const hello = helloMessage(HELLO);

    expect(hello.commands).toContain('assault');
    expect(hello.commands).toHaveLength(16);
    expect(hello.commands).toContain('cancelPending');
    expect(hello.formations).toEqual(['line', 'column']);
    expect(hello.terrain).toContainEqual({ id: 'plain', code: 0 });
    expect(hello.terrain).toContainEqual({ id: 'unseen', code: UNSEEN });
  });
});

describe('the Observation on the wire: the projection, and nothing else', () => {
  it('carries the fields the rules project for one Faction, and no other', () => {
    const world = createSiegeWorld(1);
    const visible = observeSiege(world, 'rome');

    expect(Object.keys(wireObservation(visible)).sort()).toEqual(
      [
        'season',
        'year',
        'treasury',
        'territory',
        'settlements',
        'squads',
        'fog',
        'contacts',
        'enemies',
        'fronts',
        'appearances',
        'barbarianCamps',
      ].sort(),
    );
  });

  it('encodes and decodes every grid back to the array the rules hold', () => {
    const world = createSiegeWorld(1);
    const visible = observeSiege(world, 'rome');
    const wire = wireObservation(visible);

    expect(gridOf(wire.territory)).toEqual(visible.territory);
    expect(gridOf(wire.fog.terrain)).toEqual(visible.fog.terrain);
    expect(gridOf(wire.fog.visible)).toEqual(visible.fog.visible);
  });

  it('carries the theatre as runs, one row per row, each adding up to the map’s width', () => {
    const wire = wireOf();
    const [first] = wire.fog.terrain;

    expect(wire.fog.terrain).toHaveLength(MAP_HEIGHT);
    expect(gridOf(wire.fog.terrain)).toHaveLength(MAP_WIDTH * MAP_HEIGHT);
    expect(first).toMatch(/^\d+x\d+(,\d+x\d+)*$/);
  });

  it('sends an observation as one line of JSON, named by the tick being decided', () => {
    const message = observationMessage(40, observeSiege(createSiegeWorld(1), 'carthage'));
    const line = formatMessage(message);

    expect(line.endsWith('\n')).toBe(true);
    expect(line.trimEnd().includes('\n')).toBe(false);
    expect(JSON.parse(line)).toMatchObject({ type: 'observation', tick: 40 });
  });

  it('reads a grid that does not add up to the map as a grid that cannot be read', () => {
    const rows = wireOf().fog.visible;

    expect(() => gridOf(['1x0'])).toThrow(ProtocolError);
    expect(() => gridOf([...rows.slice(0, -1), '95x0'])).toThrow(ProtocolError);
  });
});

describe('a reply: the Commands for the tick that was asked about', () => {
  const ASKED: { readonly faction: 'rome'; readonly tick: number } = { faction: 'rome', tick: 40 };

  /** A reply line, as an agent would write it. */
  function reply(commands: readonly unknown[], tick = ASKED.tick): string {
    return JSON.stringify({ type: 'commands', tick, commands });
  }

  it('accepts an empty list as an answer, because silence is legal', () => {
    expect(readReply(reply([]), ASKED).commands).toEqual([]);
  });

  it('reads the Commands through the vocabulary, copying them', () => {
    const message = readReply(
      reply([{ kind: 'move', faction: 'rome', squads: [1, 2], x: 4, y: 5 }]),
      ASKED,
    );

    expect(message.commands).toEqual([{ kind: 'move', faction: 'rome', squads: [1, 2], x: 4, y: 5 }]);
  });

  it('refuses a Command the vocabulary refuses, naming the field', () => {
    expect(() => readReply(reply([{ kind: 'teleport', faction: 'rome' }]), ASKED)).toThrow(
      /message\.commands\[0\]\.kind is not a Command kind/,
    );
  });

  it('refuses a Command for the other Faction, which for a process is input it cannot read', () => {
    expect(() =>
      readReply(reply([{ kind: 'hold', faction: 'carthage', squads: [1] }]), ASKED),
    ).toThrow(/message\.commands\[0\]\.faction/);
  });

  it('refuses a reply about another tick, and a message that is not a reply', () => {
    expect(() => readReply(reply([], 41), ASKED)).toThrow(/message\.tick/);
    expect(() => readReply(JSON.stringify({ type: 'orders', tick: 40 }), ASKED)).toThrow(
      /message\.type/,
    );
    expect(() => readReply('not json', ASKED)).toThrow(/message is not JSON/);
  });

  it('refuses a field the protocol does not name, rather than ignoring it', () => {
    expect(() =>
      readReply(JSON.stringify({ type: 'commands', tick: 40, commands: [], note: 'hello' }), ASKED),
    ).toThrow(/message\.note is not a field/);
  });
});

describe('the end of a Match', () => {
  it('says how it ended and the hash it ended on', () => {
    const message = endMessage({ kind: 'clock', tick: 300 }, '0123456789abcdef');

    expect(message).toEqual({
      type: 'end',
      result: { kind: 'clock', tick: 300 },
      hash: '0123456789abcdef',
    });
  });

  it('says why the harness stopped asking, when it did', () => {
    expect(stoppedMessage('timeout', 'no reply')).toEqual({
      type: 'stopped',
      reason: 'timeout',
      detail: 'no reply',
    });
  });
});

describe('the wire’s grid encoding', () => {
  it('reads a row that is one value all the way across', () => {
    expect(gridOf(Array.from({ length: MAP_HEIGHT }, () => '160x0'))).toEqual(
      new Uint8Array(MAP_WIDTH * MAP_HEIGHT),
    );
  });

  it('reads several runs in a row, in order', () => {
    const rows = [...Array.from({ length: MAP_HEIGHT - 1 }, () => '160x0'), '4x0,154x1,2x0'];
    const grid = gridOf(rows);
    const last = (MAP_HEIGHT - 1) * MAP_WIDTH;

    expect(Array.from(grid.slice(last, last + 160))).toEqual([
      ...Array.from({ length: 4 }, () => 0),
      ...Array.from({ length: 154 }, () => 1),
      ...Array.from({ length: 2 }, () => 0),
    ]);
  });

  it('writes a row that is one value all the way across as one run', () => {
    expect(rowsOf(new Uint8Array(MAP_WIDTH * MAP_HEIGHT))[0]).toBe('160x0');
  });
});
