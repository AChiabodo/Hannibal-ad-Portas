# One calendar, and a Season boundary is the only hook

The Match's strategic clock is one calendar, and every system that cares when a
Season begins is told: `advanceCalendar` writes the year and the Season as
integer state and reports the boundaries, and `announceSeasons` hands that same
report to every system that subscribed through `onAutumn` or `onWinter`. No
system counts the year, no system derives a Season of its own, and no system has
to win a race to advance the clock in order to hear it. The calendar is a
function of the Match's tick rather than an accumulator beside it, so a boundary
falls on the same tick in every run and a replay crosses it again there.

**Considered Options**: every system counting its own elapsed ticks — rejected
because the economy, Attrition and the AI would then disagree about when a Season
started, and the first change to a Season's length would have to be found in
every one of them; each reader deriving the Season from the tick — rejected
because it is the same duplication with a shorter name, and because a system that
can compute the calendar can also compute it differently; a hook per Season —
rejected because spring and summer open a campaign season nothing has to react
to, and a hook nobody subscribes to is an invitation to subscribe.

**Consequences**: harvest yields (B6) and winter Attrition (C6) arrive as hook
implementations and never as calendar arithmetic; each is a subscriber object
passed to `announceSeasons` by the composed rules, not a caller of the clock. The Season is three and a half
minutes, recorded once in `SEASON_TICKS`, and a game year is four of them. Three
speeds and a pause change how much wall time a tick costs and never enter state,
so a paused Match replays exactly as one that ran straight through; orders given
while paused are held by the Player's Controller and applied on the first tick
after the resume. A headless Match is bound to three game years
(`HEADLESS_TICKS`), because a Match that can never end is a test that can never
finish.
