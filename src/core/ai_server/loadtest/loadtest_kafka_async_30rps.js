// 부하테스트 시나리오: 생산 레일 6개(MONO 3개, COLOR 3개)에서 레일별 초당 5장씩
// 동시에 이미지가 유입된다고 가정 - 합쳐서 초당 30장을 5분간 지속 유입.
// 레일마다 독립된 constant-arrival-rate 시나리오를 둬서 "전체 30장을 나눠서"가
// 아니라 "레일마다 정확히 5장/s"가 되도록 한다.
import http from 'k6/http'
import { check } from 'k6'
import { Rate } from 'k6/metrics'

// loadtest_6rails_30rps.js의 동기 /predict 버전과 정확히 같은 시나리오(레일당
// 5장/s, 총 30장/s, 5분)를 /predict-async(Kafka 경유)에 쏴서 비교한다. 이
// 엔드포인트는 큐에 올리기만 하고 바로 202를 반환하므로, 여기서 재는 건
// "접수 자체가 실패하는 비율"뿐이다 - 실제 끝까지 처리(추론+DB저장)됐는지는
// 테스트가 끝난 뒤 DB에서 이 캡처들을 직접 세어서 확인해야 한다(진짜 유실률).
const acceptFailRate = new Rate('accept_fail_rate')

const MONO_URL = 'http://localhost:8001/predict-async'
const COLOR_URL = 'http://localhost:8002/predict-async'
const DURATION = '60s'
// Has to match `preAllocatedVUs` on the scenarios below - see pickLotId()/the
// image picker for why.
const PRE_ALLOCATED_VUS = 30

// 난각번호(lot) 고르개.
// - K6_LOT_ID를 주면 그 난각번호 하나로 고정 (예: K6_LOT_ID=0815M3FDS4 k6 run ...)
// - 안 주면 실제 seed된 난각번호 50개(50개 농장에 1:1로 연결된 lot) 중에서
//   요청마다 랜덤으로 골라 쓴다 - 여러 농장 트래픽이 섞여 들어오는 실제 상황에 더 가깝다.
const LOT_ID_POOL = [
  '0508938102', '0702234341', '0118386572', '0819951812', '0609108512',
  '0212541184', '0818891312', '1120596154', '0202574004', '0709479303',
  '0422578192', '0318995934', '1123314174', '0108997334', '0419513474',
  '0721512453', '0918447182', '0608866224', '0128281312', '1003922403',
  '0928881044', '0525991664', '0801246214', '0904445224', '0312491174',
  '0616806971', '0419575764', '0925212262', '0517964744', '1223654612',
  '0615508574', '0211691771', '0103826034', '0603177164', '0324465004',
  '0826848473', '0614223633', '1211171004', '0915243222', '0215340504',
  '0927821321', '0816222242', '0113625652', '1226696384', '0402737884',
  '0102810664', '0903759094', '0413189812', '0120846681', '0609961632',
]
const FIXED_LOT_ID = __ENV.K6_LOT_ID || null

function pickLotId() {
  if (FIXED_LOT_ID) return FIXED_LOT_ID
  // `(__VU + __ITER) % pool.length`는 __VU가 1~PRE_ALLOCATED_VUS, __ITER가
  // 0부터 순증가라 둘의 합이 실제로는 좁은 구간만 돈다 - pool이 그보다 크면
  // 뒷부분은 테스트 내내 한 번도 안 뽑힌다. 대신 __ITER마다
  // PRE_ALLOCATED_VUS칸씩 점프하면(__VU를 0-based로 맞추고) pool 전체를
  // 순서대로 훑는다.
  return LOT_ID_POOL[((__VU - 1) + __ITER * PRE_ALLOCATED_VUS) % LOT_ID_POOL.length]
}
const RATE_PER_RAIL = 5 // 레일 1개당 초당 이미지 수
const TOTAL_RATE = RATE_PER_RAIL * 6 // 30 images/s

