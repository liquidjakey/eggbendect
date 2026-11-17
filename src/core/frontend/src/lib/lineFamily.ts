import type { Detection, EggCategory, ProductionLine } from '@/types'

// 라인은 MONO 전용 또는 COLOR 전용으로 완전히 분리돼 있다 (한 물리적 라인에
// MONO/COLOR 카메라가 같이 있어서 같은 계란을 둘 다 찍던 예전 모델이 아님) - 그래서
// "family"는 "같은 계란의 두 판정 중 어느 쪽을 볼지"가 아니라, 그냥
// "어느 라인 집합(MONO 라인들 vs COLOR 라인들)을 볼지" 필터일 뿐이다.
export type LineFamily = 'mono' | 'color'

export const FAMILY_LABEL: Record<LineFamily, string> = {
  mono: 'MONO LINE',
  color: 'COLOR LINE',
}

export function familySource(family: LineFamily): Detection['source'] {
  return family === 'mono' ? 'MONO' : 'COLOR'
}

/** 실제로 이 family 전용인 라인들만 (Line.source 기준). */
export function linesForFamily(lines: ProductionLine[], family: LineFamily): ProductionLine[] {
  return lines.filter((l) => l.source === familySource(family))
}

/** 라인은 이제 진짜 이름을 갖고 있어서(예: MONO-01) family별로 다르게 부를
 *  이유가 없다 - 더 이상 family 인자를 받지 않는다. */
export function familyLineName(lines: ProductionLine[], key: string): string {
  return lines.find((l) => l.key === key)?.name ?? key
}

/** 이 계란이 해당 family 소속이면 실제 분류를, 아니면 '정상'을 반환한다 - 계란
 *  하나는 정확히 하나의 family에만 속하므로, 다른 family 필터로 보고 있을 땐
 *  "이상 없음"과 똑같이 취급해서 그 family의 이상 집계/필터에서 자연스럽게 빠지게
 *  한다. `family: null` — family 토글이 없는 화면(대시보드 미리보기)에서는 병합
 *  없이 원래 판정을 그대로 반환한다. */
export function familyCategory(d: Detection, family: LineFamily | null): EggCategory {
  if (!family) return d.cat
  return d.source === familySource(family) ? d.cat : '정상'
}

export function familyConfidence(d: Detection, family: LineFamily | null): number {
  if (!family) return d.conf
  return d.source === familySource(family) ? d.conf : 0
}
