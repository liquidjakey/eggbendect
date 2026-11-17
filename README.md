# 🥚 Egg Vision AI

**AI quality inspection for egg production lines.**

Welcome! Egg Vision AI watches egg trays as they move down a production line. It photographs each tray, finds every egg, and flags the ones that look wrong, such as cracked, stained, or misshapen eggs. Quality staff then see the results on a live web dashboard.

This repo holds the whole system: the trained AI models, the server that runs them, the backend API, and the dashboard.

---

## What it does

1. **Takes a photo** of a tray of eggs on the line.
2. **Finds each egg** and records where it sits on the tray (row and column).
3. **Labels each egg** with one of these types:

   | Label | What it means |
   |---|---|
   | `NORMAL` | The egg looks fine |
   | `CRACK` | The shell is cracked. This is a food-safety risk, because bacteria can get in. |
   | `BLOOD_SPOT` | A blood spot shows through the shell (MONO camera only) |
   | `DISCOLORATION` | The shell color is uneven or stained |
   | `FOREIGN_MATERIAL` | Something is stuck to the shell, such as a feather, droppings, or a shell fragment |
   | `DEFORMED` | The egg has an abnormal shape |

4. **Sends the results** to the backend, which stores them by line and lot.
5. **Shows everything** on a dashboard so staff can spot problems quickly.

The system supports two kinds of camera lines:

- **MONO**: a black-and-white camera. It also tells you *what kind* of foreign material it found (eggshell, feather, chicken droppings, or speckles).
- **COLOR**: a color camera, which works well for shell discoloration.

## The dashboard

The web app has four main screens:

| Screen | What you can do there |
|---|---|
| **Quality dashboard** (품질 검사 대시보드) | See today's totals, defect rates, defect types, and hourly trends |
| **Line monitoring** (생산라인 모니터링) | Watch each production line live, tray by tray |
| **Defect review** (이상 계란 검토) | Open flagged eggs one by one and check the AI's decision |
| **Shell code lookup** (난각번호 이력 조회) | Look up a lot by the code printed on the eggshell and see its full inspection history |

## How the pieces fit together

```
 Camera photo
      │
      ▼
 ┌──────────────┐   results   ┌──────────────┐    REST API    ┌──────────────┐
 │  AI server   │ ──────────▶ │   Backend    │ ─────────────▶ │  Dashboard   │
 │ (MONO/COLOR) │             │  + Postgres  │                │ (React app)  │
 └──────────────┘             └──────────────┘                └──────────────┘
  YOLO / RT-DETR               FastAPI                         Vite + React
```

- **AI server** (`src/core/ai_server/`): loads a model, runs it on tray photos, and sends the results to the backend. You run one copy for MONO and one for COLOR.
- **Backend** (`src/core/backend/`): a FastAPI server. It stores inspections in PostgreSQL and serves the data to the dashboard.
- **Dashboard** (`src/core/frontend/`): a React + TypeScript app built with Vite, Tailwind, and Recharts.

There is also an optional queue mode that uses Kafka (`/predict-async`) for high-traffic lines. You do not need it to try the app.

## Try it on your own computer

You need **Python 3.11+**, **Node.js 22+**, and **Docker** (for the database).

### 1. Start the database

```bash
docker run -d --name eggvision-db \
  -e POSTGRES_USER=eggvision -e POSTGRES_PASSWORD=eggvision -e POSTGRES_DB=eggvision \
  -p 5432:5432 postgres:16
```

### 2. Start the backend

```bash
cd src/core/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

On first run, the backend creates its tables and adds some demo data.
API docs: http://localhost:8000/docs

### 3. Start the AI server

Open a new terminal:

```bash
cd src/core/ai_server
pip install -r requirements.txt
AI_SERVER_SOURCE=MONO \
AI_MODEL_PATH=../../../work/mono_result/mono_yolo11n.pt \
uvicorn app.main:app --port 8001
```

> 💡 If you leave out `AI_MODEL_PATH`, the server still starts. It then answers `NORMAL` for every egg, which is handy for testing the rest of the system.

For a COLOR line, run a second copy on port 8002 with `AI_SERVER_SOURCE=COLOR` and a COLOR model, such as `work/color_result/color_yolo11m.pt`.

### 4. Start the dashboard

Open another terminal:

```bash
cd src/core/frontend
npm install
npm run dev
```

Open http://localhost:5174 and sign in with the demo account: `admin@test.com` / `1234`.

## The AI models

All trained models are in the `work/` folder:

| File | Camera | Model | Notes |
|---|---|---|---|
| `work/mono_result/mono_yolo11n.pt` | MONO | YOLO11n | **The one the live system uses.** It has 9 classes, including foreign-material subtypes. |
| `work/mono6_result/mono6_yolo11m.pt` | MONO | YOLO11m | More accurate, but it has only 6 classes (no foreign-material subtypes) |
| `work/rtdetr_result/rtdetr_mono6.pt` | MONO | RT-DETR | Comparison model, 6 classes |
| `work/color_result/color_yolo11n.pt` | COLOR | YOLO11n | Light and fast |
| `work/color_result/color_yolo11m.pt` | COLOR | YOLO11m | Recommended COLOR model |
| `work/color_result/color_rtdetr-l.pt` | COLOR | RT-DETR-L | Comparison model |

Each folder has its own `README.md` with training details, scores, and sample code. Those READMEs are in Korean.

The COLOR training scripts (training, evaluation, and tuning) are in `work/color/`.

## Good to know

- **Not included:** the 1.4 GB test image set (`backend_test_set.tar`). It is too big for GitHub, and you do not need it to run the app.
- **Known limit of the COLOR models:** in the training data, normal eggs and defective eggs were mostly photographed in different sessions. Because of this, the models partly learned to tell the *photo sessions* apart, not only the defects. Real-world accuracy may be lower than the test scores show. See `work/color_result/README.md` for the full analysis.
- **Platform build:** this project was first built on an internal ML platform with a GitLab CI pipeline. That build guide (in Korean) is in [`docs/platform-build-guide.ko.md`](docs/platform-build-guide.ko.md). You only need it if you deploy on that platform.

## Folder map

```
.
├── src/
│   ├── api/              # Container build settings for the ML platform
│   └── core/
│       ├── ai_server/    # Model server (MONO / COLOR)
│       ├── backend/      # FastAPI + PostgreSQL API
│       ├── frontend/     # React dashboard
│       └── color_infer.py, predict_module.py, ...
├── work/                 # Trained models, training scripts, and model notes
└── docs/                 # Platform build guide (Korean)
```

---

Thanks for stopping by! 🥚 Questions and ideas are welcome. Please open an issue.
