import type { ElementTable } from 'claude-code'

import { blocks } from './chart'
import { minutes } from './hints'
import type { Hint } from './hints'
import { clockShares } from './model'
import type { Clock, Tile } from './model'
import { usd } from './pricing'
import { clockAlt, clockSvg, sparkAlt, sparkSvg } from './svg'

export const LEVEL = {
  critical: { icon: '▲', color: 'error', word: 'Act now' },
  warning: { icon: '◆', color: 'warning', word: 'Worth it' },
  info: { icon: '●', color: 'suggestion', word: 'Tip' },
} as const

/** Bordered stat tiles that wrap with the pane's width; a sparkline under each value once there are two turns. */
export const tilesView = (els: ElementTable, tiles: readonly Tile[], Svg: ElementTable['Svg'] | undefined) => {
  const { Box, Text } = els
  const spark = (t: Tile) =>
    t.series.length < 2 ? (
      <Text dimColor>–</Text>
    ) : Svg !== undefined ? (
      <Svg source={sparkSvg(t.series)} alt={sparkAlt(t)} />
    ) : (
      <Text color="claude">{blocks(t.series, 14)}</Text>
    )
  return (
    <Box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
      {tiles.map(t => (
        <Box key={`tile-${t.id}`} flexDirection="column" borderStyle="round" paddingX={1}>
          <Text dimColor>{t.label}</Text>
          <Text bold>{t.value}</Text>
          {spark(t)}
        </Box>
      ))}
    </Box>
  )
}

export type ClockText = { tokens: string; rebuild: string; auto: boolean }

/** The cache clock: state line, the draining bar by zone, a legend, and the armed idle compaction when there is one. */
export const clockView = (els: ElementTable, c: Clock, t: ClockText, cols: number, Svg: ElementTable['Svg'] | undefined) => {
  const { Box, Text } = els
  const sh = clockShares(c)
  const cells = Math.max(10, Math.min(40, cols - 24))
  const win = Math.round(sh.window * cells)
  const warm = Math.round((sh.window + sh.warm) * cells) - win
  const status =
    c.zone === 'unknown' ? (
      <Text dimColor>○ Cache state unknown until the next reply</Text>
    ) : c.zone === 'cold' ? (
      <Text>
        <Text color="warning">○ Cold</Text>
        <Text>  the next message re-writes {t.tokens}</Text>
        <Text dimColor>  · {t.rebuild}</Text>
      </Text>
    ) : (
      <Text>
        <Text color={c.zone === 'window' ? 'warning' : 'success'}>● Warm</Text>
        <Text>  expires in {minutes(c.remainingMs)}</Text>
        <Text dimColor>  · rebuilding later costs {t.rebuild}</Text>
      </Text>
    )
  const next =
    c.compactInMs === undefined
      ? undefined
      : `Next: auto-compact in ${minutes(c.compactInMs)}${c.saves !== undefined && c.saves > 0 ? ` (saves ≈ ${usd(c.saves)})` : ''}`
  return (
    <Box flexDirection="column" marginTop={1}>
      {status}
      {c.zone !== 'unknown' &&
        (Svg !== undefined ? (
          <Svg source={clockSvg(c)} alt={clockAlt(c)} height={36} isInteractive />
        ) : (
          <Text>
            <Text color="warning">{'█'.repeat(win)}</Text>
            <Text color="success">{'█'.repeat(warm)}</Text>
            <Text dimColor>{'░'.repeat(cells - win - warm)}</Text>
          </Text>
        ))}
      <Text dimColor>
        <Text color="success">█</Text> warm   <Text color="warning">█</Text> last {minutes(c.windowMs)} before expiry{t.auto ? ': auto-compact' : ''}   <Text dimColor>░</Text> cold
      </Text>
      {next !== undefined && <Text>{next}</Text>}
    </Box>
  )
}

export type HintActions = { compact: () => void; snooze: () => void; dismiss: () => void }

/** One hint with its three actions. Only the top hint takes the hotkeys 1, 2, 3: two buttons on a hotkey, the later wins. */
export const hintView = (els: ElementTable, hint: Hint, act: HintActions, hasKeys: boolean) => {
  const { Box, Text, Button } = els
  const lv = LEVEL[hint.level]
  const key = (digit: string) => (hasKeys ? { hotkey: digit } : {})
  return (
    <Box key={`hint-${hint.id}`} flexDirection="column" marginTop={1}>
      <Text>
        <Text color={lv.color}>{lv.icon} {lv.word}</Text>
        <Text bold>  {hint.title}</Text>
        <Text dimColor>  ~{usd(hint.stake)} at stake</Text>
      </Text>
      <Text dimColor wrap="wrap">  {hint.detail}</Text>
      <Box flexDirection="row" marginLeft={2} gap={1}>
        {hint.action === 'compact' && (
          <Button key={`compact-${hint.id}`} variant="primary" label="Compact now" {...key('1')} onPress={act.compact} />
        )}
        <Button key={`snooze-${hint.id}`} label="Snooze 10 min" {...key('2')} onPress={act.snooze} />
        <Button key={`dismiss-${hint.id}`} label="Not this session" {...key('3')} onPress={act.dismiss} />
      </Box>
    </Box>
  )
}
