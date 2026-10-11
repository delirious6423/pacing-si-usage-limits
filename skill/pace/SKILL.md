---
name: pace
description: Pace AI coding-assistant usage across the 5-hour and weekly plan windows (80% dev / 20% casual). Use at session start, at phase boundaries, before fanning out parallel agents, when asked "/pace", "how much usage do I have", or when planning the week's roadmap.
---

# /pace

Reads plan usage, applies the 80/20 policy and returns a mode that limits parallel workers, effort (where configurable) and what to work on.
All arithmetic is done by `pace.py`; do not compute modes by hand.

## Setup facts (read once per session)

- **`<pace-dir>`** is the folder that holds `pace.py`, `config.json`, `roadmap.md`, `queue.md` and `ledger.md`.
  Default: `~/.claude/pace` (on Windows: `%USERPROFILE%\.claude\pace`). If the instructions file that loads this skill
  names another folder, use that folder instead. If the environment variable `PACE_HOME` is set, `config.json` and
  `ledger.md` are in that folder; the other files stay in `<pace-dir>`.
- **Python**: commands below say `python3`. On Windows use `python` or `py -3`.
- **Workers** means whatever your harness calls subagents, teammates or parallel agents. If it has none, treat every
  "workers" limit as "run steps one at a time".
- **Offload** means another model or tool that runs on a separate budget. If you have none, skip every offload step.

## Usage source

`pace.py` needs two numbers: percent used and reset time, for the 5-hour window and for the weekly window (a
model-specific weekly window is optional). Get them from the first source that works:

| Harness | Source |
|---|---|
| A harness with a usage tool that returns `plan.windows` (Claude Code desktop app: `get_usage`) | call it. Entries carry `label`, `percentUsed`, `resetsAt`. If the tool is deferred, load it first. |
| A harness with a usage screen or slash command (Claude Code CLI: `/usage`) | it is not a shell command: ask the user to run it, or read it from the chat UI, then copy the percentages and reset times. |
| Anything else | ask the user to read the numbers off their plan's usage page. |

If `plan.status` is `not_applicable` (API key, Bedrock, Vertex, gateway), say pacing does not apply and stop.

## `/pace` (default): check and decide

1. Read usage (see above). If usage is unavailable or a required window is missing: end this check (not the task).
   Apply YELLOW limits, report the budget and reset as unknown, do not pick roadmap work from an assumed budget,
   and retry at the next phase boundary.
2. Run `pace.py`. Pass the numbers as flags (quote the timestamps), or pipe a usage-tool result (`plan.windows`):
   ```bash
   python3 "<pace-dir>/pace.py" mode --h5 <pct> --h5-reset "<time>" --wk <pct> --wk-reset "<time>" --fable <pct>
   ```
   Or save the usage JSON to a UTF-8 file (no shell quoting needed, works in cmd.exe and PowerShell) and pass it on stdin:
   ```bash
   python3 "<pace-dir>/pace.py" mode --stdin < usage.json
   ```
   Flag mapping: the 5-hour window -> `--h5`/`--h5-reset`; the all-models weekly window -> `--wk`/`--wk-reset`; a
   model-specific weekly window -> `--fable` (drop the whole flag if your plan has none). Use `percentUsed` and
   `resetsAt` exactly as returned. If the output has a "stale" note, read usage once more and re-run.
3. Read `<pace-dir>/roadmap.md` and `queue.md`. Pick the next item: first `doing`, else the first `todo` whose est %
   is at most the printed "(= ~N% of the week)" figure (split a larger item into parts that fit). In RED, pick
   nothing: finish the current unit, write a handoff note, add the rest to `queue.md` with the reset time.
4. Reply in at most 6 lines: mode and why, remaining dev budget this window, the allowed workers and effort, the
   chosen item (or "none"), and when the next reset is. Then obey the mode for the rest of the task.

Mode limits (printed by `pace.py`): BURN up to 6 workers and pull the backlog; GREEN up to 4; YELLOW up to 2, medium
effort, offload drafts and reviews, one cheap verification round; RED no new workers, finish and hand off. Offload
work on a separate budget is allowed in every mode.

Re-run `/pace` at each phase boundary and before any fan-out of 3 or more workers (these always override the
cooldown). If the mode got worse, scale down at once. Otherwise do not re-run more than once every ~20 minutes.

## Session types

- **Every new or resumed session** does a light check: steps 1-2 only, one line of output. A resumed session always
  re-reads usage and revalidates its current unit; keep an old "usage before" baseline for `/pace log` only if no reset
  happened since.
- **Casual sessions** (chat, lookups, small questions) stop after the light check. They do not select roadmap work.
- **Dev sessions** (anything that edits files or fans out) continue with steps 3-4, log the cost when an item stops, and
  mark the item `doing` in `roadmap.md` when they start it.
- **Parallel sessions**: other sessions spend from the same pool. Before starting an item, re-read `roadmap.md`: skip
  any item already `doing` unless it is yours, and size your work to at most half the printed window budget when
  another dev session is running (roadmap items marked `doing` show who else is working).
- **Verification**: pacing caps discretionary fan-out only. Required verification stays a completion gate: use any
  method your own verification policy permits (inline checks, offloaded review, or cheap workers). If none can run in
  RED, hand off with verification pending and do not declare the work complete.
- The printed budget is a ceiling, not a target: YELLOW halves it and RED sets it to 0. Usage can change while you work,
  so the phase-boundary re-checks are what keep you off the wall.

## `/pace log`

When a roadmap item stops (done, blocked or paused), record its cost. Read usage at the start and the end of the item
(note the start numbers when you pick it). Then:
```bash
python3 "<pace-dir>/pace.py" log --item "<id>" --h5-before A --h5-after B --wk-before C --wk-after D --note "<short>"
```
Update the item's `actual %` and `status` in `roadmap.md`. Skip the row if a reset happened between the two readings.
Parallel sessions overlap, so the delta is approximate; mention it in `--note` when other sessions were running.

## `/pace plan` (once a week, early)

1. Run the default check, then `python3 "<pace-dir>/pace.py" k` to recalibrate.
2. Compare estimate vs actual for items finished since the last plan and scale the remaining estimates.
3. Choose this week's items so the sum of estimates is at most ~70% of the weekly limit (80% dev cap minus a ~10%
   buffer). Order: planning and scoping first, execution mid-week, verification and cleanup in the last third.
4. Triage the Inbox section, update `roadmap.md`, and print a day-by-day table (about dev % per day).

## `/pace queue`

Append deferred work to `queue.md` (format in that file) when YELLOW or RED stops it. Include the resume point.

## Rules

- Never skip a RED stop because the task is nearly done; finish the current unit only if it fits in the remaining
  headroom (a few % of the 5h window), otherwise hand off.
- Never spend the casual reserve on dev work except when `/pace` says the reserve is released.
- If asked for a one-off exception ("ignore pacing"), follow the user's request for that task only.
