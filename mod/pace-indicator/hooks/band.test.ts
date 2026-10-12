import { expect, mock, test } from 'claude-code/testing'

import './register'

// What the engine would answer beneath the plugin: a clock, the measure echo, nothing else drawn.
const bottom = (on: any) => {
  mock.clock(on)
  on('session.measure', (_$: any, e: any) => ({ changed: e.changed }))
  // another mod's line already in the band: ours must stack above it
  on('ui.render', { component: 'AbovePrompt' }, ($: any, e: any) => $.ui.resolve(e).Text({ children: 'OTHER-MOD' }))
}

const IN = (h: number) => new Date(Date.now() + h * 3.6e6).toISOString()

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the band draws on ${surface}`, async ($: any, on: any) => {
    bottom(on)
    // a usage reading arrives the way the engine pushes it
    await $.session.measure({
      context: {},
      rateLimits: [
        { kind: 'five_hour', percentUsed: 16, resetsAt: IN(3) },
        { kind: 'seven_day', percentUsed: 3, resetsAt: IN(42) },
      ],
      changed: ['rateLimits'],
    })
    const band = await $.ui.mount({
      plugin: 'pace-indicator',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 100 },
    })
    const tree = JSON.stringify(await band.drawn())
    expect(tree).toContain('BURN')
    // the desktop draws SVG meters, the terminal draws block meters
    if (surface === 'desktop') expect(tree).toContain('<svg')
    else expect(tree).toContain('░')
    expect(tree).toContain('OTHER-MOD')
    expect(tree.indexOf('BURN')).toBeLessThan(tree.indexOf('OTHER-MOD'))
  })
}

test('no reading, no band', async ($: any, on: any) => {
  bottom(on)
  const band = await $.ui.mount({
    plugin: 'pace-indicator',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 5, bodyColumns: 100 },
  })
  const tree = JSON.stringify(await band.drawn())
  expect(tree).not.toContain('BURN')
  expect(tree).toContain('OTHER-MOD')
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the /pacing pane draws on ${surface}`, async ($: any, on: any) => {
    bottom(on)
    await $.session.measure({
      context: {},
      rateLimits: [
        { kind: 'five_hour', percentUsed: 16, resetsAt: IN(3) },
        { kind: 'seven_day', percentUsed: 3, resetsAt: IN(42) },
      ],
      changed: ['rateLimits'],
    })
    const pane = await $.ui.mount({
      plugin: 'pace-indicator',
      surface,
      component: 'Pane',
      requestId: 'pace',
      props: { bodyColumns: 80 },
    })
    const tree = JSON.stringify(await pane.drawn())
    expect(tree).toContain('Dev budget this 5-hour window')
    expect(tree).toContain('BURN')
  })
}
