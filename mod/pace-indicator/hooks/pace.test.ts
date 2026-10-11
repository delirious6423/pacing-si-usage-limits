import { expect, test } from 'claude-code/testing'

import { pace } from './register'

// Expected values come from pace.py (`mode --now 2026-10-11T13:24:00Z --json`). If they ever differ, the two have drifted.
const NOW = Date.parse('2026-10-11T13:24:00Z')
// [h5 %, h5 reset, week %, week reset, mode, 5h cap, week cap, dev budget (5h points), why]
const CASES: [number, string, number, string, string, number, number, number, string][] = [
  [16, "2026-10-11T16:39:59Z", 3, "2026-10-13T07:59:59Z", "BURN", 80, 80, 64.0, "weekly pace 0.04: well under budget, pull the backlog"],
  [30, "2026-10-11T16:00:00Z", 70, "2026-10-14T00:00:00Z", "YELLOW", 80, 80, 25.0, "weekly pace 1.04 above the budget line"],
  [85, "2026-10-11T16:00:00Z", 20, "2026-10-14T00:00:00Z", "RED", 80, 80, 0.0, "5h window at 85% (dev cap 80%)"],
  [65, "2026-10-11T16:00:00Z", 30, "2026-10-14T00:00:00Z", "YELLOW", 80, 80, 7.5, "5h window at 65% with 2.6h left: space out work"],
  [10, "2026-10-11T16:00:00Z", 70, "2026-10-11T20:00:00Z", "BURN", 80, 95, 70.0, "reserve released near reset: spend it"],
  [16, "2026-10-11T10:00:00Z", 3, "2026-10-13T07:59:59Z", "YELLOW", 80, 80, 32.0, "stale usage reading: re-read usage before spending"],
  [30, "2026-10-11T16:00:00Z", 40, "2026-10-14T00:00:00Z", "BURN", 80, 80, 50.0, "weekly pace 0.60: well under budget, pull the backlog"],
  [30, "2026-10-11T18:00:00Z", 15, "2026-10-18T13:00:00Z", "GREEN", 80, 80, 50.0, "weekly pace 0.99: on budget"],
  [10, "2026-10-11T13:50:00Z", 50, "2026-10-14T00:00:00Z", "BURN", 95, 80, 85.0, "reserve released near reset: spend it"],
  [30, "2026-10-11T16:00:00Z", 65, "2026-10-14T00:00:00Z", "GREEN", 80, 80, 50.0, "weekly pace 0.97: on budget"],
  [90, "2026-10-11T16:00:00Z", 10, "2026-10-14T00:00:00Z", "RED", 80, 80, 0.0, "5h window at 90% (dev cap 80%)"],
]

test('matches pace.py: mode, caps, budget and reason', () => {
  for (const [h5, h5r, wk, wkr, mode, cap5, capW, budget, why] of CASES) {
    const s = pace({ h5: { pct: h5, reset: h5r }, wk: { pct: wk, reset: wkr } }, NOW)
    expect([h5, wk, s?.mode, s?.cap5, s?.capW, Math.round((s?.budget5 ?? -1) * 10) / 10, s?.why]).toEqual([h5, wk, mode, cap5, capW, budget, why])
  }
})

test('a missing 5-hour window is a fresh one', () => {
  const s = pace({ h5: null, wk: { pct: 3, reset: '2026-10-13T07:59:59Z' } }, NOW)
  expect(s?.h5).toBe(0)
  expect(s?.mode).toBe('BURN')
})

test('no weekly reading shows nothing', () => {
  expect(pace({ h5: null, wk: null }, NOW)).toBe(null)
})
