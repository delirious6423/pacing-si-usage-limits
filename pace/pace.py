#!/usr/bin/env python3
"""Pacing calculator for AI coding-assistant plan limits (5-hour and weekly windows).

Harness-neutral: it only needs two percentages and two reset times. Give them as flags, or pipe JSON.

  pace.py mode --h5 16 --h5-reset 2026-10-11T16:39:59Z --wk 3 --wk-reset 2026-10-13T07:59:59Z [--fable 0]
  <usage json> | pace.py mode --stdin     # a get_usage result, or {"h5":{"pct":16,"resets_at":"..."},"week":{...}}
  pace.py log  --item "api pagination" --h5-before 16 --h5-after 30 --wk-before 3 --wk-after 5 [--note ...]
  pace.py k                 # recompute k (weekly pts per 5h pt) from the ledger

Policy (80/20): dev work may use up to DEV_WEEK_CAP % of the week and DEV_5H_CAP % of a 5-hour window.
The rest is reserved for casual use. Reserves are released near each reset (use it or lose it).
All numbers come from the account-wide usage card, so casual use inflates the readings (conservative).
"""
import argparse, datetime as dt, json, os, pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
DATA = pathlib.Path(os.environ.get("PACE_HOME") or HERE)  # config and ledger live here; override with PACE_HOME
CONFIG = DATA / "config.json"
LEDGER = DATA / "ledger.md"
DEFAULTS = {
    "dev_week_cap": 80,       # % of weekly limit dev may use
    "dev_5h_cap": 80,         # % of a 5-hour window dev may use
    "week_release_hours": 12, # last N hours of the week: reserve is released
    "h5_release_minutes": 45, # last N minutes of a 5-hour window: reserve is released
    "released_cap": 95,       # cap while released
    "k": 0.19,                # weekly pts consumed per 5h pt (calibrated from ledger)
    "fable_week_cap": 80,
    "pace_slack": 15,         # weekly pts allowed ahead of the linear budget line (damps early-week noise)
}


