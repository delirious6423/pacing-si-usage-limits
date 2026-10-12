import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Rate } from '../types'

// Same policy as pace.py with its default config.json values. The mod does not read config.json or a model-specific
// weekly window. Keep the two in step: hooks/pace.test.ts pins the results.
const CFG = { devWeek: 80, dev5h: 80, weekReleaseH: 12, h5ReleaseMin: 45, released: 95, k: 0.19, slack: 15 }

export type Mode = 'BURN' | 'GREEN' | 'YELLOW' | 'RED'
export type Snap = {
  mode: Mode
  why: string
  h5: number
  wk: number
  cap5: number
  capW: number
  left5h: number
  leftWkH: number
  pace: number
  budget5: number
  stale: boolean
}

const RULES: Record<Mode, string> = {
  BURN: 'workers 6, effort high, offload heavily, full verification, pull the backlog',
  GREEN: 'workers 4, effort high, offload yes, full verification, backlog only when the item is done',
  YELLOW: 'workers 2, effort medium, offload drafts and reviews, one cheap verification round, no backlog',
  RED: 'workers 0, effort low, offload only work on a separate budget, verification stays pending, hand off and queue',
}

function win(pct: number, reset: string, lenH: number, now: number) {
  let left = (Date.parse(reset) - now) / 3.6e6
  const stale = !(left > 0)
  if (stale) left = lenH
  left = Math.min(left, lenH)
  return { pct, left, elapsed: Math.min(Math.max(1 - left / lenH, 0), 1), stale }
}

export function pace(rate: Rate, now: number): Snap | null {
  if (!rate.wk) return null
  const w = win(rate.wk.pct, rate.wk.reset, 168, now)
  // a window missing from the reading has reset: a fresh one at 0%
  const h = rate.h5 ? win(rate.h5.pct, rate.h5.reset, 5, now) : { pct: 0, left: 5, elapsed: 0, stale: false }
  if (!(h.pct >= 0 && w.pct >= 0)) return null

  const relW = w.left <= CFG.weekReleaseH
  const rel5 = h.left * 60 <= CFG.h5ReleaseMin
  const capW = relW ? CFG.released : CFG.devWeek
  const cap5 = rel5 ? CFG.released : CFG.dev5h
  const pw = w.pct / (capW * Math.max(w.elapsed, 0) + CFG.slack)

  let mode: Mode
  let why: string
  if (h.pct >= cap5) [mode, why] = ['RED', `5h window at ${h.pct}% (dev cap ${cap5}%)`]
  else if (w.pct >= capW) [mode, why] = ['RED', `weekly at ${w.pct}% (dev cap ${capW}%)`]
  else if (pw > 1.3) [mode, why] = ['RED', `weekly pace ${pw.toFixed(2)} is over 1.3x the dev budget line`]
  else if (pw > 1.0) [mode, why] = ['YELLOW', `weekly pace ${pw.toFixed(2)} above the budget line`]
  else if (h.pct >= cap5 - 20 && h.left > 1.0 && h.pct > 100 * h.elapsed) [mode, why] = ['YELLOW', `5h window at ${h.pct}% with ${h.left.toFixed(1)}h left: space out work`]
  else if (relW || rel5) [mode, why] = ['BURN', 'reserve released near reset: spend it']
  else if (pw < 0.7) [mode, why] = ['BURN', `weekly pace ${pw.toFixed(2)}: well under budget, pull the backlog`]
  else [mode, why] = ['GREEN', `weekly pace ${pw.toFixed(2)}: on budget`]
  const stale = w.stale || h.stale
  if (stale && (mode === 'GREEN' || mode === 'BURN')) [mode, why] = ['YELLOW', 'stale usage reading: re-read usage before spending']

  const ceiling = Math.min(Math.max(cap5 - h.pct, 0), Math.max(capW - w.pct, 0) / CFG.k)
  const budget5 = mode === 'RED' ? 0 : mode === 'YELLOW' ? ceiling * 0.5 : ceiling

  return { mode, why, h5: h.pct, wk: w.pct, cap5, capW, left5h: h.left, leftWkH: w.left, pace: pw, budget5, stale }
}

