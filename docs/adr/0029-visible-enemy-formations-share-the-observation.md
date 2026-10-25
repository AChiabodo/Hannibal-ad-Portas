# Visible enemy formations belong to the shared Observation

#71 exposed a complete rendering omission: enemy field Squads entered permitted
sight and raised contact notices, but the renderer received only owned Squads.
On 2026-10-25 the user chose real procedural formations over an unquantified
contact marker. This supersedes ADR-0028's restriction on visible enemy headcount,
without changing its combat rules or exposing private condition.

The shared Observation now reports a currently sighted field Squad's men,
recruited capacity, figure count, formation and facing under `appearance`.
Human and AI receive the same information at every difficulty. Morale, fatigue,
ammunition, stocks, Payroll, routes and orders remain private. Appearance never
enters the last-known contact memory: an enemy outside current sight disappears
from the troop layer even if its old contact notice remains actionable.

The renderer uses the existing aggregate procedural composition and casualty
slots, with the enemy Faction's cloth and standard, without selection or private
condition plates. Its idle pose does not imply knowledge of a hidden goal.
The military policy continues its existing nominal type estimate; this delivery
does not retune AI strength or alter Match state, costs, vision or Replay hashes.
Older externally supplied scenario records may omit appearance; canonical Match
Observations always supply it for enemies in sight.
