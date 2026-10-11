# Onboarding

This guide takes you from zero to a working weekly cadence, step by step. For what is verified and what is untested, see the Compatibility table in [README.md](../README.md#compatibility).

## Prerequisites

- An assistant that can run shell commands, or just a terminal.
- A plan with a 5-hour window and a weekly window. Verified on Claude Code desktop with a Pro plan only.
- A way to read usage. See the Usage source table in [skill/pace/SKILL.md](../skill/pace/SKILL.md).
- Python 3.9 or newer.

Check Python. On Windows, use `python --version` or `py -3 --version`.

```bash
python3 --version
```

## Install

From the repository root, run the installer. On Windows, use `python` or `py -3` instead of `python3`.

```bash
python3 install.py
```

Default layout for Claude Code: the skill goes to `~/.claude/skills/pace/` and the files to `~/.claude/pace/`. On Windows, `~` is `%USERPROFILE%`.

The installer never overwrites `config.json`, `queue.md` or `roadmap.md`. If `pace.py` or `SKILL.md` differs, it saves a timestamped backup first. You can run it again at any time.

Install under another root.

```bash
python3 install.py --home /path/to/dir
```

For a harness without a skills folder, choose the pace folder and add `--no-skill`. The installer puts `SKILL.md` next to `pace.py`.

```bash
python3 install.py --no-skill --pace-dir /path/to/pace
```

Other options: `--skill-dir DIR` sets the skill folder. `CLAUDE_HOME` sets the default root.

Then paste the block from [snippets/CLAUDE-policy.md](../snippets/CLAUDE-policy.md) at the end of your instructions file. Replace `<pace-dir>` with the folder the installer printed. That snippet lists the instructions file for each harness. If your harness has no skills, the block tells the assistant to read `<pace-dir>/SKILL.md`.

To keep `config.json` and `ledger.md` in another folder, set `PACE_HOME` in the shell that runs `pace.py`. `pace.py`, `roadmap.md` and `queue.md` stay in the pace folder.

## First /pace

Run this in your assistant.

```text
/pace
```

The assistant reads usage, runs `pace.py mode`, and replies in at most six lines: the mode, the budget for this window, the allowed workers, the chosen roadmap item and the next reset.

Test the script alone with made-up numbers. The `--now` flag fixes the clock.

```bash
python3 ~/.claude/pace/pace.py mode --h5 16 --h5-reset 2026-10-11T16:39:59Z --wk 3 --wk-reset 2026-10-13T07:59:59Z --now 2026-10-11T13:24:00Z
```

On Windows, use `python "%USERPROFILE%\.claude\pace\pace.py"`.

## Fill in the roadmap

Open `roadmap.md` in the pace folder. Replace the example rows. For each item, set:

- `id` and `project`: short labels.
- `est %`: your guess in percent of the weekly limit. A full 5-hour window is about 19% of the week.
- `status`: `todo`, `doing`, `blocked:<why>` or `done`.

Keep the planned total at or below about 70%. Put loose ideas in the Inbox section.

## Cadence

Daily:

1. Start each session with `/pace`. Casual sessions stop after a one-line check.
2. Work the item `/pace` picks.
3. Run `/pace` again at each phase boundary and before fanning out 3 or more workers.
4. When an item stops, log its cost (next section).

Weekly:

- Early in the week, scope and plan. Run `/pace plan`. It recalibrates `k`, rescales estimates, and builds a day-by-day table.
- Mid-week, execute.
- In the last third of the week, verify and clean up. Do not leave more than about 15% of planned work for the last 12 hours.

## Log cost and calibrate k

When you start an item, note the usage numbers. When it stops, run `/pace log`. The assistant runs:

```bash
python3 ~/.claude/pace/pace.py log --item "API-1" --h5-before 16 --h5-after 30 --wk-before 3 --wk-after 5 --note "pagination, tests"
```

Then recompute `k`.

```bash
python3 ~/.claude/pace/pace.py k
```

`k` needs at least 20 points of 5-hour usage in the ledger. Rows that span a reset are skipped. The result goes to `config.json`.

## Use the queue

When the YELLOW or RED mode stops work, run `/pace queue`. The assistant appends a line to `queue.md` with the item, the estimate and the resume point. In BURN and GREEN, `/pace` pulls from the queue. Delete a line when you start it.

## Adjust 80/20

Edit `config.json` in the pace folder (or in `PACE_HOME`, if you set it). Change `dev_week_cap` and `dev_5h_cap`. Use 90 for a 90/10 split, or 70 for more casual room. The next `/pace` uses the new values. The status line uses them too. The Claude Code mod always uses 80/20.

## Optional extras

All three are for Claude Code. Each is optional.

- Session-start reminder: follow [snippets/session-start-hook.md](../snippets/session-start-hook.md).
- Status line: follow [snippets/status-line.md](../snippets/status-line.md).
- Band above the prompt and the `/pacing` pane: install the mod as described in [README.md](../README.md#claude-code-mod).

## Uninstall

Delete the skill folder and the pace folder. Back up `roadmap.md` and `ledger.md` first if you want to keep them.

```bash
rm -r ~/.claude/skills/pace ~/.claude/pace
```

On Windows, use File Explorer or `rmdir /s` on `%USERPROFILE%\.claude\skills\pace` and `%USERPROFILE%\.claude\pace`. Delete the block between `<!-- pace-policy:start -->` and `<!-- pace-policy:end -->` from your instructions file. If you added the session-start hook or the status line, remove them from `settings.json`. If you installed the mod, uninstall the `pace-indicator` plugin, or remove its folder from `CLAUDE_CODE_PLUGIN_DIRS`.

## Troubleshooting

**Stale reading.** The script prints a note that a reset time is in the past. Read usage again and re-run `/pace`. Until then the mode is capped at YELLOW.

**Usage unavailable.** If the usage source fails or lacks a window, `/pace` applies YELLOW limits and reports the budget as unknown. It retries at the next phase boundary. If Claude Code reports `not_applicable`, you use an API key or a cloud provider, and pacing does not apply.

**k does not calibrate.** `pace.py k` prints "not enough data" until the ledger holds 20 points of 5-hour usage. It prints "implausible" and writes nothing if `k` falls outside 0.02 to 1. Check `ledger.md` for rows with wrong numbers.

**The mode seems wrong.** Check these in order:

1. Casual use raises the readings, because usage is account-wide.
2. Another session may be spending from the same pool.
3. Labels may differ on your plan. The `--stdin` parser looks for words such as "5-hour", "weekly" and "all models". If yours differ, pass flags instead of `--stdin`.
4. Run the script with `--json` to see every number.

```bash
python3 ~/.claude/pace/pace.py mode --h5 16 --h5-reset 2026-10-11T16:39:59Z --wk 3 --wk-reset 2026-10-13T07:59:59Z --now 2026-10-11T13:24:00Z --json
```
