export type LineStatus = 'run' | 'stop'
export type LineHealth = 'ok' | 'lens'

export interface LineTypeCounts {
  fm: number // 이물질 (foreign material)
  disc: number // 탈색 (discoloration)
  blood: number // 혈반 (blood spot)
  crack: number // 크랙 (crack)
  def: number // 기형 (malformed egg)
}

/** 라인은 MONO 또는 COLOR 카메라 중 하나만 달려있다 - 예전엔 한 물리적 라인에
 *  둘 다 있어서 계란 하나를 두 모델이 같이 판정했지만, 지금은 라인 자체가
 *  감지 방식별로 완전히 분리돼 있다. */
export type DetectionSource = 'MONO' | 'COLOR'

export interface ProductionLine {
  key: string
  name: string
  lanes: number
  status: LineStatus
  count: number
  t: LineTypeCounts
  health: LineHealth
  healthText?: string
  stopNote?: string
  source: DetectionSource
}

export type DefectCategory = '이물질' | '탈색' | '혈반' | '크랙' | '기형'
export type EggCategory = DefectCategory | '정상'

export interface Detection {
  id: string
  line: string
  time: string
  cat: EggCategory
  conf: number
  farm: string
  source: DetectionSource
  /** ai_server가 크롭해 업로드한 사진. 업로드 전엔 null. */
  imageUrl: string | null
  /** 이물질(FOREIGN_MATERIAL) 세부유형 원본 값(영문) - MONO 전용, 그 외엔 null. */
  subClass: string | null
}

export type DefectKey = keyof LineTypeCounts
