#!/usr/bin/env python3
"""Install the pace skill and pace.py. Works on macOS, Linux and Windows. Safe to re-run.

  python3 install.py                      # Claude Code layout under ~/.claude (or $CLAUDE_HOME)
  python3 install.py --home /some/dir     # use a different root
  python3 install.py --pace-dir D --skill-dir S   # exact folders, for other harnesses
  python3 install.py --no-skill           # harnesses without a skills folder: SKILL.md goes beside pace.py

Rules: a file that differs is backed up with a timestamp suffix before it is replaced. config.json, queue.md and
roadmap.md are never replaced once they exist, so your edits and your calibrated k survive re-runs.
"""
import argparse, datetime as dt, filecmp, os, pathlib, shutil, sys

SRC = pathlib.Path(__file__).resolve().parent
STAMP = dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")


def install(src, dst, replace_if_differs):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        if not replace_if_differs:
            print(f"kept existing: {dst}")
            return
        if filecmp.cmp(src, dst, shallow=False):
            print(f"unchanged: {dst}")
            return
        backup = dst.with_name(dst.name + f".bak-{STAMP}")
        shutil.copy2(dst, backup)
        print(f"backed up: {dst} -> {backup}")
    shutil.copy2(src, dst)
    print(f"installed: {dst}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--home", help="root folder (default: $CLAUDE_HOME or ~/.claude)")
    ap.add_argument("--pace-dir", help="folder for pace.py, config, roadmap (default: <home>/pace)")
    ap.add_argument("--skill-dir", help="folder for the skill (default: <home>/skills/pace)")
    ap.add_argument("--no-skill", action="store_true", help="no skills folder: put SKILL.md next to pace.py instead")
    a = ap.parse_args()

    home = pathlib.Path(a.home or os.environ.get("CLAUDE_HOME") or (pathlib.Path.home() / ".claude")).expanduser()
    pace_dir = (pathlib.Path(a.pace_dir).expanduser() if a.pace_dir else home / "pace").resolve()
    skill_dir = (pathlib.Path(a.skill_dir).expanduser() if a.skill_dir else home / "skills" / "pace").resolve()

    if a.no_skill:  # no skills folder: keep the procedure next to pace.py so the assistant can be told to read it
        install(SRC / "skill" / "pace" / "SKILL.md", pace_dir / "SKILL.md", True)
    else:
        install(SRC / "skill" / "pace" / "SKILL.md", skill_dir / "SKILL.md", True)
    install(SRC / "pace" / "pace.py", pace_dir / "pace.py", True)
    try:
        (pace_dir / "pace.py").chmod(0o755)
    except OSError:
        pass  # not meaningful on Windows
    install(SRC / "pace" / "config.json", pace_dir / "config.json", False)
    install(SRC / "pace" / "queue.md", pace_dir / "queue.md", False)
    install(SRC / "pace" / "roadmap.template.md", pace_dir / "roadmap.md", False)

    print(f"""
Next steps:
  1. Paste snippets/CLAUDE-policy.md into your instructions file and replace <pace-dir> with:
       {pace_dir}
  2. Edit {pace_dir / 'roadmap.md'} with your own work.
  3. Run /pace in your assistant. Without a skills folder, ask it to read SKILL.md first.
  4. Optional: add the SessionStart reminder from snippets/session-start-hook.md.
  Check the install without any assistant:
       {'python' if sys.platform == 'win32' else 'python3'} "{pace_dir / 'pace.py'}" mode --h5 10 --h5-reset 2099-01-01T05:00:00Z --wk 5 --wk-reset 2099-01-07T00:00:00Z""")


if __name__ == "__main__":
    main()
