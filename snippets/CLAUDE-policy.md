# Instructions-file policy block

Paste this block at the end of your harness's global instructions file, then replace `<pace-dir>` with the pace
folder the installer prints. File names by harness:

| Harness | Instructions file |
|---|---|
| Claude Code | `~/.claude/CLAUDE.md` |
| Codex CLI and other tools that read `AGENTS.md` | `AGENTS.md` (global or per project) |
| Others | wherever the tool loads standing instructions |

The markers let you find and replace the block later. If your harness has no skills, install with
`python3 install.py --no-skill`. It puts `SKILL.md` in `<pace-dir>`. The block below then tells the assistant to read
`<pace-dir>/SKILL.md`.

<!-- pace-policy:start -->
## Usage pacing (standing)

I want my plan used fully, without hitting the 5-hour or weekly limit. Capacity is split 80% dev work (agents, builds,
roadmap) and 20% casual use (search, chat, hobby). The `pace` skill and `<pace-dir>` implement it.

- Every new or resumed session does a light check: follow steps 1-2 of the pace procedure (`/pace` where skills
  exist, otherwise `<pace-dir>/SKILL.md`) and report the mode in one line. Casual sessions (plain questions, chat,
  lookups) stop there and do not pick roadmap work.
- Before any non-trivial dev task, at every phase boundary, and before fanning out 3 or more parallel workers: run
  the full pace procedure and obey the mode (BURN, GREEN, YELLOW, RED). The mode caps workers, effort and what to work on.
- Plan and execute against `<pace-dir>/roadmap.md` (estimates in % of the weekly limit). When a roadmap item stops,
  follow the `/pace log` procedure and update its status and actual cost. Work that a RED or YELLOW mode stops goes in
  `<pace-dir>/queue.md`.
- Pace the work, not only the tokens: scope early in the week, execute mid-week, verify and clean up in the last third.
  Do not start a large item that does not fit the printed dev budget for this 5-hour window; split it or queue it.
- Never let dev work push the 5-hour window past its dev cap; that room is the casual reserve.
- If you have another model or tool on a separate budget, offload drafts and reviews to it in YELLOW and RED.
- Pacing caps discretionary fan-out only. Any verification policy you have remains a completion gate: in RED, verify
  inline or by offload, or hand off with verification pending and do not declare the work complete.
<!-- pace-policy:end -->