const MONO_IMAGE_PATHS = [
  '/home/jovyan/photos/MONO/images/0502154334_0_13616.jpg',
  '/home/jovyan/photos/MONO/images/0518093300_1_01267.jpg',
  '/home/jovyan/photos/MONO/images/0607093607_1_01088.jpg',
  '/home/jovyan/photos/MONO/images/0529122904_1_07172.jpg',
  '/home/jovyan/photos/MONO/images/0502110750_0_08437.jpg',
  '/home/jovyan/photos/MONO/images/0502111912_1_09260.jpg',
  '/home/jovyan/photos/MONO/images/0503095917_0_02729.jpg',
  '/home/jovyan/photos/MONO/images/0607115708_0_10977.jpg',
  '/home/jovyan/photos/MONO/images/0531130241_0_05161.jpg',
  '/home/jovyan/photos/MONO/images/0617101308_0_03210.jpg',
  '/home/jovyan/photos/MONO/images/0503105035_0_05871.jpg',
  '/home/jovyan/photos/MONO/images/0502115041_0_11636.jpg',
  '/home/jovyan/photos/MONO/images/0503112345_0_07912.jpg',
  '/home/jovyan/photos/MONO/images/0502115329_0_11847.jpg',
  '/home/jovyan/photos/MONO/images/0503114719_0_09690.jpg',
  '/home/jovyan/photos/MONO/images/0503115303_0_10123.jpg',
  '/home/jovyan/photos/MONO/images/0503113557_0_08832.jpg',
  '/home/jovyan/photos/MONO/images/0603110909_1_06401.jpg',
  '/home/jovyan/photos/MONO/images/0503112031_0_07668.jpg',
  '/home/jovyan/photos/MONO/images/0503111957_1_07624.jpg',
  '/home/jovyan/photos/MONO/images/0501110822_1_07732.jpg',
  '/home/jovyan/photos/MONO/images/0501093010_1_01330.jpg',
  '/home/jovyan/photos/MONO/images/0531154011_0_11475.jpg',
  '/home/jovyan/photos/MONO/images/0502101440_0_05157.jpg',
  '/home/jovyan/photos/MONO/images/0601101425_0_04027.jpg',
  '/home/jovyan/photos/MONO/images/0503102954_0_05022.jpg',
  '/home/jovyan/photos/MONO/images/0501092526_1_00973.jpg',
  '/home/jovyan/photos/MONO/images/0607112039_0_08467.jpg',
  '/home/jovyan/photos/MONO/images/0503094603_1_01730.jpg',
  '/home/jovyan/photos/MONO/images/0605122004_0_10463.jpg',
  '/home/jovyan/photos/MONO/images/0502122532_0_12852.jpg',
  '/home/jovyan/photos/MONO/images/0502113733_0_10645.jpg',
  '/home/jovyan/photos/MONO/images/0501094419_0_02398.jpg',
  '/home/jovyan/photos/MONO/images/0518114753_1_10177.jpg',
  '/home/jovyan/photos/MONO/images/0503115354_0_10187.jpg',
  '/home/jovyan/photos/MONO/images/0503095324_0_02285.jpg',
  '/home/jovyan/photos/MONO/images/0607094144_1_01512.jpg',
]
const COLOR_IMAGE_PATHS = [
  '/home/jovyan/photos/COLOR/images/test/20220907-01827.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-06488.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-00825.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221006-06325.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-01549.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-04245.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220919-01273.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-02162.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221007-16957.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-02096.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220919-05293.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-03890.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-01090.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-02390.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220919-04700.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-01769.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-07510.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-04385.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221006-07768.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221007-08605.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-05718.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-04944.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-08615.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221006-17617.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220919-03068.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220919-03605.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-05407.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220919-02191.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-03694.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-01350.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220919-01914.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-01733.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-05087.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220919-04797.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221006-14157.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-04480.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-04948.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-02315.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-05268.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221006-17102.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221006-08280.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-06684.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221007-09516.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-08996.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221007-15183.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-02897.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220919-04095.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221007-05760.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-03647.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-00943.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221006-13890.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-03414.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221007-00898.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220907-02422.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220913-02377.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220919-07673.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221006-03541.jpg',
  '/home/jovyan/photos/COLOR/images/test/20220919-04654.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221006-07971.jpg',
  '/home/jovyan/photos/COLOR/images/test/20221006-06567.jpg',
]
const monoImages = MONO_IMAGE_PATHS.map((p) => open(p, 'b'))
const colorImages = COLOR_IMAGE_PATHS.map((p) => open(p, 'b'))

function scenarioFor(railId, isMono) {
  return {
    executor: 'constant-arrival-rate',
    rate: RATE_PER_RAIL,
    timeUnit: '1s',
    duration: DURATION,
    // 5장/s * 예상 지연(~1~3s, 병목 시 더 늘어날 수 있음)을 감안해 넉넉히 확보
    preAllocatedVUs: 30,
    maxVUs: 120,
    gracefulStop: '60s',
    exec: isMono ? 'hitMono' : 'hitColor',
    env: { RAIL_ID: railId },
  }
}

export const options = {
  scenarios: {
    mono01: scenarioFor('MONO-01', true),
    mono02: scenarioFor('MONO-02', true),
    mono03: scenarioFor('MONO-03', true),
    color01: scenarioFor('COLOR-01', false),
    color02: scenarioFor('COLOR-02', false),
    color03: scenarioFor('COLOR-03', false),
  },
}

function post(url, railId, images) {
  // lot 고르개와 같은 이유로 (__VU-1) + __ITER*PRE_ALLOCATED_VUS 사용 - 200장
  // 풀에서 좁은 구간만 도는 건 이상:정상 비율을 맞춰놔도 그 구간의 비율만
  // 실제로 나온다는 뜻이라 (95:5로 맞췄는데 MONO가 18%로 나온 원인이 이거였음).
  const img = images[((__VU - 1) + __ITER * PRE_ALLOCATED_VUS) % images.length]
  const captureId = `k6-kafka-async-${railId}-${__VU}-${__ITER}-${Date.now()}`
  const data = {
    lotId: pickLotId(),
    lineId: railId,
    captureId: captureId,
    image: http.file(img, 'egg.jpg', 'image/jpeg'),
  }
  const res = http.post(url, data, { timeout: '30s' })
  const ok = res.status === 200
  acceptFailRate.add(!ok)
  check(res, {
    '200 응답(큐 접수)': () => ok,
  })
}

export function hitMono() {
  post(MONO_URL, __ENV.RAIL_ID, monoImages)
}

export function hitColor() {
  post(COLOR_URL, __ENV.RAIL_ID, colorImages)
}
