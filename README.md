# pacing-usage-limits

A usage-pacing toolkit for AI coding assistants on plans with a 5-hour limit and a weekly limit. It reads your plan usage and picks a mode with a deterministic Python script. The mode tells each session how many workers to run and what to work on. The goal is to use your plan fully without hitting either limit.

By default, 80% of capacity goes to dev and agent work (the dev cap). The other 20% is the casual reserve. The reserve is released in the last 12 hours of the week and the last 45 minutes of a 5-hour window, so unused capacity does not expire.

`pace.py` needs only two percentages and two reset times: one pair for the 5-hour window and one for the weekly window. A model-specific weekly window is optional. You can run it by hand, with no assistant.

The repository has four parts:

- `pace/pace.py`: the calculator (Python 3.9 or newer, standard library only).
- `skill/pace/SKILL.md`: the `/pace` skill, the instructions the assistant follows.
- `snippets/`: paste-ready text for your instructions file, a session-start hook and a status line.
- `mod/pace-indicator/`: an optional Claude Code mod that shows the mode in a band above the prompt.

## Compatibility

| Item | Status |
|---|---|
| macOS | Verified by the author |
| Claude Code desktop app, Pro plan | Verified by the author |
| Python 3.9 | Verified by the author |
| `install.py` on macOS | Verified by the author |
| Mod band in the desktop app's Code tab | An earlier layout was seen drawing. The current layout passes render tests only. |
| Mod band and pane on a real terminal | Untested. Render tests pass. |
| Windows | Untested |
| Linux | Untested |
| Claude Code CLI `/usage` output format | Untested |
| `AGENTS.md`-based harnesses | Untested |
| Window labels on other plans | Untested |
| SessionStart hook output handling | Untested |

## Quickstart

Run the installer from the root of this repository. On Windows, use `python` or `py -3` instead of `python3`.

```bash
python3 install.py
```

Paste `snippets/CLAUDE-policy.md` into your instructions file (`CLAUDE.md`, `AGENTS.md` or similar). Replace `<pace-dir>` with the folder the installer prints.

Run the skill in your assistant.

```text
/pace
```

Edit `roadmap.md` in the pace folder. Replace the example rows with your own work. For the full walkthrough, see [docs/ONBOARDING.md](docs/ONBOARDING.md).

## Status line

`pace.py status` prints the mode as one colored line for a Claude Code status line, for example `BURN 5h 16/80 wk 3/80 reset 3h16m`. It reads the status-line JSON on stdin. Setup and caveats are in [snippets/status-line.md](snippets/status-line.md). Claude Code documents status lines for the terminal. Whether the desktop app shows one is untested.

## Claude Code mod

`mod/pace-indicator` is a Claude Code mod. It draws a band above the prompt. The band shows the mode in color, a meter for the 5-hour window, a meter for the week, and the time to the next 5-hour reset. Each meter has a tick at the dev cap and a tinted casual reserve past it, so you can see the 80/20 split. The desktop app draws SVG meters. The terminal draws block meters. The mod sets no font: all text uses the host app's font, and the SVG meters hold no text.

The `details` button and the `/pacing` command open a pane. The pane shows the reason for the mode, both windows against their dev caps, the dev budget for this 5-hour window and the allowed limits. The `×` button hides the band. `/pacing` shows it again.

The mod reads live usage from the session, so it needs no cache file. It uses the same rules as `pace.py` with the default values. It does not read `config.json`, and it ignores a model-specific weekly window. A test checks that the mod and `pace.py` agree on 11 scenarios.

Install it from a terminal session of Claude Code:

```text
/plugin install pace-indicator --marketplace delirious6423/pacing-usage-limits
```

Or load it from a clone in every session, terminal and desktop app. Add the folder to the `env` block of `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/clone/mod/pace-indicator" } }
```

Use one way, not both. Claude Code watches a folder named in `CLAUDE_CODE_PLUGIN_DIRS`, so saved edits reload in sessions that start after the change. Mods are new. They run with your permissions and are not sandboxed. Read `mod/pace-indicator/hooks/register.tsx` before you install it.

Status: `claude plugin validate` passes, and the 8 tests pass, including render tests on the terminal and desktop element tables. The author saw an earlier layout of the band draw in the desktop app's Code tab. The current layout passes the render tests only. Drawing on a real terminal is untested.

## Use it without an assistant

Pass the numbers as flags.

```bash
python3 pace/pace.py mode --h5 16 --h5-reset 2026-10-11T16:39:59Z --wk 3 --wk-reset 2026-10-13T07:59:59Z --now 2026-10-11T13:24:00Z
```

Or pipe JSON with `--stdin`.

```bash
echo '{"h5":{"pct":16,"resets_at":"2026-10-11T16:39:59Z"},"week":{"pct":3,"resets_at":"2026-10-13T07:59:59Z"}}' | python3 pace/pace.py mode --stdin --now 2026-10-11T13:24:00Z
```

Both commands print mode BURN. `--stdin` also accepts the result of the Claude Code desktop app's `get_usage` tool. For a model-specific weekly window, add a `"fable":{"pct":0}` key or the `--fable` flag. Add `--json` for full output. Leave out `--now` to use the current time.

## Modes