const COLOR: Record<Mode, string> = { BURN: '#2f9fc4', GREEN: '#2f9e5a', YELLOW: '#d9a000', RED: '#d93f3f' }

type Limit = { kind: string; percentUsed: number; resetsAt?: string }

function toRate(limits: Limit[]): Rate {
  const pick = (kind: string) => {
    const l = limits.find(x => x.kind === kind)
    return l && l.resetsAt && Number.isFinite(l.percentUsed) ? { pct: l.percentUsed, reset: l.resetsAt } : null
  }
  return { h5: pick('five_hour'), wk: pick('seven_day') }
}

const hm = (hours: number) => {
  const m = Math.round(hours * 60)
  return m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

// A meter on the desktop: a rounded track with the casual reserve tinted past the dev cap, the used part in the mode's color,
// and a tick at the cap. Gray with some alpha, so it reads on the light and the dark theme.
function barSvg(pct: number, cap: number, color: string, w: number, h: number): string {
  const x = (v: number) => (Math.min(Math.max(v, 0), 100) * w) / 100
  const r = h / 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><clipPath id="c"><rect width="${w}" height="${h}" rx="${r}"/></clipPath></defs>` +
    `<g clip-path="url(#c)"><rect width="${w}" height="${h}" fill="rgba(128,128,128,0.22)"/>` +
    `<rect x="${x(cap)}" width="${w - x(cap)}" height="${h}" fill="rgba(128,128,128,0.14)"/>` +
    `<rect width="${x(pct)}" height="${h}" fill="${color}"/></g>` +
    `<rect x="${x(cap) - 0.75}" width="1.5" height="${h}" fill="rgba(128,128,128,0.9)"/></svg>`
  )
}

// The same meter in cells for the terminal: used, free dev room, casual reserve
function blocks(pct: number, cap: number, n: number): string {
  const used = Math.round((Math.min(pct, 100) / 100) * n)
  const capCell = Math.round((cap / 100) * n)
  return Array.from({ length: n }, (_, i) => (i < used ? '█' : i >= capCell ? '·' : '░')).join('')
}

const state = atom({ plugin: 'pace-indicator', key: 'rate' } as const, null)
const hidden = atom({ plugin: 'pace-indicator', key: 'isHidden' } as const, false)

const PANE = 'pace'

async function setRate($: EngineInterface, limits: Limit[]) {
  await update($, state, () => toRate(limits))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pacing', description: 'Show the pacing mode, budget and limits in a pane' })
    try {
      await setRate($, (await $.session.usage()).rateLimits)
    } catch {
      // no usage yet: the band stays hidden until the first measurement
    }
    return next(e)
  })

  on('command.run', { command: 'pacing' }, async $ => {
    await update($, hidden, () => false) // also brings the band back after the × button
    await $.ui.open({ id: PANE, title: 'Pace' })
    return {}
  })

  on('session.measure', async ($, e, next) => {
    try {
      if (e.changed.includes('rateLimits')) await setRate($, e.rateLimits)
    } catch {
      // a malformed reading must never break the session
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const rate = await read($, state)
    const snap = rate ? pace(rate, await $.clock.now()) : null
    const E: any = $.ui.resolve(e)
    const { Box, Text, Svg } = E
    if (!snap) return <Text dimColor>Waiting for the first usage reading. Send a message.</Text>
    const color = COLOR[snap.mode]
    const isDesktop = e.surface === 'desktop' && Svg
    const meter = (label: string, pct: number, cap: number, left: number) => (
      <Box flexDirection="row" alignItems="center">
        <Box width={6} flexShrink={0}>
          <Text dimColor>{label}</Text>
        </Box>
        {isDesktop ? (
          <Svg source={barSvg(pct, cap, color, 220, 10)} alt={`${label} ${pct}% used, dev cap ${cap}%`} width={220} height={10} />
        ) : (
          <Text color={color}>{blocks(pct, cap, 24)}</Text>
        )}
        <Box marginLeft={2}>
          <Text>
            {pct}% <Text dimColor>of {cap}% dev cap · resets in {hm(left)}</Text>
          </Text>
        </Box>
      </Box>
    )
    return (
      <Box flexDirection="column">
        <Text bold color={color}>
          {snap.mode}
        </Text>
        <Text dimColor>{snap.why}</Text>
        <Text> </Text>
        {meter('5-hour', snap.h5, snap.cap5, snap.left5h)}
        {meter('Week', snap.wk, snap.capW, snap.leftWkH)}
        <Text dimColor>The tinted end of each bar is the casual-use reserve.</Text>
        <Text> </Text>
        <Text>
          Dev budget this 5-hour window: {snap.budget5.toFixed(1)} points <Text dimColor>(about {(snap.budget5 * CFG.k).toFixed(1)}% of the week)</Text>
        </Text>
        <Text dimColor>Weekly pace {snap.pace.toFixed(2)}x the dev budget line</Text>
        <Text dimColor>Allowed: {RULES[snap.mode]}</Text>
        {snap.stale && <Text color={COLOR.YELLOW}>A reset time has passed: the reading is stale until the next response.</Text>}
        <Text> </Text>
        <Text dimColor>Same rules as pace.py. The /pace skill picks the next roadmap item.</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rate = await read($, state)
    if (e.props.hasSurvey || !rate || (await read($, hidden))) return next(e)
    const snap = pace(rate, await $.clock.now())
    if (!snap) return next(e)

    // What other mods draw in the band stays, below this line
    const theirs = await next(e)
    const E: any = $.ui.resolve(e)
    const { Box, Text, Button, Svg } = E
    const color = COLOR[snap.mode]
    const isDesktop = e.surface === 'desktop' && Svg

    const meter = (label: string, pct: number, cap: number) =>
      isDesktop ? (
        <Box flexDirection="row" alignItems="center" marginLeft={2}>
          <Text dimColor>{label} </Text>
          <Box flexShrink={0} marginLeft={1}>
            <Svg source={barSvg(pct, cap, color, 96, 8)} alt={`${label} ${pct}% used, dev cap ${cap}%`} width={96} height={8} />
          </Box>
          <Text> {pct}%</Text>
        </Box>
      ) : (
        <Text dimColor>
          {' '}
          {label} {blocks(pct, cap, 10)} {pct}%
        </Text>
      )

    const line = (
      <Box flexDirection="row" alignItems="center">
        <Box flexShrink={1}>
          <Box flexDirection="row" alignItems="center">
            <Text bold color={color}>
              {snap.mode}
            </Text>
            {meter('5h', snap.h5, snap.cap5)}
            {meter('wk', snap.wk, snap.capW)}
            <Box marginLeft={2}>
              <Text dimColor wrap="truncate-end">
                resets {hm(snap.left5h)}
                {snap.stale ? ' · stale' : ''}
              </Text>
            </Box>
          </Box>
        </Box>
        <Box flexGrow={1} />
        <Box flexShrink={0} marginLeft={2}>
          <Button key="pace-details" label="details" dimColor onPress={() => $.ui.open({ id: PANE, title: 'Pace' })} />
        </Box>
        <Box flexShrink={0} marginLeft={2}>
          <Button key="pace-hide" label="×" role="dismiss" plain dimColor onPress={() => update($, hidden, () => true)} />
        </Box>
      </Box>
    )
    return theirs ? (
      <Box flexDirection="column">
        {line}
        {theirs}
      </Box>
    ) : (
      line
    )
  })
}
