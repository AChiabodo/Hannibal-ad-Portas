import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEADLINE_MS,
  DEFAULT_DECISION_TICKS,
  ProtocolError,
  endMessage,
  gridOf,
  helloMessage,
  observationMessage,
  readReply,
  stoppedMessage,
  wireObservation,
} from '../../src/cli/protocol';
import { playAgentMatch } from '../../src/cli/agent';
import { MAP_HEIGHT, MAP_WIDTH } from '../../src/sim/map';
import type { Command } from '../../src/sim/command';
import { createMatch } from '../../src/sim/match';
import { createSiegeWorld, observeSiege, siegeMatchRules } from '../../src/sim/siege';

/**
 * The protocol is documented in one place, for someone writing an external agent,
 * and this is what stops the document and the code from drifting apart (E1).
 *
 * It reads prose as data the way `command-docs.test.ts` reads the Command table:
 * every message the document describes is compared with the message the code
 * builds, every example it shows is fed through the protocol's own reader, and
 * the skeleton agent it ends with is *run* — because "an agent can be written from
 * the document alone" is a claim that either survives a test or does not.
 */
const DOCUMENT = 'docs/PROTOCOL.md';
const PATH = fileURLToPath(new URL('../../docs/PROTOCOL.md', import.meta.url));
const TEXT = readFileSync(PATH, 'utf8');

/** The text between two of the HTML comments the document carries to be read this way. */
function between(start: string, end: string): string {
  const opening = TEXT.indexOf(start);
  const closing = TEXT.indexOf(end);
  if (opening < 0 || closing < 0 || closing < opening) {
    throw new Error(`${DOCUMENT} is missing the ${start} … ${end} markers`);
  }

  return TEXT.slice(opening + start.length, closing);
}

/** One fenced block, without its fences: what a reader would copy out of the document. */
function block(start: string, end: string): string {
  return between(start, end)
    .split('\n')
    .filter((line) => !line.trim().startsWith('```'))
    .join('\n')
    .trim();
}

/**
 * The fields a message table names: every backticked name in the first column, in
 * the order it appears — so `| `x`, `y` |` is two fields and not one.
 */
