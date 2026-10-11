# Status line indicator

`pace.py status` prints one line you can show in a status line:

```text
BURN 5h 16/80 wk 3/80 reset 3h16m
```

- The word is the mode: BURN (cyan), GREEN (green), YELLOW (yellow), RED (red).
- `5h 16/80` means 16% of the 5-hour window used, against a dev cap of 80%.
- `wk 3/80` is the same for the weekly window.
- `reset 3h16m` is the time left in the 5-hour window.

It reads the status-line JSON that Claude Code passes on stdin (`rate_limits.five_hour` and `rate_limits.seven_day`,
with `used_percentage` and `resets_at` as epoch seconds). The data is live, so no cache file is needed. The numbers
exist only for Claude.ai Pro and Max plans, and only after the first API response. If the weekly numbers are missing,
the line says `pace: waiting for usage`. If only the 5-hour numbers are missing, it treats the 5-hour window as fresh
(0% used). On any other error it says `pace: n/a`. It never prints a traceback. Set `NO_COLOR=1` for plain text.

The status line uses `config.json` (or `PACE_HOME`) like `pace.py mode`. It has no model-specific weekly window.

## Add it to Claude Code

Add this to `~/.claude/settings.json`. Merge it with your existing settings, and replace the path with your pace
folder. On Windows, use `python` or `py -3`.

```json
{
  "statusLine": {
    "type": "command",
    "command": "python3 /path/to/pace/pace.py status",
    "refreshInterval": 60
  }
}
```

`refreshInterval` is in seconds. Without it, Claude Code refreshes the line after each assistant message and when a
limit window resets.

Check the command by hand. The reset times in this example are far in the future, so the line is
`BURN 5h 16/80 wk 3/80 reset 5h00m`.

```bash
echo '{"rate_limits":{"five_hour":{"used_percentage":16,"resets_at":4102444800},"seven_day":{"used_percentage":3,"resets_at":4102444800}}}' | python3 /path/to/pace/pace.py status
```

## Caveats

- Claude Code documents status lines for the terminal. Whether the desktop app's Code tab shows a custom status
  line is untested. For the desktop app, see the Claude Code mod in `README.md`.
- A custom status line hides Claude Code's built-in footer hints.
- Other harnesses: pipe any JSON with the same `rate_limits` shape, or use `pace.py mode` with flags.
