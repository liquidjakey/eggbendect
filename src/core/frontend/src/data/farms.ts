// 사육환경 코드(난각번호 마지막 자리) -> 한글 라벨. 난각번호 실시간 미리보기
// (parseShellCode)에서 쓰는 순수 클라이언트 디코딩 표라, 백엔드 농장 정보와는
// 무관하다 (실제 농장 정보는 /traceability/{lotId}에서 조회).
export const ENV_LABELS: Record<string, { label: string; area: string }> = {
  '1': { label: '방사', area: '자유 방목' },
  '2': { label: '평사', area: '9수/㎡ 이하' },
  '3': { label: '개선 케이지', area: '0.075㎡/마리' },
  '4': { label: '기존 케이지', area: '0.05㎡/마리' },
}
