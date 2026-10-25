/**
 * An agent that plays by the `hello`: it raises Squads of the first type its own
 * Faction is offered, in its own settlement, stamped with the Faction the
 * greeting named.
 *
 * A fixture for the two facts an agent author needs from the greeting — what my
 * Faction is, and what my roster is called — and the one Command that makes them
 * visible in a report.
 */
import { createInterface } from 'node:readline';

/** The greeting, as this fixture reads it. */
interface Hello {
  readonly type: 'hello';
  readonly faction: string;
  readonly squadTypes: readonly { readonly id: string }[];
}

/** The question, as this fixture reads it. */
interface Question {
  readonly type: 'observation';
  readonly tick: number;
  readonly observation: {
    readonly squads: readonly unknown[];
    readonly settlements: readonly { readonly id: number }[];
  };
}

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let faction = 'rome';
let squadType = 'hastati';
let raised = false;

for await (const line of input) {
  const message = JSON.parse(line) as Hello | Question;

  if (message.type === 'hello') {
    faction = message.faction;
    squadType = message.squadTypes[0]?.id ?? squadType;
    continue;
  }

  if (message.type !== 'observation') continue;

  const home = message.observation.settlements[0];
  const commands =
    raised || home === undefined
      ? []
      : [{ kind: 'recruit', faction, settlement: home.id, squadType, men: 24, count: 1 }];
  raised = true;

  process.stdout.write(`${JSON.stringify({ type: 'commands', tick: message.tick, commands })}\n`);
}
