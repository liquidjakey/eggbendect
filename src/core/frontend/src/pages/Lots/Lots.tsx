import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Search, TriangleAlert } from 'lucide-react'
import type { Detection, ProductionLine } from '@/types'
import { categoryColor, fmt } from '@/lib/metrics'
import { SHELL_CODE_LENGTH, formatShellCode, normalizeShellCode, parseShellCode } from '@/lib/shellCode'
import { ApiError, getLotInspections, getLotOrigin, type TraceOriginOut } from '@/lib/api'
import { inspectionToDetection } from '@/lib/adapters'
import { FAMILY_LABEL, familyLineName, type LineFamily } from '@/lib/lineFamily'
import { ColumnFilterMenu } from '@/components/ColumnFilterMenu'
import { LiveIndicator } from '@/components/LiveIndicator'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

// 백엔드 시드 데이터의 실제 lotId (README 참고).
const EXAMPLE_CODES = [formatShellCode('0815M3FDS4'), formatShellCode('0816K8ABC2')]

interface LotsProps {
  lines: ProductionLine[]
  detections: Detection[]
  live: boolean
  tick: number
  /** Pre-fill + auto-submit a search (e.g. "이 난각번호 이력 조회" from the egg list). */
  focusCode?: string
  onOpenEggList: () => void
}

