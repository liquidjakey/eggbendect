import type { Detection, EggCategory, ProductionLine } from '@/types'
import { LINE_STOP_THRESHOLD_MS } from '@/lib/metrics'
import { parseUtc, type DefectType, type InspectionOut, type LineStat } from './api'

const DEFECT_TYPE_LABELS: Record<DefectType, EggCategory> = {
  NORMAL: '정상',
  CRACK: '크랙',
  BLOOD_SPOT: '혈반',
  DISCOLORATION: '탈색',
  FOREIGN_MATERIAL: '이물질',
  DEFORMED: '기형',
}

export function defectTypeLabel(type: DefectType | null): EggCategory {
  return type ? DEFECT_TYPE_LABELS[type] : '정상'
}

function formatTime(iso: string): string {
  const d = parseUtc(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function lineStatToProductionLine(stat: LineStat): ProductionLine {
  // 백엔드는 라인의 물리적 가동/정지 신호를 따로 안 준다 - 최근 검사 시각만
  // 있으므로, 일정 시간 새 검사가 안 들어오면 정지한 것으로 간주한다.
  const stopped =
    !stat.lastInspectedAt || Date.now() - parseUtc(stat.lastInspectedAt).getTime() > LINE_STOP_THRESHOLD_MS

  return {
    key: stat.lineId,
    name: stat.lineId,
    // 레인 수·카메라 렌즈 상태는 백엔드가 추적하지 않아 고정값으로 둔다.
    lanes: 1,
    status: stopped ? 'stop' : 'run',
    count: stat.totalCount,
    t: {
      fm: stat.foreignMaterialCount,
      disc: stat.discolorationCount,
      blood: stat.bloodSpotCount,
      crack: stat.crackCount,
      def: stat.deformedCount,
    },
    health: 'ok',
    source: stat.source,
  }
}

export function inspectionToDetection(insp: InspectionOut): Detection {
  return {
    id: insp.eggId,
    line: insp.lineId,
    time: formatTime(insp.inspectedAt),
    cat: defectTypeLabel(insp.defectType),
    conf: insp.confidence ?? 0,
    // 난각번호(lotId)를 그대로 담는다 - 표시할 땐 formatShellCode()로 그룹핑한다.
    farm: insp.lotId,
    source: insp.source,
    imageUrl: insp.imageUrl,
    subClass: insp.subClass,
  }
}
