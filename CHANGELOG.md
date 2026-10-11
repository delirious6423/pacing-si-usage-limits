# Changelog

## v0.3.0

- `mod/pace-indicator`: a Claude Code mod. A band above the prompt shows the mode and two meters (5-hour and week) with the dev cap and the casual reserve marked. A `details` button and `/pacing` open a pane with the reasoning and the budget; `/pacing` also restores a hidden band. A marketplace file at the repo root installs it. Tests pin its logic to `pace.py` on 11 scenarios and render the band and pane on the terminal and desktop element tables.

## v0.2.0

- `pace.py status` prints a one-line colored indicator for a status line. It reads Claude Code status-line JSON (`rate_limits`) on stdin, needs no cache file, and never raises. See `snippets/status-line.md`.

## v0.1.0

First release. Portable across assistants and operating systems.

- `pace.py mode` computes BURN, GREEN, YELLOW or RED from the 5-hour and weekly readings. Input by flags or `--stdin` JSON. A model-specific weekly window is optional.
- Mode output lists `workers` and `offload` limits.
- `pace.py log` and `pace.py k` keep a ledger of actual costs and calibrate `k`.
- `PACE_HOME` moves the config and ledger folder.
- `/pace` skill with `plan`, `log` and `queue` subcommands, and a usage-source table for Claude Code desktop, Claude Code CLI and other harnesses.
- `install.py` (cross-platform Python) with `--home`, `--pace-dir`, `--skill-dir` and `--no-skill`. It backs up changed files and keeps your config, queue and roadmap.
- Roadmap template, deferred queue, harness-neutral instructions-file policy block and optional session-start hook.
- Verified on macOS with the Claude Code desktop app on a Pro plan and Python 3.9. Windows, Linux, the Claude Code CLI `/usage` format and `AGENTS.md` harnesses are untested.