def cfg():
    c = dict(DEFAULTS)
    try:
        c.update(json.loads(CONFIG.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        pass
    # reject nonsense values (k=0 would divide by zero) and fall back to the defaults
    for key in ("k", "dev_week_cap", "dev_5h_cap", "released_cap", "fable_week_cap"):
        if not isinstance(c[key], (int, float)) or not 0 < c[key] <= 100:
            c[key] = DEFAULTS[key]
    if not isinstance(c["pace_slack"], (int, float)) or c["pace_slack"] <= 0:
        c["pace_slack"] = DEFAULTS["pace_slack"]
    return c


def parse(ts):
    ts = re.sub(r"(\d\d:\d\d:\d\d)\.\d+", r"\1", ts.strip().replace("Z", "+00:00"))  # py3.9: drop fractions
    t = dt.datetime.fromisoformat(ts)
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)  # naive input is UTC


def now_utc():
    return dt.datetime.now(dt.timezone.utc)


def window(pct, reset, length_h, now):
    """Return (pct, left_h, elapsed, stale). A reset already in the past means the reading is stale.
    The real usage is unknown, so keep the reported pct (never invent capacity), assume a fresh
    window, and let compute() cap the mode at YELLOW until get_usage is re-read."""
    if not 0 <= pct <= 1000:  # also rejects NaN
        raise SystemExit(f"invalid percentUsed {pct!r}: re-run get_usage")
    left_h = (parse(reset) - now).total_seconds() / 3600
    stale = left_h <= 0
    if stale:
        left_h = float(length_h)
    left_h = min(left_h, float(length_h))  # clock skew: never more than one window ahead
    elapsed = min(max(1 - left_h / length_h, 0.0), 1.0)
    return max(pct, 0.0), left_h, elapsed, stale


def compute(a, c, now=None):
    now = now or now_utc()
    h5, h5_left, e5, st5 = window(a.h5, a.h5_reset, 5, now)
    wk, wk_left, ew, stw = window(a.wk, a.wk_reset, 168, now)
    reasons = [f"{n} resetsAt is in the past: reading is stale, mode capped at YELLOW; re-run get_usage"
               for n, st in (("5h", st5), ("weekly", stw)) if st]
    cw, c5 = c["dev_week_cap"], c["dev_5h_cap"]
    released_w = wk_left <= c["week_release_hours"]
    released_5 = h5_left * 60 <= c["h5_release_minutes"]
    if released_w:
        cw = c["released_cap"]
    if released_5:
        c5 = c["released_cap"]

    pw = wk / (cw * ew + c["pace_slack"])  # weekly pace vs the dev budget line (plus slack)
    head5 = max(c5 - h5, 0)
    headw = max(cw - wk, 0)
    # dev budget this window in 5h points: bounded by both windows
    budget5 = min(head5, headw / c["k"])

    fable_hit = a.fable is not None and a.fable >= c["fable_week_cap"]
    if h5 >= c5:
        mode, why = "RED", f"5h window at {h5:g}% (dev cap {c5}%)"
    elif wk >= cw:
        mode, why = "RED", f"weekly at {wk:g}% (dev cap {cw}%)"
    elif pw > 1.3:
        mode, why = "RED", f"weekly pace {pw:.2f} is over 1.3x the dev budget line"
    elif pw > 1.0 or (h5 >= c5 - 20 and h5_left > 1.0):
        mode, why = "YELLOW", (
            f"weekly pace {pw:.2f} above the budget line" if pw > 1.0
            else f"5h window at {h5:g}% with {h5_left:.1f}h left: space out work")
    elif pw < 0.7 or released_w or released_5:
        mode, why = "BURN", (
            "reserve released near reset: spend it" if (released_w or released_5)
            else f"weekly pace {pw:.2f}: well under budget, pull the backlog")
    else:
        mode, why = "GREEN", f"weekly pace {pw:.2f}: on budget"

    if (st5 or stw) and mode in ("GREEN", "BURN"):
        mode, why = "YELLOW", "stale usage reading: re-run get_usage before spending"

    if fable_hit:
        reasons.append(f"Fable weekly at {a.fable:g}%: switch to Sonnet/Haiku for Claude work")
        if mode in ("GREEN", "BURN"):
            mode, why = "YELLOW", f"Fable weekly at {a.fable:g}% (cap {c['fable_week_cap']}%)"

    # budget is a ceiling by default; a mode that says "slow down" shrinks it
    budget5 = {"RED": 0.0, "YELLOW": budget5 * 0.5}.get(mode, budget5)
    rules = {
        "BURN": dict(workers=6, effort="high", offload="yes (heavily)", verify="full rounds", backlog="pull next items"),
        "GREEN": dict(workers=4, effort="high", offload="yes", verify="full rounds", backlog="only if roadmap item done"),
        "YELLOW": dict(workers=2, effort="medium", offload="yes (drafts and reviews)", verify="one round, cheap agents", backlog="no"),
        "RED": dict(workers=0, effort="low", offload="only work on a separate budget", verify="none; write handoff", backlog="no; queue it"),
    }[mode]
    sustain_h = None
    if wk > 0 and ew > 0:
        rate = wk / (ew * 168)  # weekly pts per hour so far
        sustain_h = max((cw - wk) / rate, 0) if rate else None
    return {
        "mode": mode, "why": why, "notes": reasons,
        "h5": {"used": h5, "left_h": round(h5_left, 2), "dev_cap": c5, "released": released_5},
        "week": {"used": wk, "left_h": round(wk_left, 1), "dev_cap": cw, "released": released_w,
                 "pace_vs_budget": round(pw, 2), "elapsed": round(ew, 2)},
        "budget_this_window": {"h5_pts": round(budget5, 1), "week_pts": round(budget5 * c["k"], 1),
                               "approx_full_windows_left_this_week": round(headw / (100 * c["k"]), 1)},
        "hours_until_dev_week_cap_at_current_rate": None if sustain_h is None else round(sustain_h, 1),
        "allowed": rules,
        "next_reset_5h": a.h5_reset, "next_reset_week": a.wk_reset,
    }


def fmt(r):
    b = r["budget_this_window"]
    out = [
        f"MODE: {r['mode']}  ({r['why']})",
        f"5h:   {r['h5']['used']:g}% used, {r['h5']['left_h']}h left, dev cap {r['h5']['dev_cap']}%"
        + (" [reserve released]" if r["h5"]["released"] else ""),
        f"week: {r['week']['used']:g}% used, {r['week']['left_h']}h left, dev cap {r['week']['dev_cap']}%, "
        f"pace {r['week']['pace_vs_budget']}x budget line"
        + (" [reserve released]" if r["week"]["released"] else ""),
        f"dev budget this 5h window: {b['h5_pts']} pts of 5h (= ~{b['week_pts']}% of the week); "
        f"~{b['approx_full_windows_left_this_week']} full windows of dev headroom left in the week",
        "allowed: " + ", ".join(f"{k}={v}" for k, v in r["allowed"].items()),
    ]
    out += [f"note: {n}" for n in r["notes"]]
    return "\n".join(out)


def read_usage(raw):
    """Normalize a usage payload to (h5, h5_reset, wk, wk_reset, fable).

    Accepts a get_usage result ({"plan": {"windows": [...]}} or {"windows": [...]}) with entries
    {"label", "percentUsed", "resetsAt"}, or {"h5": {"pct", "resets_at"}, "week": {...}, "fable": {...}}.
    """
    d = json.loads(raw)
    if "h5" in d and "week" in d:
        f = d.get("fable") or {}
        return (d["h5"]["pct"], d["h5"]["resets_at"], d["week"]["pct"], d["week"]["resets_at"], f.get("pct"))
    wins = (d.get("plan") or d).get("windows")
    if not wins:
        raise SystemExit("no usage windows found in the input: re-read usage")
    h5 = wk = fable = None
    for w in wins:
        lab = str(w.get("label", "")).lower()
        item = (w["percentUsed"], w["resetsAt"])
        if "5-hour" in lab or "5 hour" in lab or "5h" in lab:
            h5 = h5 or item
        elif "weekly" in lab or "7-day" in lab or "week" in lab:
            if "all models" in lab or "all-models" in lab:
                wk = item
            elif wk is None and not any(m in lab for m in ("fable", "opus", "sonnet", "haiku")):
                wk = item
            elif "fable" in lab:
                fable = item[0]
    if not (h5 and wk):
        raise SystemExit("missing a 5-hour or weekly window in the input: re-read usage or pass flags")
    return h5[0], h5[1], wk[0], wk[1], fable


def cmd_log(a):
    if not LEDGER.exists():
        LEDGER.write_text(encoding="utf-8", data="# Ledger\n\n| date | item | h5 before | h5 after | wk before | wk after | note |\n|---|---|---|---|---|---|---|\n")
    clean = lambda t: t.replace("|", "/").replace("\n", " ")  # keep the table parseable
    row = f"| {now_utc():%Y-%m-%d %H:%M} | {clean(a.item)} | {a.h5_before:g} | {a.h5_after:g} | {a.wk_before:g} | {a.wk_after:g} | {clean(a.note)} |\n"
    with LEDGER.open("a", encoding="utf-8") as f:
        f.write(row)
    print("logged:", row.strip())


def cmd_k(_):
    h5 = wk = 0.0
    if LEDGER.exists():
        for line in LEDGER.read_text(encoding="utf-8").splitlines():
            p = [x.strip() for x in line.strip("|").split("|")]
            try:
                d5, dw = float(p[3]) - float(p[2]), float(p[5]) - float(p[4])
            except (ValueError, IndexError):
                continue
            if d5 > 0 and dw >= 0:  # skip rows that span a reset
                h5 += d5
                wk += dw
    if h5 < 20:
        print(f"not enough data (only {h5:g} 5h pts logged; need 20). keeping k={cfg()['k']}")
        return
    k = round(wk / h5, 3)
    if not 0.02 <= k <= 1:  # weekly pts per 5h pt; outside this the ledger is wrong or too coarse
        print(f"implausible k={k} ({wk:g} weekly pts / {h5:g} 5h pts): not written. Check ledger.md")
        return
    try:
        c = json.loads(CONFIG.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        c = {}
    c["k"] = k
    CONFIG.write_text(json.dumps(c, indent=2) + "\n", encoding="utf-8")
    print(f"k={k} written to config.json ({wk:g} weekly pts / {h5:g} 5h pts)")


def main(argv=None):
    p = argparse.ArgumentParser()
    s = p.add_subparsers(dest="cmd", required=True)
    m = s.add_parser("mode")
    m.add_argument("--stdin", action="store_true", help="read the usage JSON from stdin instead of flags")
    m.add_argument("--h5", type=float)
    m.add_argument("--h5-reset")
    m.add_argument("--wk", type=float)
    m.add_argument("--wk-reset")
    m.add_argument("--fable", type=float, help="percent used of a model-specific weekly limit, if your plan has one")
    m.add_argument("--json", action="store_true")
    m.add_argument("--now", help="ISO time override for tests")
    g = s.add_parser("log")
    g.add_argument("--item", required=True)
    for n in ("h5-before", "h5-after", "wk-before", "wk-after"):
        g.add_argument("--" + n, type=float, required=True)
    g.add_argument("--note", default="")
    s.add_parser("k")
    a = p.parse_args(argv)
    if a.cmd == "mode":
        try:
            if a.stdin:
                a.h5, a.h5_reset, a.wk, a.wk_reset, a.fable = read_usage(sys.stdin.buffer.read().decode("utf-8-sig"))
            elif None in (a.h5, a.h5_reset, a.wk, a.wk_reset):
                p.error("mode needs --h5 --h5-reset --wk --wk-reset, or --stdin")
            a.h5, a.wk = float(a.h5), float(a.wk)
            a.fable = None if a.fable is None else float(a.fable)
            r = compute(a, cfg(), parse(a.now) if a.now else None)
        except (ValueError, TypeError, KeyError, AttributeError) as e:
            raise SystemExit(f"invalid usage input ({type(e).__name__}: {e}): re-read usage and retry")
        print(json.dumps(r, indent=2) if a.json else fmt(r))
    elif a.cmd == "log":
        cmd_log(a)
    else:
        cmd_k(a)


if __name__ == "__main__":
    main()
