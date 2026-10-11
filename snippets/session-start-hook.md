# Optional: session-start reminder

A session-start hook can print a one-line reminder to run `/pace` when a session opens. The hook is optional. The policy block from `CLAUDE-policy.md` already asks the assistant to run `/pace`.

This example is for Claude Code. Other harnesses use different hook mechanisms, or none. The hook is untested, in Claude Code and elsewhere.

Add this to the `hooks` section of your Claude Code `settings.json` (`~/.claude/settings.json` on macOS and Linux, `%USERPROFILE%\.claude\settings.json` on Windows). Merge it with any hooks you already have.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Pacing: run /pace before dev work (modes: BURN, GREEN, YELLOW, RED).'"
          }
        ]
      }
    ]
  }
}
```

Claude Code is expected to add the output of a SessionStart command to the session context. This is untested, and the output handling can differ between versions. Check the hooks documentation for your version.

To remove the reminder, delete the entry from `settings.json`.