| Mode | Meaning | Workers | Effort | Offload | Backlog |
|---|---|---|---|---|---|
| BURN | Well under budget, or the reserve is released near a reset | up to 6 | high | yes (heavily) | pull next items |
| GREEN | On budget | up to 4 | high | yes | only if the roadmap item is done |
| YELLOW | Slightly ahead of budget, the 5-hour window is filling ahead of the time line, the reading is stale, or a model-specific weekly window is at its cap | up to 2 | medium | yes (drafts and reviews) | no |
| RED | At a dev cap, or far ahead of budget | 0 | low | only work on a separate budget | no; queue it |

"Workers" means subagents, teammates or parallel agents, whatever your harness calls them. "Offload" means another model or tool on a separate budget. Offload is optional. If you have none, skip it.

The budget printed for the current 5-hour window is a ceiling. YELLOW halves it. RED sets it to 0.

## How it works

```text
usage source (see the table below)
   |  percent used + reset time for each window
   v
pace.py mode  <-- config.json (dev caps, release windows, k)
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

`pace.py` compares weekly usage with a linear budget line: the dev cap spread over the week, plus 15 points of slack. The ratio of the two is the weekly pace. The rules, in order:

1. RED if either window is at its dev cap, or the pace is above 1.3.
2. YELLOW if the pace is above 1.0, or the 5-hour window is within 20 points of its dev cap, has more than 1 hour left, and is ahead of the time line (used % above elapsed time %). A window that trails the time line does not trigger YELLOW, because unspent capacity expires at the reset.
3. BURN if the reserve is released, or the pace is below 0.7.
4. GREEN otherwise.

A reset time in the past means the reading is stale. A stale reading caps the mode at YELLOW. So does a model-specific weekly window at or above `fable_week_cap`.

`k` is the number of weekly points that one 5-hour point costs. It converts a 5-hour budget into weekly terms. The default is 0.19. `pace.py k` recalibrates it from the ledger.

## Configuration

`pace.py` reads `config.json` and writes `ledger.md` in its own folder. To use another folder for both, set the `PACE_HOME` environment variable.

Edit `config.json` in the pace folder.

| Key | Default | Meaning |
|---|---|---|
| `dev_week_cap` | 80 | % of the weekly limit that dev work may use |
| `dev_5h_cap` | 80 | % of a 5-hour window that dev work may use |
| `week_release_hours` | 12 | last N hours of the week: reserve released |
| `h5_release_minutes` | 45 | last N minutes of a 5-hour window: reserve released |
| `released_cap` | 95 | dev cap while the reserve is released |
| `k` | 0.19 | weekly points per 5-hour point |
| `fable_week_cap` | 80 | % of the model-specific weekly window that caps the mode at YELLOW |
| `pace_slack` | 15 | weekly points allowed ahead of the budget line |

For a 90/10 split, set `dev_week_cap` and `dev_5h_cap` to 90. An invalid value falls back to its default. Set `week_release_hours` or `h5_release_minutes` to 0 to turn off that release. The Claude Code mod always uses the defaults.

## Installer options

| Flag | Meaning |
|---|---|
| `--home DIR` | root folder (default: `$CLAUDE_HOME` or `~/.claude`) |
| `--pace-dir DIR` | folder for `pace.py`, config and roadmap (default: `<home>/pace`) |
| `--skill-dir DIR` | folder for the skill (default: `<home>/skills/pace`) |
| `--no-skill` | no skills folder: put `SKILL.md` next to `pace.py` instead |

You can run the installer again at any time. Before it replaces a changed file, it backs the file up with a timestamp suffix. It never replaces `config.json`, `queue.md` or `roadmap.md` once they exist. It does not install the Claude Code mod or the status line.

## Limits and caveats

- Reading usage needs a source. The Claude Code desktop app provides `get_usage`. Elsewhere you read the numbers yourself.
- Usage is account-wide. Casual use in the web app or on your phone raises the readings. That makes the script conservative.
- Verified on a Pro plan only. Window labels may differ on other plans. The `--stdin` parser matches labels by keyword (for example "5-hour", "weekly", "all models"). If yours differ, pass flags instead.
- Readings are integers. Small items cost less than 1 point and cannot be measured one by one.
- The mode is advice to the assistant. The assistant follows it because the skill and the policy block say so. Nothing enforces it.
- Parallel sessions spend from the same pool. Ledger deltas overlap when two sessions run.
- `get_usage` reports `not_applicable` for API keys, Bedrock, Vertex and gateways. Pacing does not apply there.

## FAQ

**Does it block anything?** No. It prints a mode, and the assistant follows it.

**Does it work with an API key?** No. Plan windows do not exist there.

**Does it need Claude Code?** No. It needs Python and a way to read your usage. `SKILL.md` is harness-neutral. Claude Code loads it as a skill. For other harnesses, see `snippets/CLAUDE-policy.md`.

**Do I need another model for offload?** No. Offload is optional.

**Why is my mode YELLOW right after a reset?** The reading may be stale. If a reset time is in the past, the script caps the mode at YELLOW. Read usage again and run the script again.

**Can I use a different split?** Yes. Change `dev_week_cap` and `dev_5h_cap`.

**Where do the numbers come from?** The roadmap estimates are guesses. The ledger replaces them with measured costs over time.

## License

Apache License 2.0. See [LICENSE](LICENSE).