function fieldsOf(start: string, end: string): readonly string[] {
  return between(start, end)
    .split('\n')
    .filter((line) => line.trim().startsWith('| `'))
    .flatMap((line) =>
      Array.from((line.split('|')[1] ?? '').matchAll(/`([^`]+)`/g), (match) => match[1] ?? ''),
    );
}

/** The lines of a JSON Lines example block: what an agent would write, or must not. */
function linesOf(start: string, end: string): readonly string[] {
  return block(start, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'));
}

/** A real Observation, so the document's field list can be checked against the code's. */
function wireOf() {
  return wireObservation(observeSiege(createSiegeWorld(1), 'rome'));
}

/**
 * The same, one tick in, with a Squad raised: `squads` is empty at the opening of
 * a Match, and a field list checked against an empty list checks nothing.
 */
function wireWithASquad() {
  const match = createMatch({ seed: 1, rules: siegeMatchRules });
  const home = observeSiege(match.state.world, 'rome').settlements[0];
  if (home === undefined) throw new Error('the theatre opens with no settlement to raise men in');

  const recruit: Command = {
    kind: 'recruit',
    faction: 'rome',
    settlement: home.id,
    squadType: 'hastati',
    count: 1,
  };
  match.step([recruit]);

  return wireObservation(observeSiege(match.state.world, 'rome'));
}

/** The fields of one record, refused rather than guessed when there is no record. */
function keysOf(record: object | undefined): readonly string[] {
  if (record === undefined) throw new Error('the fixture has no record of that kind');

  return Object.keys(record);
}

const HELLO = {
  faction: 'rome' as const,
  seed: 7,
  ticks: 1000,
  ticksPerSecond: 10,
  decisionTicks: DEFAULT_DECISION_TICKS,
  deadlineMs: DEFAULT_DEADLINE_MS,
};

describe('the protocol documentation', () => {
  it('names every field of every message the harness sends, in the code’s own order', () => {
    expect(fieldsOf('<!-- hello:start -->', '<!-- hello:end -->')).toEqual(Object.keys(helloMessage(HELLO)));
    expect(fieldsOf('<!-- observation-message:start -->', '<!-- observation-message:end -->')).toEqual(
      Object.keys(observationMessage(0, observeSiege(createSiegeWorld(1), 'rome'))),
    );
    expect(fieldsOf('<!-- observation:start -->', '<!-- observation:end -->')).toEqual(Object.keys(wireOf()));
    expect(fieldsOf('<!-- fog:start -->', '<!-- fog:end -->')).toEqual(Object.keys(wireOf().fog));
    expect(fieldsOf('<!-- reply:start -->', '<!-- reply:end -->')).toEqual([
      'type',
      'tick',
      'commands',
    ]);
    expect(fieldsOf('<!-- end:start -->', '<!-- end:end -->')).toEqual(
      Object.keys(endMessage({ kind: 'clock', tick: 1 }, 'hash')),
    );
    expect(fieldsOf('<!-- stopped:start -->', '<!-- stopped:end -->')).toEqual(
      Object.keys(stoppedMessage('timeout', 'detail')),
    );
  });

  it('names every field of a Squad type and a building, as the greeting carries them', () => {
    const hello = helloMessage(HELLO);

    expect(fieldsOf('<!-- squad-type:start -->', '<!-- squad-type:end -->')).toEqual(
      keysOf(hello.squadTypes[0]),
    );
    expect(fieldsOf('<!-- building:start -->', '<!-- building:end -->')).toEqual(
      keysOf(hello.buildings[0]),
    );
  });

  it('names every field of a settlement and a Squad, as an Observation carries them', () => {
    const wire = wireWithASquad();

    expect(fieldsOf('<!-- settlement:start -->', '<!-- settlement:end -->')).toEqual(
      keysOf(wire.settlements[0]),
    );
    expect(fieldsOf('<!-- squad:start -->', '<!-- squad:end -->')).toEqual(keysOf(wire.squads[0]));
  });

  it('shows replies that the protocol’s own reader accepts', () => {
    const replies = linesOf('<!-- replies:start -->', '<!-- replies:end -->');

    expect(replies).toHaveLength(3);

    for (const line of replies) {
      const message = JSON.parse(line) as { readonly tick: number; readonly commands: readonly { faction?: string }[] };
      const faction = message.commands[0]?.faction ?? 'rome';

      expect(readReply(line, { faction: faction === 'carthage' ? 'carthage' : 'rome', tick: message.tick }).tick).toBe(
        message.tick,
      );
    }
  });

  it('shows malformed input that the protocol’s own reader refuses', () => {
    const malformed = linesOf('<!-- malformed:start -->', '<!-- malformed:end -->');

    expect(malformed.length).toBeGreaterThan(0);

    for (const line of malformed) {
      expect(() => readReply(line, { faction: 'rome', tick: 40 }), line).toThrow(ProtocolError);
    }
  });

  it('shows grid rows that decode to the width the map has', () => {
    const rows = block('<!-- grids:start -->', '<!-- grids:end -->')
      .split('\n')
      .map((line) => JSON.parse(line) as string);

    expect(rows).toEqual(['96x0', '4x0,90x1,2x0']);
    expect(gridOf(Array.from({ length: MAP_HEIGHT }, () => rows[0] ?? '96x0'))).toHaveLength(
      MAP_WIDTH * MAP_HEIGHT,
    );
    expect(gridOf([...Array.from({ length: MAP_HEIGHT - 1 }, () => '96x0'), rows[1] ?? ''])).toHaveLength(
      MAP_WIDTH * MAP_HEIGHT,
    );
  });

  it('ends with a skeleton agent that plays a whole Match when it is run', async () => {
    const source = block('<!-- minimal-agent:start -->', '<!-- minimal-agent:end -->');
    const directory = mkdtempSync(join(tmpdir(), 'spqr-agent-'));
    const script = join(directory, 'agent.mjs');

    writeFileSync(script, `${source}\n`);

    const run = await playAgentMatch({
      seed: 1,
      ticks: 200,
      faction: 'rome',
      opponent: 'idle',
      script,
      deadlineMs: 5000,
    });

    expect(run.agent).toMatchObject({ status: 'played', stoppedBy: null, commands: 0 });
    expect(run.result).toEqual({ kind: 'clock', tick: 200 });
  }, 30_000);
});
