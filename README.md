# pace

A usage-pacing skill for AI coding assistants. It reads your plan usage, picks a mode with a deterministic Python script, and tells each session how many workers to run and what to work on. The goal is to use your plan fully without hitting the 5-hour or the weekly limit.

By default, 80% of capacity goes to dev and agent work. 20% stays free for casual use. The reserve is released in the last 12 hours of the week and the last 45 minutes of a 5-hour window, so unused capacity does not expire.

`pace.py` needs only two percentages and two reset times: the 5-hour window and the weekly window. A model-specific weekly window is optional. You can run it by hand, with no assistant.

## Compatibility

| Item | Status |
|---|---|
| macOS | Verified by the author |
| Claude Code desktop app, Pro plan | Verified by the author |
| Python 3.9 | Verified by the author |
| `install.py` on macOS | Verified by the author |
| Windows | Untested |
| Linux | Untested |
| Claude Code CLI `/usage` output format | Untested |
| `AGENTS.md`-based harnesses | Untested |
| Window labels on other plans | Untested |

## Quickstart

Run the installer from the root of this repository. On Windows, use `python` or `py -3` instead of `python3`.

```bash
python3 install.py
```

Paste `snippets/CLAUDE-policy.md` into your instructions file (`CLAUDE.md`, `AGENTS.md` or similar). Replace `<pace-dir>` with the folder the installer prints.

Run the skill in your assistant.

```
/pace
```

Edit `roadmap.md` in the pace folder and replace the example rows with your own work. See `docs/ONBOARDING.md` for the full walkthrough.

## Status line

Show the live mode in every Claude Code session. `pace.py status` reads the status-line JSON on stdin and prints
a colored line such as `GREEN 5h 16/80 wk 3/80 reset 3h16m`. Setup and caveats are in
[snippets/status-line.md](snippets/status-line.md). Terminal CLI only is documented; the desktop app is untested.

## Use it without an assistant

Pass the numbers as flags.

```bash
python3 pace/pace.py mode --h5 16 --h5-reset 2026-10-11T16:39:59Z --wk 3 --wk-reset 2026-10-13T07:59:59Z --now 2026-10-11T13:24:00Z
```

Or pipe JSON with `--stdin`.

```bash
echo '{"h5":{"pct":16,"resets_at":"2026-10-11T16:39:59Z"},"week":{"pct":3,"resets_at":"2026-10-13T07:59:59Z"}}' | python3 pace/pace.py mode --stdin --now 2026-10-11T13:24:00Z
```

`--stdin` also accepts a Claude Code `get_usage` result. Add an optional `"fable":{"pct":0}` key, or the `--fable` flag, for a model-specific weekly window. Add `--json` for full output. Leave out `--now` to use the current time.

## Modes

| Mode | Meaning | Workers | Effort | Offload | Backlog |
|---|---|---|---|---|---|
| BURN | Well under budget, or the reserve is released near a reset | up to 6 | high | yes (heavily) | pull next items |
| GREEN | On budget | up to 4 | high | yes | only if the roadmap item is done |
| YELLOW | Slightly ahead of budget, or the 5-hour window is filling | up to 2 | medium | yes (drafts and reviews) | no |
| RED | At a cap, or far ahead of budget | 0 | low | only work on a separate budget | no; queue it |

"Workers" means subagents, teammates or parallel agents, whatever your harness calls them. "Offload" means another model or tool on a separate budget. It is optional. If you have none, skip it.

YELLOW halves the budget printed for the current window. RED sets it to 0.

## How it works

```
usage source (see the Usage source table in SKILL.md)
   |  percent used + reset time for each window
   v
pace.py mode  <-- config.json (caps, release windows, k)
   |  mode, budget for this window, allowed workers and offload
   v
SKILL.md (/pace) --> reads roadmap.md + queue.md --> picks the next item
   |
   v
work --> /pace log --> ledger.md --> pace.py k --> config.json (k)
```

