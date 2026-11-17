import { ENV_LABELS } from '@/data/farms'

export const SHELL_CODE_LENGTH = 10

/** Strips whitespace/formatting and upper-cases — the canonical form used
 *  for lookups and comparisons everywhere (this is also the exact `lotId`
 *  format the backend stores, e.g. "0815M3FDS4"). */
export function normalizeShellCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase().slice(0, SHELL_CODE_LENGTH)
}

/** "0616M3FDS2" -> "0616 M3FDS 2" — the 4/5/1-digit grouping printed on the shell. */
export function formatShellCode(normalized: string): string {
  return `${normalized.slice(0, 4)} ${normalized.slice(4, 9)} ${normalized.slice(9, 10)}`.trim()
}

export interface ParsedShellCode {
  dateLabel: string // "6월 16일" once at least the date digits are typed, else "—"
  farmCode: string // "" until the farm-code chars are typed
  envDigit: string // "" until the trailing digit is typed
  envLabel: string // "2 · 평사 (9수/㎡ 이하)" once resolvable, else "—"
}

/** Incremental preview of whatever's been typed so far — mirrors as the
 *  user types, same as the original design's live "산란일자 / 농장 고유번호 /
 *  사육환경" preview row. */
export function parseShellCode(normalized: string): ParsedShellCode {
  const month = normalized.slice(0, 2)
  const day = normalized.slice(2, 4)
  const dateLabel = normalized.length >= 4 ? `${Number(month)}월 ${Number(day)}일` : '—'

  const farmCode = normalized.length > 4 ? normalized.slice(4, 9) : ''

  const envDigit = normalized.length >= 10 ? normalized.slice(9, 10) : ''
  const env = ENV_LABELS[envDigit]
  const envLabel = envDigit ? `${envDigit} · ${env ? `${env.label} (${env.area})` : '알 수 없는 환경'}` : '—'

  return { dateLabel, farmCode, envDigit, envLabel }
}
