import { useState } from 'react'
import type { Detection } from '@/types'
import { familyTypeTotals, fmt } from '@/lib/metrics'
import type { LineFamily } from '@/lib/lineFamily'
import type { TypeTotal } from '@/hooks/useDashboardMetrics'
import { ColumnFilterMenu } from '@/components/ColumnFilterMenu'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type DistributionFilter = 'all' | LineFamily

interface TypeDistributionProps {
  /** 병합(MONO+COLOR) 판정 기준 — 필터가 '전체'일 때 그대로 사용한다. */
  typeTotals: TypeTotal[]
  totalAbnormal: number
  detections: Detection[]
}

export function TypeDistribution({ typeTotals, totalAbnormal, detections }: TypeDistributionProps) {
  const [filter, setFilter] = useState<DistributionFilter>('all')
  const totals = filter === 'all' ? typeTotals : familyTypeTotals(detections, filter)
  const total = filter === 'all' ? totalAbnormal : totals.reduce((a, t) => a + t.count, 0)
  const max = Math.max(...totals.map((t) => t.count), 1)

  const filterDescription =
    filter === 'mono'
      ? '적외선 투과(MONO) 딥러닝 5종 분류'
      : filter === 'color'
        ? '일반 컬러(COLOR) 딥러닝 5종 분류'
        : 'MONO·COLOR 통합 판정 5종 분류'

  return (
    <Card>
      <CardHeader className="mb-1.5">
        <CardTitle className="text-[15px] font-semibold">유형별 이상 현황</CardTitle>
        <CardDescription>{filterDescription} · 오늘 누적 {fmt.int(total)}건</CardDescription>
        <CardAction>
          <ColumnFilterMenu
            ariaLabel="유형별 이상 현황 필터"
            options={[
              { value: 'all', label: '전체' },
              { value: 'mono', label: 'MONO' },
              { value: 'color', label: 'COLOR' },
            ]}
            value={filter}
            neutralValue="all"
            onChange={(v) => setFilter(v as DistributionFilter)}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4.5">
        {totals.map((t, i) => (
          <div key={t.key} className="flex items-center gap-4 text-sm">
            <div className={cn('w-16 flex-none', i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{t.label}</div>
            <div className="h-6.5 flex-1 overflow-hidden rounded-md bg-secondary">
              <div
                className={cn('h-full', i === 0 ? 'bg-cj-blue-d' : 'bg-cj-blue/75')}
                style={{ width: `${(t.count / max) * 100}%` }}
              />
            </div>
            <div className="w-13.5 flex-none text-right font-mono text-sm font-semibold">{fmt.int(t.count)}</div>
            <div className="w-10.5 flex-none text-right font-mono text-xs text-muted-foreground">
              {fmt.pct0(total ? (t.count / total) * 100 : 0)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
