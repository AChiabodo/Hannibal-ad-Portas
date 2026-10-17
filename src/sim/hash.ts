/**
 * The state hash: the fingerprint a Match is compared by (PLAN §3).
 *
 * A hash that changes is either a bug or a decision, so the algorithm is
 * written down here rather than borrowed from a dependency: FNV-1a, 64 bits,
 * over the canonical serialization of the state, in `BigInt` arithmetic that is
 * exact on every engine and in every browser.
 *
 * Sixty-four bits rather than thirty-two, because of what the hash is for. It
 * decides whether two runs are the same run, so a collision is not a curiosity:
 * it is a replay that matched when it should not have, or a divergence report
 * that names the wrong tick. At 64 bits that has to be an accident of one in
 * 2^64 rather than a birthday in a tournament.
 *
 * Hashing a whole state is not cheap, and it is not meant to be called every
 * tick in a long Match: the callers that care about divergence hash at
 * checkpoints (`replay` in `replay.ts` does exactly that).
 */
import { serializeState } from './state';

/** The FNV-1a 64-bit parameters, as the algorithm defines them. */
const OFFSET_BASIS = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * The fingerprint of a state, as sixteen lowercase hexadecimal digits.
 *
 * @throws StateSerializationError when the state holds anything but integers —
 *   a float in hashed state fails here, loudly, instead of changing the number.
 */
export function hashState(state: unknown): string {
  const canonical = serializeState(state);

  let hash = OFFSET_BASIS;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = ((hash ^ BigInt(canonical.charCodeAt(index))) * PRIME) & MASK_64;
  }

  return hash.toString(16).padStart(16, '0');
}
