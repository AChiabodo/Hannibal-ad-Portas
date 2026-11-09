/**
 * An agent that answers with something the vocabulary refuses.
 *
 * The first observation gets a Command kind nobody has; every one after it gets
 * a perfectly good empty answer — because the harness must stop listening after
 * the first, and a fixture that goes quiet would not tell that apart from a
 * timeout.
 */
import { createInterface } from 'node:readline';

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
let answered = false;

for await (const line of input) {
  const message = JSON.parse(line) as { readonly type: string; readonly tick: number };
  if (message.type !== 'observation') continue;

  const commands = answered ? [] : [{ kind: 'teleport', faction: 'rome', squads: [1] }];
  answered = true;

  process.stdout.write(`${JSON.stringify({ type: 'commands', tick: message.tick, commands })}\n`);
}
