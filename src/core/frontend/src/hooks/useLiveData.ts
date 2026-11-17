import { useEffect, useRef, useState } from 'react'
import type { Detection, ProductionLine } from '@/types'
import * as api from '@/lib/api'
import { inspectionToDetection, lineStatToProductionLine } from '@/lib/adapters'

const POLL_INTERVAL_MS = 500
const DETECTIONS_PAGE_SIZE = 200

export interface LiveData {
  lines: ProductionLine[]
  detections: Detection[]
  hourly: api.HourlyStat[]
  todayTrend: api.TodayTrendOut | null
  /** 이상률이 높은 순으로 정렬된 농장별 통계. */
  origins: api.OriginStat[]
  /** Line keys currently over the backend's abnormal-rate alert threshold. */
  alertLineKeys: string[]
  loading: boolean
  error: string | null
}

/** Polls the backend for lines/detections/hourly-volume/alerts every 500ms while `enabled`. */
export function useLiveData(enabled: boolean): LiveData {
  const [state, setState] = useState<LiveData>({
    lines: [],
    detections: [],
    hourly: [],
    todayTrend: null,
    origins: [],
    alertLineKeys: [],
    loading: true,
    error: null,
  })
  const inFlight = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function tick() {
      if (inFlight.current) return
      inFlight.current = true
      try {
        const [lineStats, hourlyStats, inspections, alerts, todayTrend, originStats] = await Promise.all([
          api.getLineStatistics(),
          api.getHourlyStatistics(),
          api.listInspections({ page: 0, size: DETECTIONS_PAGE_SIZE }),
          api.getAlerts(),
          api.getTodayTrend(),
          api.getOriginStatistics(),
        ])
        if (cancelled) return
        setState({
          lines: lineStats.lines.map(lineStatToProductionLine),
          detections: inspections.items.map(inspectionToDetection),
          hourly: hourlyStats.hours,
          todayTrend,
          origins: originStats.origins,
          alertLineKeys: alerts.lines.map((l) => l.lineId),
          loading: false,
          error: null,
        })
      } catch (e) {
        if (cancelled) return
        setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : '데이터를 불러오지 못했습니다' }))
      } finally {
        inFlight.current = false
      }
    }

    tick()
    const id = window.setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [enabled])

  return state
}
