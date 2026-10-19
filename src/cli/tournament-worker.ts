/**
 * One Match of a tournament, played in a worker thread (E3).
 *
 * This is the whole of the thread's job: a `MatchRequest` arrives, the Match is
 * played by `playTournamentMatch`, and the summary goes back — or, when the rules
 * threw, the reason does, so that the batch can name the seed and stop rather
 * than report a balance number over a sample it silently shrank.
 *
 * The work is not here. This file is a message handler around one function, so
 * that the function can be called, tested and read in the ordinary way, and the
 * only thing a thread adds is that it happens on another core.
 */
import { parentPort } from 'node:worker_threads';
import { InputError } from './failure.ts';
import { playTournamentMatch, type MatchReply, type MatchRequest } from './tournament-batch.ts';

parentPort?.on('message', (request: MatchRequest) => {
  let reply: MatchReply;

  try {
    reply = { ok: true, summary: playTournamentMatch(request) };
  } catch (error) {
    reply = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      // A log that could not be written is the caller's path, not a broken Match.
      kind: error instanceof InputError ? 'input' : 'match',
    };
  }

  parentPort?.postMessage(reply);
});
