// backend 단독 부하테스트: AI 추론을 거치지 않고 POST /inspections(수집
// 엔드포인트)에 직접 합성 페이로드를 쏴서, backend/DB 저장 단계 자체의
// 처리량 한계를 구한다. AI서버 앞단 큐 근거(30rps에서 AI추론이 못 버팀)와
// 짝을 이루는 "DB 저장 전 큐" 근거용 - AI 추론시간이라는 변수를 없애고
// backend가 순수하게 얼마나 버티는지만 본다.
import http from 'k6/http'
import { check } from 'k6'
import { Rate } from 'k6/metrics'
import exec from 'k6/execution'

const BACKEND_URL = 'http://localhost:8000/inspections'
const failRateByScenario = {
  rate_30: new Rate('fail_rate_30rps'),
  rate_60: new Rate('fail_rate_60rps'),
  rate_100: new Rate('fail_rate_100rps'),
  rate_200: new Rate('fail_rate_200rps'),
}

function makePayload(lineId, captureId) {
  const eggs = []
  for (let i = 0; i < 16; i++) {
    eggs.push({ row: Math.floor(i / 4), col: i % 4, class: 'NORMAL', confidence: 0.95 })
  }
  return JSON.stringify({
    lineId,
    lotId: '0000000000',
    captureId,
    source: 'MONO',
    eggs,
  })
}

export const options = {
  scenarios: {
    rate_30: {
      executor: 'constant-arrival-rate',
      rate: 30,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 60,
      maxVUs: 200,
      startTime: '0s',
      exec: 'hit',
      tags: { target_rate: '30' },
    },
    rate_60: {
      executor: 'constant-arrival-rate',
      rate: 60,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 120,
      maxVUs: 300,
      startTime: '25s',
      exec: 'hit',
      tags: { target_rate: '60' },
    },
    rate_100: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 200,
      maxVUs: 400,
      startTime: '50s',
      exec: 'hit',
      tags: { target_rate: '100' },
    },
    rate_200: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '20s',
      preAllocatedVUs: 400,
      maxVUs: 600,
      startTime: '75s',
      exec: 'hit',
      tags: { target_rate: '200' },
    },
  },
}

let counter = 0
export function hit() {
  counter++
  const captureId = `bench-direct-${__VU}-${__ITER}-${Date.now()}-${counter}`
  const res = http.post(BACKEND_URL, makePayload('BENCH-DIRECT', captureId), {
    headers: { 'Content-Type': 'application/json' },
    timeout: '10s',
  })
  const ok = res.status === 200
  failRateByScenario[exec.scenario.name].add(!ok)
  check(res, { '200 응답': () => ok })
}