export function Lots({ lines, live, tick, focusCode, onOpenEggList }: LotsProps) {
  const [input, setInput] = useState(focusCode ?? '')
  const [query, setQuery] = useState(focusCode ? normalizeShellCode(focusCode) : '')
  const [family, setFamily] = useState<LineFamily>('mono')

  // "Adjust state during render" (see Monitor's focusLineKey) so a fresh
  // trace request from another screen re-runs the search immediately.
  const [seenFocusCode, setSeenFocusCode] = useState(focusCode)
  if (focusCode && focusCode !== seenFocusCode) {
    setSeenFocusCode(focusCode)
    const normalized = normalizeShellCode(focusCode)
    setInput(normalized)
    setQuery(normalized)
  }

  const normalizedInput = normalizeShellCode(input)
  const complete = normalizedInput.length === SHELL_CODE_LENGTH
  const livePreview = parseShellCode(normalizedInput)

  const submitted = query.length === SHELL_CODE_LENGTH

  // Keyed by which query the result is for, so a stale in-flight search from
  // a previously-typed code never overwrites the result for the current one.
  interface LotResult {
    query: string
    origin: TraceOriginOut | null
    eggs: Detection[]
    notFound: boolean
  }
  const [result, setResult] = useState<LotResult | null>(null)

  useEffect(() => {
    if (!submitted) return
    let cancelled = false
    Promise.all([getLotOrigin(query), getLotInspections(query)])
      .then(([originRes, inspectionsRes]) => {
        if (cancelled) return
        setResult({
          query,
          origin: originRes,
          eggs: inspectionsRes.items.map(inspectionToDetection).sort((a, b) => (a.time < b.time ? 1 : -1)),
          notFound: false,
        })
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setResult({ query, origin: null, eggs: [], notFound: true })
        } else {
          toast(err instanceof Error ? err.message : '난각번호 조회에 실패했습니다')
        }
      })
    return () => {
      cancelled = true
    }
  }, [submitted, query])

  const resultReady = result?.query === query
  const loading = submitted && !resultReady
  const origin = resultReady ? result.origin : null
  const eggs = resultReady ? result.eggs : []
  const notFound = submitted && resultReady && result.notFound
  const found = submitted && !!origin

  const submit = (raw: string) => {
    const normalized = normalizeShellCode(raw)
    if (normalized.length === SHELL_CODE_LENGTH) setQuery(normalized)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-15 flex-none items-center gap-3.5 border-b border-border px-6.5">
        <h1 className="text-[17px] font-semibold">난각번호 이력 조회</h1>
        <div className="flex-1" />
        <LiveIndicator live={live} tick={tick} />
      </div>

      {/* scrollbar-gutter: switching between example codes can change the
          results table's row count enough to cross the scroll threshold —
          without a reserved gutter, the scrollbar popping in/out shifts
          every box on the page a few pixels narrower/wider. */}
      <div className="flex-1 space-y-4 overflow-y-auto p-6.5 [scrollbar-gutter:stable]">
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px] font-semibold">난각번호 10자리</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-2.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.25 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit(input)}
                  placeholder="0616 M3FDS 2"
                  aria-label="난각번호"
                  className="h-11.5 rounded-[10px] pr-4 pl-10 font-mono text-[17px] font-semibold tracking-wide"
                />
              </div>
              <Button
                type="button"
                disabled={!complete}
                onClick={() => submit(input)}
                className={cn('h-11.5 rounded-[10px] px-6 font-semibold', complete && 'bg-cj-blue text-white hover:bg-cj-blue/90')}
              >
                조회
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="ml-auto">예시</span>
              {EXAMPLE_CODES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setInput(code)}
                  className="rounded-lg border border-border bg-background px-2.5 py-1.25 font-mono text-xs font-semibold tracking-wide hover:bg-secondary"
                >
                  {code}
                </button>
              ))}
            </div>

            {normalizedInput.length >= 4 && (
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <PreviewTile label="산란일자" value={livePreview.dateLabel} />
                <PreviewTile label="농장 고유번호" value={livePreview.farmCode || '—'} mono />
                <PreviewTile label="사육환경" value={livePreview.envLabel} accent />
              </div>
            )}
          </CardContent>
        </Card>

        {!submitted && (
          <div className="flex flex-col items-center gap-3 py-13 text-center">
            <div className="flex size-15.5 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Search className="size-6.5" />
            </div>
            <div className="text-base font-semibold">난각번호를 입력하고 조회하세요</div>
            <div className="text-[13px] text-balance text-muted-foreground">
              검사 이력 · 농장 정보 · 사육환경 · 로트 추적 상태를 한 번에 확인합니다
            </div>
          </div>
        )}

        {submitted && loading && (
          <div className="flex flex-col items-center gap-3 py-13 text-center text-muted-foreground">불러오는 중…</div>
        )}

        {notFound && (
          <div className="flex flex-col items-center gap-2 py-13 text-center text-muted-foreground">
            <TriangleAlert className="size-8 text-cj-red" strokeWidth={1.7} />
            <div className="text-[15px] font-semibold text-foreground">등록된 이력이 없는 난각번호입니다</div>
            <div className="text-[13px] text-balance">
              난각번호 <span className="font-mono font-semibold">{formatShellCode(query)}</span> 를 찾을 수 없습니다 · 번호를 다시 확인하거나
              예시로 시도해 보세요
            </div>
          </div>
        )}

        {found && origin && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.92fr_1.08fr]">
            <Card className="gap-0 overflow-hidden py-0">
              <CardHeader className="flex flex-row items-center gap-2 border-b border-border px-4.5 py-2.75">
                <CardTitle className="text-sm font-semibold">사육 정보</CardTitle>
                <span className="ml-auto text-sm font-semibold">{origin.origin.owner ?? formatShellCode(query)}</span>
              </CardHeader>
              <CardContent className="divide-y divide-border px-4.5">
                <InfoRow label="농장 고유번호" value={origin.origin.originId ?? '—'} valueClassName="font-mono" />
                <InfoRow label="농장경영주" value={origin.origin.owner ?? '—'} />
                <InfoRow label="농장소재지" value={origin.origin.location ?? '—'} />
                <InfoRow label="사육환경" value={origin.rearingEnvironment?.name ?? '—'} />
                {origin.onHold && <InfoRow label="출고 상태" value="보류" valueClassName="font-semibold text-cj-red" />}
              </CardContent>
            </Card>

            <Card className="gap-0 overflow-hidden py-0">
              <CardHeader className="flex flex-row items-center gap-2.5 border-b border-border px-4.5 py-2.75">
                <CardTitle className="text-sm font-semibold">검사 결과</CardTitle>
                {/* ml-auto on the group's first item, not the button — keeps
                    "n건" and the button snug together as one unit at the
                    right edge, instead of the button alone pushing off to
                    the far right and leaving a gap after the count. */}
                <CardDescription className="ml-auto">{fmt.int(eggs.length)}건</CardDescription>
                <Button type="button" variant="outline" size="sm" className="font-semibold" onClick={onOpenEggList}>
                  목록에서 보기
                </Button>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="w-22 pl-4.5 text-xs font-semibold text-muted-foreground">시간</TableHead>
                      <TableHead className="w-40 text-xs font-semibold text-muted-foreground">
                        <div className="flex items-center gap-1">
                          라인
                          <ColumnFilterMenu
                            ariaLabel="라인 필터"
                            options={[
                              { value: 'mono', label: FAMILY_LABEL.mono },
                              { value: 'color', label: FAMILY_LABEL.color },
                            ]}
                            value={family}
                            onChange={(v) => setFamily(v as LineFamily)}
                          />
                        </div>
                      </TableHead>
                      <TableHead className="w-32 pr-4.5 text-xs font-semibold text-muted-foreground">판정</TableHead>
                      <TableHead className="w-24 pr-4.5 text-xs font-semibold text-muted-foreground">판정도</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eggs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-10 text-center text-[13px] text-muted-foreground">
                          이 난각번호로 검사된 계란이 없습니다
                        </TableCell>
                      </TableRow>
                    ) : (
                      eggs.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="pl-4.5 font-mono text-xs text-muted-foreground">{d.time}</TableCell>
                          <TableCell className="text-sm">{familyLineName(lines, d.line)}</TableCell>
                          <TableCell className="pr-4.5">
                            <span className="flex items-center gap-1.75 text-sm font-semibold" style={{ color: categoryColor(d.cat) }}>
                              <span className="size-2 flex-none rounded-full" style={{ background: categoryColor(d.cat) }} />
                              {d.cat}
                            </span>
                          </TableCell>
                          <TableCell className="pr-4.5 font-mono text-sm font-semibold">{d.conf.toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewTile({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div className={cn('rounded-[10px] px-3.5 py-2.75', accent ? 'bg-cj-blue-tint' : 'bg-secondary')}>
      <div className={cn('text-[11px] font-semibold', accent ? 'text-cj-blue-d' : 'text-muted-foreground')}>{label}</div>
      <div className={cn('mt-1 text-[15px] font-bold', mono && 'font-mono')}>{value}</div>
    </div>
  )
}

function InfoRow({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-2.5 py-2.75 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-semibold', valueClassName)}>{value}</span>
    </div>
  )
}
