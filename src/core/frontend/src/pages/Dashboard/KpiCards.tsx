import { ALERT_RATE_THRESHOLD, fmt } from '@/lib/metrics'
import type { TypeTotal } from '@/hooks/useDashboardMetrics'
import type { TodayTrendOut } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface KpiCardsProps {
  totalCount: number
  overallRate: number
  totalAbnormal: number
  topType: TypeTotal
  monoRate: number
  colorRate: number
  todayTrend: TodayTrendOut | null
}

function trendLabel(todayTrend: TodayTrendOut | null): string {
  if (!todayTrend || todayTrend.changeRate === null) return '전일 동시간 대비 -'
  const sign = todayTrend.changeRate > 0 ? '+' : ''
  return `전일 동시간 대비 ${sign}${todayTrend.changeRate.toFixed(1)}%`
}

export function KpiCards({ totalCount, overallRate, totalAbnormal, topType, monoRate, colorRate, todayTrend }: KpiCardsProps) {
  const over = overallRate > ALERT_RATE_THRESHOLD
  const topShare = totalAbnormal ? (topType.count / totalAbnormal) * 100 : 0

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card>
        <CardContent className="flex flex-col gap-1.5">
          <div className="text-[13px] text-muted-foreground">오늘 누적 검사량</div>
          <div className="font-mono text-3xl font-bold tracking-tight">{fmt.int(totalCount)}</div>
          <div className="text-xs text-muted-foreground">{trendLabel(todayTrend)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="text-[13px] text-muted-foreground">전체 이상률</div>
            <Badge className={cn('font-semibold', over ? 'bg-cj-red-tint text-cj-red' : 'bg-cj-blue-tint text-cj-blue-d')}>
              {over ? '기준 초과' : '기준 이내'}
            </Badge>
          </div>
          <div className={cn('font-mono text-3xl font-bold tracking-tight', over && 'text-cj-red')}>{fmt.pct1(overallRate)}</div>
          <div className="text-xs text-muted-foreground">
            MONO LINE 이상률 {fmt.pct1(monoRate)} | COLOR LINE 이상률 {fmt.pct1(colorRate)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1.5">
          <div className="text-[13px] text-muted-foreground">최다 이상 유형</div>
          <div className="text-[26px] leading-tight font-bold tracking-tight">{topType.label}</div>
          <div className="text-xs text-muted-foreground">
            {fmt.int(topType.count)}건 · 전체 이상의 {fmt.pct0(topShare)}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
