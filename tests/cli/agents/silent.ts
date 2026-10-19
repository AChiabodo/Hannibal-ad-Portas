/**
 * An agent that reads the protocol and never answers, and stays alive while it
 * does it: the pipe is open, the process is running, and nothing comes back.
 *
 * The harness has to call that a Player who stopped on the deadline, and not a
 * crash and not a hung Match.
 */
import { createInterface } from 'node:readline';

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  void line;
}
