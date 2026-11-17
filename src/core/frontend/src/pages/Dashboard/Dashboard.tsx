import { useMemo, useState } from 'react'
import type { Detection, ProductionLine } from '@/types'
import type { HourlyStat, OriginStat, TodayTrendOut } from '@/lib/api'
import { familyCategory } from '@/lib/lineFamily'
import { LinePreviewModal } from '@/components/LinePreviewModal'
import { LiveIndicator } from '@/components/LiveIndicator'
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics'
import { KpiCards } from './KpiCards'
import { LinesTable } from './LinesTable'
import { OriginTable } from './OriginTable'
import { TypeDistribution } from './TypeDistribution'
import { HourlyChart } from './HourlyChart'

interface DashboardProps {
  lines: ProductionLine[]
  detections: Detection[]
  hourly: HourlyStat[]
  todayTrend: TodayTrendOut | null
  origins: OriginStat[]
  live: boolean
  tick: number
  onRequestMonitor: (lineKey: string) => void
}

export function Dashboard({ lines, detections, hourly, todayTrend, origins, live, tick, onRequestMonitor }: DashboardProps) {
  const [previewKey, setPreviewKey] = useState<string | null>(null)

  const { totalCount, totalAbnormal, overallRate, typeTotals, topType } = useDashboardMetrics(lines)
  const previewLine = lines.find((l) => l.key === previewKey) ?? null
  const previewDetections = previewLine ? detections.filter((d) => d.line === previewLine.key) : []

  // 백엔드는 MONO/COLOR 라인별 집계를 따로 주지 않아서, 현재 detections(최근
  // 윈도우) 기준으로 두 모델 각각의 전체 이상률을 클라이언트에서 계산한다.
  const { monoRate, colorRate } = useMemo(() => {
    const rateFor = (family: 'mono' | 'color') => {
      if (detections.length === 0) return 0
      const abn = detections.filter((d) => familyCategory(d, family) !== '정상').length
      return (abn / detections.length) * 100
    }
    return { monoRate: rateFor('mono'), colorRate: rateFor('color') }
  }, [detections])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-15 flex-none items-center gap-3.5 border-b border-border px-6.5">
        <h1 className="text-[17px] font-semibold">품질 검사 대시보드</h1>
        <div className="flex-1" />
        <LiveIndicator live={live} tick={tick} />
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-6.5">
        <KpiCards
          totalCount={totalCount}
          overallRate={overallRate}
          totalAbnormal={totalAbnormal}
          topType={topType}
          monoRate={monoRate}
          colorRate={colorRate}
          todayTrend={todayTrend}
        />

        <LinesTable lines={lines} detections={detections} onOpenLine={setPreviewKey} />

        <OriginTable origins={origins} />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <TypeDistribution typeTotals={typeTotals} totalAbnormal={totalAbnormal} detections={detections} />
          <HourlyChart tick={tick} hours={hourly} />
        </div>
      </div>

      {previewLine && (
        <LinePreviewModal
          line={previewLine}
          lines={lines}
          detections={previewDetections}
          live={live}
          onSelectLine={setPreviewKey}
          onOpenMonitor={() => onRequestMonitor(previewLine.key)}
          onClose={() => setPreviewKey(null)}
        />
      )}
    </div>
  )
}
