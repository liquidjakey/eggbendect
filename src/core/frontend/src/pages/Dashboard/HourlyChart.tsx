import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { DotItemDotProps, MouseHandlerDataParam } from 'recharts'
import { parseUtc, type HourlyStat } from '@/lib/api'
import { fmt } from '@/lib/metrics'
import { simHourProgress } from '@/hooks/useSimClock'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card'
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

const SCALE_MAX = 20000
// Fixed hour labels along the x-axis. Recharts positions ticks by their
// actual data value (or category index), so 21→23's 2-hour gap always reads
// narrower than the other 3-hour gaps no matter how the values are chosen —
// there's no way to keep these exact round-hour values AND have Recharts
// itself space them evenly. So the axis's own tick text is hidden, and this
// list instead drives a plain flexbox label row below the chart, where
// every label gets an identical flex-1 share of the width — guaranteed
// equal spacing, independent of the hour values themselves.
const X_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 23]

const chartConfig = {
  value: { label: '검사량', color: '#006ecd' },
} satisfies ChartConfig

type PointStatus = 'past' | 'current' | 'future'
interface Point {
  hour: number
  value: number | null
  status: PointStatus
}

interface HourlyChartProps {
  tick: number
  hours: HourlyStat[]
}

export function HourlyChart({ tick, hours }: HourlyChartProps) {
  const { hour: currentHour, minute: currentMinute } = simHourProgress(tick)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  // Only hours up to "now" have actually happened: earlier and the current
  // hour show the backend's real (already-so-far) count, and later hours
  // today simply haven't occurred yet — plotted as `null` so the line stops
  // growing right at "now" instead of drawing a flat tail to 23시.
  const revealed: Point[] = useMemo(() => {
    const points = hours.map((h) => {
      const hour = parseUtc(h.hour).getHours()
      if (hour > currentHour) return { hour, value: null, status: 'future' as const }
      return { hour, value: h.count, status: hour === currentHour ? ('current' as const) : ('past' as const) }
    })
    // The backend buckets by UTC calendar day, so converting each bucket to
    // the viewer's local hour-of-day (above) doesn't preserve array-index ==
    // hour-value the way the old static mock data did — re-sort so position
    // 0..23 in the chart always means local hour 0..23, left to right.
    return points.sort((a, b) => a.hour - b.hour)
  }, [hours, currentHour])

  const currentIdx = revealed.findIndex((p) => p.hour === currentHour)
  const activeIdx = hoverIdx ?? currentIdx
  // `hours` starts empty until the first poll resolves (or the current hour
  // isn't in the response yet) — fall back to a placeholder point instead of
  // indexing into an empty/missing slot.
  const active: Point = (activeIdx >= 0 ? revealed[activeIdx] : undefined) ?? {
    hour: currentHour,
    value: null,
    status: 'future',
  }
  const activeMinute = active.status === 'current' ? currentMinute : 0

  return (
    // No self-start here: this card sits in a 2-col grid next to
    // TypeDistribution and is meant to match its (taller) height via CSS
    // grid's default align-items:stretch. That's safe now — the x-axis row
    // below uses fixed pixel height/tickMargin (not a proportional share of
    // the container), so extra stretched height only grows the plot area
    // above it; the label row itself never moves or gets squeezed.
    <Card>
      <CardHeader className="mb-1.5">
        <CardTitle className="text-[15px] font-semibold">시간대별 검사량</CardTitle>
        <CardDescription>시간별 검사 개수 · 오늘 하루 (00시~23시 59분)</CardDescription>
        <CardAction className="text-right">
          <div className="text-xs text-muted-foreground">
            {active.hour}시 {String(activeMinute).padStart(2, '0')}분 검사량
            {active.status === 'current' && ' · 진행 중'}
          </div>
          <div className="font-mono text-[15px] font-bold">{fmt.int(active.value ?? 0)}</div>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-full min-h-37.5 w-full flex-1"
          initialDimension={{ width: 320, height: 150 }}
        >
          <LineChart
            data={revealed}
            margin={{ left: 4, right: 4, top: 8, bottom: 0 }}
            onMouseMove={(state: MouseHandlerDataParam) => {
              const idx = state.activeTooltipIndex
              if (typeof idx === 'number' && revealed[idx]?.value != null) setHoverIdx(idx)
            }}
            onMouseLeave={() => setHoverIdx(null)}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            {/* Tick text is rendered separately below (a flexbox row with
                guaranteed-equal spacing) — this axis just supplies the
                scale, so its own label rendering is switched off. */}
            <XAxis dataKey="hour" tickLine={false} axisLine={false} height={4} tick={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={32}
              domain={[0, SCALE_MAX]}
              ticks={[0, 10000, 20000]}
              tickFormatter={(v: number) => (v === 0 ? '0' : `${v / 1000}k`)}
              tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}
            />
            <ChartTooltip
              cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }}
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, _name, item) => {
                    const p = item.payload as Point
                    // Recharts still fires the axis-based tooltip when hovering
                    // over a future hour's x-position even though its `value`
                    // is null (nothing plotted there) — without this guard,
                    // `Number(null)` renders as a fabricated "0" that reads as
                    // real (zero-count) data for an hour that hasn't happened.
                    if (p.status === 'future') {
                      return <span className="text-muted-foreground">{p.hour}시 · 아직 지나지 않음</span>
                    }
                    const m = p.status === 'current' ? currentMinute : 0
                    return (
                      <span className="flex w-full items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {p.hour}시 {String(m).padStart(2, '0')}분{p.status === 'current' && ' · 진행 중'}
                        </span>
                        <span className="font-mono font-semibold text-foreground">{fmt.int(Number(value))}</span>
                      </span>
                    )
                  }}
                />
              }
            />
            <Line
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={2}
              connectNulls={false}
              isAnimationActive={false}
              dot={(props: DotItemDotProps) => {
                const { cx, cy, payload, index } = props
                const p = payload as Point
                if (p.value == null) return <g key={`dot-${index}`} />
                const isCurrent = p.status === 'current'
                return (
                  <circle
                    key={`dot-${index}`}
                    cx={cx}
                    cy={cy}
                    r={isCurrent ? 4.5 : 2.5}
                    fill={isCurrent ? '#f8971d' : 'var(--color-value)'}
                    stroke="#fff"
                    strokeWidth={isCurrent ? 1.5 : 1}
                  />
                )
              }}
              activeDot={{ r: 5, fill: 'var(--color-value)', stroke: '#fff', strokeWidth: 1.5 }}
            />
          </LineChart>
        </ChartContainer>
        {/* pl-9/pr-1 line up with the plot area's left/right edges (YAxis
            width 32 + LineChart margin.left 4, and margin.right 4). */}
        <div className="mt-1.5 flex pr-1 pl-9 font-mono text-[10px] whitespace-nowrap text-muted-foreground">
          {X_TICKS.map((h) => (
            <span key={h} className="flex-1 text-center">
              {h}시
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
