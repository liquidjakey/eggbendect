import { useMemo } from 'react'
import type { ProductionLine } from '@/types'
import { DEFECT_TYPES, abnormalTotal, isOverThreshold } from '@/lib/metrics'

export interface TypeTotal {
  key: string
  label: string
  count: number
}

export function useDashboardMetrics(lines: ProductionLine[]) {
  return useMemo(() => {
    const totalCount = lines.reduce((a, l) => a + l.count, 0)
    const totalAbnormal = lines.reduce((a, l) => a + abnormalTotal(l), 0)
    const overallRate = totalCount ? (totalAbnormal / totalCount) * 100 : 0
    const overLines = lines.filter(isOverThreshold)
    const stoppedLines = lines.filter((l) => l.status === 'stop')

    const typeTotals: TypeTotal[] = DEFECT_TYPES.map(({ key, label }) => ({
      key,
      label,
      count: lines.reduce((a, l) => a + l.t[key], 0),
    })).sort((a, b) => b.count - a.count)

    const topType = typeTotals[0]

    return { totalCount, totalAbnormal, overallRate, overLines, stoppedLines, typeTotals, topType }
  }, [lines])
}
