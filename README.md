# Finance War Room

Finance War Room is a multi-agent personal finance advisor built with FastAPI, LangGraph, CrewAI, and React (Vite).

It analyzes a financial profile through specialist agents, streams progress in real time, and returns an actionable plan for budgeting, debt payoff, investing, tax optimization, and goal planning.

## What This Project Does

- Runs a 6-step workflow: `intake -> budget -> debt -> invest -> tax -> roadmap`
- Uses 5 expert agents:
  - Budget Analyst
  - Debt Strategist
  - Investment Advisor
  - Tax Optimizer
  - Goal Planner
- Streams live step-by-step analysis events over WebSocket
- Supports two UI modes:
  - **Demo** mode (simulated output, no backend required)
  - **Live API** mode (real backend analysis)
- Supports profile input via:
  - direct JSON editing
  - natural language (`Describe Profile` -> `POST /profile/from-text`)
- Includes basic multi-currency handling (for example `USD`, `INR`, `AED`)

## Stack

- **Backend**: FastAPI, Pydantic v2, LangGraph, CrewAI, LangChain
- **Frontend**: React 18 + Vite 5
- **Streaming**: WebSocket (`/ws/analyze`)
- **LLM Providers**: OpenAI or Anthropic (env-configurable)

## Repository Layout

```text
finance-war-room/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── agents/
│   ├── graph/
│   ├── models/
│   └── tools/
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
└── README.md
```

## Local Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm
- OpenAI or Anthropic API key

### 1) Backend

Windows (PowerShell):

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python main.py
```

macOS/Linux:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python main.py
```

Backend defaults:

- API: `http://localhost:8000`
- Docs: `http://localhost:8000/docs`
- WS: `ws://localhost:8000/ws/analyze`

### 2) Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173` (or the next available Vite port).

## Environment Variables

### Backend (`backend/.env`)

Start from `.env.example`.

Required (depending on provider):

- `OPENAI_API_KEY` when `LLM_PROVIDER=openai`
- `ANTHROPIC_API_KEY` when `LLM_PROVIDER=anthropic`

Common:

- `LLM_PROVIDER=openai`
- `LLM_MODEL=gpt-4o-mini`
- `LLM_TEMPERATURE=0.3`
- `HOST=0.0.0.0`
- `PORT=8000`
- `APP_ENV=development`
- `RELOAD=true`
- `CORS_ORIGINS=http://localhost:5173,http://localhost:3000`
- `CORS_ALLOW_LOCALHOST=true`

### Frontend (`frontend/.env`)

Start from `.env.example`.

- `VITE_API_BASE=http://localhost:8000`
- `VITE_WS_URL=ws://localhost:8000/ws/analyze` (optional override)

## API Surface

- `GET /` - service metadata, agents list, pipeline definition
- `GET /sample-profile` - sample `FinancialProfile` payload
- `POST /analyze` - run full synchronous analysis from profile JSON
- `POST /analyze/sample` - run analysis using sample profile
- `POST /profile/from-text` - convert natural language into validated profile JSON
- `WS /ws/analyze` - stream workflow events and final results

## Frontend Workflow

1. Open the app.
2. Choose **Demo** or **Live API** mode.
3. Enter profile data:
   - **Edit Profile** for JSON
   - **Describe Profile** for natural language parsing
4. Click **Run Analysis**.
5. Watch real-time agent logs and final reports.

## Deployment Notes

- Frontend: Vercel (common choice)
- Backend: Render / Railway / Fly.io / VM

Recommended production settings:

- Backend:
  - `APP_ENV=production`
  - `RELOAD=false`
  - `CORS_ALLOW_LOCALHOST=false`
- Frontend:
  - `VITE_API_BASE=https://<your-backend-domain>`
  - `VITE_WS_URL=wss://<your-backend-domain>/ws/analyze`

## Troubleshooting

- If `http://0.0.0.0:8000` does not open in browser, use `http://localhost:8000`.
- If WebSocket fails in production, confirm `wss://` and proxy WebSocket support.
- If LLM calls fail (`401`/auth errors), verify provider key and `LLM_PROVIDER`.
- If CORS fails, verify frontend origin values in `CORS_ORIGINS`.

## Security

- Never commit `.env` files or API keys.
- Store production secrets in your hosting provider environment variables.
- Rotate keys immediately if they are exposed.
