// Thin client for the backend (`src/core/backend`) REST API. Field names
// mirror the backend's Pydantic schemas 1:1 (both sides use camelCase), so
// no case-conversion layer is needed.

const API_BASE = __API_BASE_URL__.replace(/\/$/, '')
const TOKEN_KEY = 'eggvision.accessToken'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

/** Backend image URLs come back as storage-relative paths (e.g. "/static/...") — resolve against the API origin so <img> can load them. */
export function resolveImageUrl(url: string | null): string | null {
  if (!url) return null
  return /^https?:\/\//.test(url) ? url : `${API_BASE}${url}`
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.detail ?? `요청에 실패했습니다 (${res.status})`, res.status)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Backend datetimes serialize as naive UTC (no "Z"/offset suffix) — parsing
 *  them with plain `new Date()` would make JS treat them as local time
 *  instead, silently shifting every timestamp by the viewer's UTC offset. */
export function parseUtc(iso: string): Date {
  return new Date(iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
}

// --- 인증 --------------------------------------------------------------------

export interface LoginResponse {
  userId: string
  email: string
  message: string
  accessToken: string
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
}

// --- 검사(inspections) ---------------------------------------------------------

export type DefectType = 'NORMAL' | 'CRACK' | 'BLOOD_SPOT' | 'DISCOLORATION' | 'FOREIGN_MATERIAL' | 'DEFORMED'

export interface InspectionOut {
  inspectionId: number
  eggId: string
  lotId: string
  lineId: string
  row: number
  col: number
  source: 'MONO' | 'COLOR'
  isDefect: boolean
  defectType: DefectType | null
  /** FOREIGN_MATERIAL 세부유형 - MONO 전용, 그 외엔 항상 null. */
  subClass: string | null
  confidence: number | null
  imageUrl: string | null
  inspectedAt: string
}

export interface InspectionListOut {
  items: InspectionOut[]
  page: number
  size: number
  totalElements: number
}

export interface LineStat {
  lineId: string
  source: 'MONO' | 'COLOR'
  totalCount: number
  defectCount: number
  defectRate: number
  foreignMaterialCount: number
  discolorationCount: number
  bloodSpotCount: number
  crackCount: number
  deformedCount: number
  /** UTC timestamp of the most recent inspection recorded for this line, or null if it has none yet. */
  lastInspectedAt: string | null
}

export interface HourlyStat {
  hour: string
  count: number
}

export interface LineAlert {
  lineId: string
  defectRate: number
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) usp.set(k, String(v))
  }
  const s = usp.toString()
  return s ? `?${s}` : ''
}

export function getAlerts(): Promise<{ threshold: number; lines: LineAlert[] }> {
  return request('/inspections/alerts')
}

export function getLineStatistics(): Promise<{ lines: LineStat[] }> {
  return request('/inspections/line-statistics')
}

export interface OriginStat {
  originId: string
  owner: string | null
  location: string | null
  totalCount: number
  defectCount: number
  defectRate: number
}

/** 이상률이 높은 순으로 정렬돼서 내려온다. */
export function getOriginStatistics(): Promise<{ origins: OriginStat[] }> {
  return request('/inspections/origin-statistics')
}

export function getHourlyStatistics(date?: string): Promise<{ hours: HourlyStat[] }> {
  return request(`/inspections/hourly-statistics${qs({ date })}`)
}

export interface TodayTrendOut {
  todayCount: number
  yesterdaySameTimeCount: number
  changeRate: number | null
}

export function getTodayTrend(): Promise<TodayTrendOut> {
  return request('/inspections/today-trend')
}

export function listInspections(params: {
  page?: number
  size?: number
  lineId?: string
  isDefect?: boolean
} = {}): Promise<InspectionListOut> {
  return request(`/inspections${qs(params)}`)
}

// --- 이력관리(traceability) -----------------------------------------------------

export interface OriginOut {
  originId: string | null
  owner: string | null
  location: string | null
}

export interface TraceOriginOut {
  lotId: string
  origin: OriginOut
  rearingEnvironment: { code: string; name: string } | null
  onHold: boolean
}

export interface TraceEventOut {
  seq: number
  stage: string
  occurredAt: string
  label: string
  location: string | null
  qty: number | null
  temperature: number | null
  humidity: number | null
  referenceNo: string | null
}

export function getLotOrigin(lotId: string): Promise<TraceOriginOut> {
  return request(`/traceability/${encodeURIComponent(lotId)}`)
}

export function getLotInspections(lotId: string): Promise<InspectionListOut> {
  return request(`/traceability/${encodeURIComponent(lotId)}/inspections`)
}

export function getLotEvents(lotId: string): Promise<{ lotId: string; events: TraceEventOut[] }> {
  return request(`/traceability/${encodeURIComponent(lotId)}/events`)
}
