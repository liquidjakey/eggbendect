import { useEffect, useState } from 'react'
import type { Detection, ProductionLine } from '@/types'
import { REVIEW_CONFIDENCE_CUT, categoryColor, fmt } from '@/lib/metrics'
import { formatShellCode } from '@/lib/shellCode'
import { getLotOrigin, resolveImageUrl } from '@/lib/api'
import { foreignSubtypeLabel } from '@/lib/foreignSubtype'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

function lineName(lines: ProductionLine[], key: string) {
  return lines.find((l) => l.key === key)?.name ?? key
}

const SOURCE_LABEL: Record<Detection['source'], string> = {
  MONO: '적외선 투과 (MONO)',
  COLOR: '일반 컬러 (COLOR)',
}

const SOURCE_BG: Record<Detection['source'], string> = {
  MONO: 'bg-[#14161a]',
  COLOR: 'bg-[#f0efeb]',
}

interface EggDetailPanelProps {
  detection: Detection
  lines: ProductionLine[]
  onOpenTrace: (shellCode: string) => void
  /** Shown as a second button next to "난각번호 이력 조회" when provided (the
   *  review queue's "다음 건" — the egg-list side panel doesn't need it). */
  onNext?: () => void
}

/** 계란 하나의 크롭 사진 + 판정도 + 분류 상세 - 검사 계란 목록 사이드패널과
 *  이상 계란 검토 모달이 이 컴포넌트를 공유해서 둘이 픽셀 단위로 동일하다. */
export function EggDetailPanel({ detection: d, lines, onOpenTrace, onNext }: EggDetailPanelProps) {
  const color = categoryColor(d.cat)
  const shell = formatShellCode(d.farm)

  // `d.farm` holds the lotId — resolve the farm's display name on demand
  // (only when a detail panel is actually open) rather than batch-joining it
  // for every row in the list views. Keyed by which lotId the result is for,
  // so a stale in-flight fetch from a previously-selected egg never overwrites
  // the name shown for the currently-selected one.
  const [ownerResult, setOwnerResult] = useState<{ farm: string; owner: string | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    getLotOrigin(d.farm)
      .then((res) => {
        if (!cancelled) setOwnerResult({ farm: d.farm, owner: res.origin.owner })
      })
      .catch(() => {
        if (!cancelled) setOwnerResult({ farm: d.farm, owner: null })
      })
    return () => {
      cancelled = true
    }
  }, [d.farm])
  const ownerName = ownerResult?.farm === d.farm ? ownerResult.owner : null

  return (
    <>
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="size-2.5 flex-none rounded-full" style={{ background: color }} />
          <span className="text-[15px] font-bold">{shell}</span>
          {d.cat !== '정상' && (
            <Badge style={{ background: color }} className="font-semibold text-white">
              {d.cat}
            </Badge>
          )}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {lineName(lines, d.line)} · {d.time}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] text-muted-foreground">{SOURCE_LABEL[d.source]}</div>
        {/* 계란 크롭 이미지는 리사이즈 없이 bbox 원본 픽셀 그대로 온다 (평균
            155×196px, 세로가 긴 1:1.26 비율 - 촬영 배치마다 실제 크기는 제각각).
            컨테이너를 그 평균 비율의 세로형 박스로 고정하고 object-contain으로
            띄워야 실제 계란 형태가 위아래 잘림 없이 그대로 보인다. 표시 크기는
            원본(196px 높이)보다 과하게 키우면 확대돼 뿌옇게 보이므로 200px로 제한. */}
        <div
          className={`relative mx-auto flex aspect-[155/196] w-full max-w-50 items-center justify-center overflow-hidden rounded-[10px] outline outline-1 -outline-offset-1 outline-black/10 ${SOURCE_BG[d.source]}`}
        >
          {resolveImageUrl(d.imageUrl) ? (
            <img src={resolveImageUrl(d.imageUrl)!} alt={SOURCE_LABEL[d.source]} className="h-full w-full object-contain" />
          ) : (
            <span className="text-[11px] text-muted-foreground">결과 없음</span>
          )}
        </div>
      </div>

      <div>
        <div className="mb-1.75 flex justify-between text-[13px]">
          <span className="text-muted-foreground">판정도</span>
          <span className="font-mono font-bold">{d.conf.toFixed(2)}</span>
        </div>
        <div className="relative h-2.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full" style={{ width: `${d.conf * 100}%`, background: d.cat === '정상' ? 'var(--cj-blue)' : color }} />
          <div className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-foreground/55" style={{ left: `${REVIEW_CONFIDENCE_CUT * 100}%` }} />
        </div>
        <div className="mt-1.25 flex justify-between text-[11px] text-muted-foreground">
          <span>판정도 낮음 · {fmt.pct0(REVIEW_CONFIDENCE_CUT * 100)} 미만</span>
          <span>판정도 높음 · {fmt.pct0(REVIEW_CONFIDENCE_CUT * 100)} 이상</span>
        </div>
      </div>

      <Card className="gap-2.5 p-3.5">
        <CardContent className="flex flex-col gap-2.5 p-0">
          <div className="flex justify-between text-[13px]">
            <span className="text-muted-foreground">분류</span>
            <span className="font-semibold" style={{ color: d.cat === '정상' ? undefined : color }}>
              {d.cat}
            </span>
          </div>
          {/* 이물질 세부분류는 MONO만 검출한다 - COLOR는 이물질을 세부분류 없이
              통짜로만 판정해서 subClass가 항상 null이고, 이 경우 행 자체를
              렌더링하지 않는다. */}
          {d.subClass && (
            <div className="flex justify-between text-[13px]">
              <span className="text-muted-foreground">세부유형</span>
              <span className="font-semibold">{foreignSubtypeLabel(d.subClass)}</span>
            </div>
          )}
          <div className="flex justify-between text-[13px]">
            <span className="text-muted-foreground">농장</span>
            <span className="font-semibold">{ownerName ?? '—'}</span>
          </div>
          <div className="mt-0.5 flex gap-2">
            <Button type="button" variant="outline" className="h-8.5 flex-1 font-semibold" onClick={() => onOpenTrace(shell)}>
              이 난각번호 이력 조회
            </Button>
            {onNext && (
              <Button type="button" variant="outline" className="h-8.5 flex-1 font-semibold" onClick={onNext}>
                다음 건 ▸
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  )
}
