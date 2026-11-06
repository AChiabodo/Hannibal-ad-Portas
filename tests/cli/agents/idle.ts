/**
 * A well-behaved agent that decides nothing: one empty `commands` message per
 * observation, and silence otherwise.
 *
 * The harness's own test fixture, not game code: it exists to prove that a Match
 * played over the protocol runs to its end with an agent that answers every
 * question and orders nothing.
 */
import { createInterface } from 'node:readline';

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  const message = JSON.parse(line) as { readonly type: string; readonly tick: number };
  if (message.type !== 'observation') continue;

  process.stdout.write(`${JSON.stringify({ type: 'commands', tick: message.tick, commands: [] })}\n`);
}
