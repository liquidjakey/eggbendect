// 이물질(FOREIGN_MATERIAL) 세부유형 — MONO 모델만 검출한다(COLOR는 이물질을
// 세부분류 없이 통짜로만 판정). 백엔드가 원본 영문 값(subClass)을 그대로 내려주므로
// 화면 표시용 한국어 라벨로만 옮긴다.
const FOREIGN_SUBTYPE_LABELS: Record<string, string> = {
  EGGSHELL: '껍질',
  FEATHER: '깃털',
  CHICKEN_DROPPINGS: '배설물',
  SPECKLED: '얼룩',
}

export function foreignSubtypeLabel(subClass: string): string {
  return FOREIGN_SUBTYPE_LABELS[subClass] ?? subClass
}
