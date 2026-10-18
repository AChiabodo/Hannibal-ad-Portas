# The economy hears every Season, not only autumn and winter

B6's production, population and Payroll are a Season's ordinary work, not a
harvest or an attrition event, so the economy subscribes to **every** Season:
`SeasonHooks` grew an `onSeason`, and `announceSeasons` hands each crossing
Season to it before the specific `onAutumn` or `onWinter` hook for the same
boundary. ADR-0010 rejected a hook per Season because spring and summer open a
campaign season *nothing* had to react to; the economy is something, so the
premise no longer holds. The alternative — charging Payroll continuously or
having the economy derive the Season from the calendar it can read — was rejected
because it is the duplication ADR-0010 exists to prevent: a system that can
compute the Season can compute it differently, and a Payroll charged per tick is
a Payroll nobody can read as "every Season".

**Consequences**: every system still hears boundaries from the one clock, and
autumn and winter keep their extra meaning as the two hooks layered on top.
