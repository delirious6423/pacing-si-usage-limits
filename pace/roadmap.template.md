# Roadmap (dev lane, 80% of the week)

Estimates are in **% of the weekly limit** (all models). They are guesses until the ledger calibrates them
(`python3 ~/.claude/pace/pace.py k`, and compare actuals in `ledger.md`). A full 5-hour window is about 19% of the week
(k = 0.19). Plan the week so the sum of planned items is at most ~70% (80% dev cap minus a ~10% buffer).

Status: `todo` | `doing` | `blocked:<why>` | `done`. Pick the first `doing`, else the first `todo` that fits the dev
budget of the current window (`/pace` prints it). Update status and `actual` when you stop.

Cadence for the week: scope and plan early (cheap), execute mid-week, verify and clean up in the last third. Do not leave
more than ~15% of planned work for the last 12 hours.

The rows below are invented examples. Replace them with your own work.

| id | project | item | est % | actual % | status | notes |
|---|---|---|---|---|---|---|
| API-1 | api | Add pagination to the list endpoints | 6 | | doing | cursor-based; tests first |
| WEB-1 | web | Migrate the settings page to the new form component | 4 | | todo | one subagent per sub-form |
| DOC-1 | docs | Write the deployment guide | 3 | | todo | needs API-1 merged |
| CI-1 | ci | Fix the flaky integration test | 2 | | blocked:needs a CI log from the owner | |
| OPS-1 | meta | Weekly planning pass (`/pace plan`): re-estimate, reorder, update this table | 1 | | todo | do this once per week, early |

## Inbox (unscoped ideas; triage during `/pace plan`)

- (add one line per idea; give it an id and an estimate when it is promoted to the table)

## Casual lane (20% casual reserve, not planned)

Daily search, chat and hobby use. Nothing to schedule. Dev work must never push the 5-hour window past its dev cap, so
this lane always has room. `pace.py` releases the unused casual reserve near each reset.