Usage sources:

| Harness | Source |
|---|---|
| Claude Code desktop app | the `get_usage` tool |
| Claude Code CLI | `/usage`; read the numbers and pass flags (untested) |
| Anything else | read the numbers from your plan's usage page |

`pace.py` compares weekly usage with a linear budget line: the dev cap spread over the week, plus 15 points of slack. The ratio of the two is the weekly pace. A pace above 1.0 gives YELLOW. A pace above 1.3 gives RED. A pace below 0.7 gives BURN. The 5-hour window can force YELLOW or RED on its own.

`k` is the number of weekly points one 5-hour point costs. It converts a 5-hour budget into weekly terms. The default is 0.19. The ledger recalibrates it.

## Configuration

`pace.py` reads `config.json` and writes `ledger.md` in its own folder. Set the `PACE_HOME` environment variable to use another folder for both.

Edit `config.json` in the pace folder.

| Key | Default | Meaning |
|---|---|---|
| `dev_week_cap` | 80 | % of the weekly limit that dev work may use |
| `dev_5h_cap` | 80 | % of a 5-hour window that dev work may use |
| `week_release_hours` | 12 | last N hours of the week: reserve released |
| `h5_release_minutes` | 45 | last N minutes of a 5-hour window: reserve released |
| `released_cap` | 95 | cap while the reserve is released |
| `k` | 0.19 | weekly points per 5-hour point |
| `fable_week_cap` | 80 | % on the model-specific weekly window that caps the mode at YELLOW |
| `pace_slack` | 15 | weekly points allowed ahead of the budget line |

For a 90/10 split, set `dev_week_cap` and `dev_5h_cap` to 90. Invalid values fall back to the defaults.

## Installer options

| Flag | Meaning |
|---|---|
| `--home DIR` | root folder (default: `$CLAUDE_HOME` or `~/.claude`) |
| `--pace-dir DIR` | folder for `pace.py`, config and roadmap (default: `<home>/pace`) |
| `--skill-dir DIR` | folder for the skill (default: `<home>/skills/pace`) |
| `--no-skill` | no skills folder: put `SKILL.md` next to `pace.py` instead |

The installer is safe to re-run. It backs up a changed file with a timestamp suffix before it replaces it. It never replaces `config.json`, `queue.md` or `roadmap.md` once they exist.

## Limits and honest caveats

- Reading usage needs a source. Claude Code desktop provides `get_usage`. Elsewhere you read the numbers yourself.
- Usage is account-wide. Casual use in the web app or on your phone raises the readings. That makes the script conservative.
- Verified on a Pro plan only. Window labels may differ on other plans. The `--stdin` parser matches labels by keyword (for example "5-hour", "weekly", "all models"). If yours differ, pass flags instead.
- Readings are integers. Small items cost less than 1 point and cannot be measured one by one.
- The mode is advice to the assistant. It follows it because the skill and policy say so. Nothing enforces it.
- Parallel sessions spend from the same pool. Ledger deltas overlap when two sessions run.
- `get_usage` reports `not_applicable` for API keys, Bedrock, Vertex and gateways. Pacing does not apply there.

## FAQ

**Does it block anything?** No. It prints a mode and the assistant obeys it.

**Does it work with an API key?** No. Plan windows do not exist there.

**Does it need Claude Code?** No. It needs Python and a way to read your usage. The skill file targets Claude Code. For other harnesses, copy the policy block and `SKILL.md` as described in `snippets/CLAUDE-policy.md`.

**Do I need another model for offload?** No. Offload is optional.

**Why is my mode YELLOW right after a reset?** The reading may be stale. If a reset time is in the past, the script caps the mode at YELLOW. Read usage again and re-run.

**Can I use a different split?** Yes. Change `dev_week_cap` and `dev_5h_cap`.

**Where do the numbers come from?** The roadmap estimates are guesses. The ledger replaces them with measured costs over time.

## License

MIT. See `LICENSE`.
