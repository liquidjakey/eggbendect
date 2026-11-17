import type { DefectKey, Detection, EggCategory, LineTypeCounts, ProductionLine } from '@/types'
import { familyLineName, familySource, linesForFamily, type LineFamily } from '@/lib/lineFamily'

// Default thresholds — in the original design these were dashboard config
// props (`alertRate`, `reviewCut`); kept as constants here since this build
// only ships the dashboard screen.
export const ALERT_RATE_THRESHOLD = 2.0 // % — abnormal-rate line is flagged above this
export const REVIEW_CONFIDENCE_CUT = 0.8 // detections below this need human review
// A line with no new inspection within this window is considered stopped — the
// backend has no direct running/stopped signal, only inspection timestamps, so
// staleness is the only available proxy for "the line isn't producing anymore".
// `inspected_at` is only set once a capture finishes its full pipeline
// (image received -> GPU inference -> backend insert), and the 3 lines per
// family share one AI server process - under load, a specific line's own
// turn in that shared queue can genuinely lag 15-30s even while it's actively
// producing (measured under the 6-line loadtest). 15s was catching that
// queueing lag as a false "stopped", so the margin needs to clear it.
export const LINE_STOP_THRESHOLD_MS = 45_000

export const DEFECT_TYPES: Array<{ key: DefectKey; label: string }> = [
  { key: 'fm', label: '이물질' },
  { key: 'disc', label: '탈색' },
  { key: 'blood', label: '혈반' },
  { key: 'crack', label: '크랙' },
  { key: 'def', label: '기형' },
]

export function abnormalTotal(line: ProductionLine): number {
  const t = line.t
  return t.fm + t.disc + t.blood + t.crack + t.def
}

export function abnormalRate(line: ProductionLine): number {
  return (abnormalTotal(line) / line.count) * 100
}

export function isOverThreshold(line: ProductionLine): boolean {
  return abnormalRate(line) > ALERT_RATE_THRESHOLD
}

/** High-severity categories (이물질/크랙 등 실물 결함) vs. mid-severity vs. normal. */
export function severityOf(cat: EggCategory): 'high' | 'mid' | 'none' {
  if (cat === '정상') return 'none'
  if (cat === '크랙' || cat === '이물질') return 'high'
  return 'mid'
}

export function categoryColor(cat: EggCategory): string {
  const sev = severityOf(cat)
  if (sev === 'none') return '#a1a1aa'
  return sev === 'high' ? '#EF151E' : '#F8971D'
}

const CATEGORY_DEFECT_KEY: Partial<Record<EggCategory, DefectKey>> = {
  이물질: 'fm',
  탈색: 'disc',
  혈반: 'blood',
  크랙: 'crack',
  기형: 'def',
}

export interface FamilyLineBreakdown {
  key: string
  name: string
  count: number
  rate: number
  t: LineTypeCounts
}

/** Per-line stats for a single family's (MONO or COLOR) verdicts, computed
 *  client-side from the current `detections` window - 라인이 이제 family별로
 *  완전히 분리돼 있어(Line.source), 그 family 소속 라인만 골라서 집계한다. */
export function familyLineBreakdown(lines: ProductionLine[], detections: Detection[], family: LineFamily): FamilyLineBreakdown[] {
  return linesForFamily(lines, family).map((l) => {
    const t: LineTypeCounts = { fm: 0, disc: 0, blood: 0, crack: 0, def: 0 }
    let count = 0
    for (const d of detections) {
      if (d.line !== l.key) continue
      count++
      const key = CATEGORY_DEFECT_KEY[d.cat]
      if (key) t[key]++
    }
    const defectCount = t.fm + t.disc + t.blood + t.crack + t.def
    return { key: l.key, name: familyLineName(lines, l.key), count, rate: count ? (defectCount / count) * 100 : 0, t }
  })
}

/** Same shape as `useDashboardMetrics`'s `TypeTotal[]`, but counted from only
 *  this family's detections (`Detection.source` 기준). */
export function familyTypeTotals(detections: Detection[], family: LineFamily): Array<{ key: DefectKey; label: string; count: number }> {
  const src = familySource(family)
  const counts: Record<DefectKey, number> = { fm: 0, disc: 0, blood: 0, crack: 0, def: 0 }
  for (const d of detections) {
    if (d.source !== src) continue
    const key = CATEGORY_DEFECT_KEY[d.cat]
    if (key) counts[key]++
  }
  return DEFECT_TYPES.map(({ key, label }) => ({ key, label, count: counts[key] })).sort((a, b) => b.count - a.count)
}

export const fmt = {
  int: (n: number) => n.toLocaleString('ko-KR'),
  pct1: (n: number) => `${n.toFixed(1)}%`,
  pct0: (n: number) => `${n.toFixed(0)}%`,
}
