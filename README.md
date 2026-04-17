# Finance War Room

Multi-agent personal finance advisor built with LangGraph, CrewAI, FastAPI, and React.  
The system analyzes a financial profile through specialized agents, streams progress in real time, and returns a practical action plan.

## Overview

Finance War Room combines deterministic financial calculators with LLM-driven reasoning across five expert agents:

- **Budget Analyst**: identifies overspending and recoverable cash flow.
- **Debt Strategist**: builds payoff sequencing (avalanche/snowball comparison).
- **Investment Advisor**: recommends portfolio and goal-fund allocation.
- **Tax Optimizer**: surfaces tax-saving opportunities.
- **Goal Planner**: assembles a month-by-month roadmap to the target goal.

## Core Features

- Real-time analysis pipeline with WebSocket event streaming.
- Demo mode (no backend required) and Live API mode.
- Natural-language profile intake (`Describe Profile`) and JSON profile editing.
- Financial calculators for debt, investing, tax, budgeting, and goal feasibility.
- Shared LangGraph state passed through each agent stage.

## System Architecture

```text
React UI (Demo + Live modes)
  ├─ REST calls: /analyze, /analyze/sample, /profile/from-text
  └─ WebSocket: /ws/analyze (streaming events + final result)

FastAPI Backend
  ├─ LangGraph workflow: intake -> budget -> debt -> invest -> tax -> roadmap
  ├─ CrewAI agents + financial tools
  └─ Shared WarRoomState for cross-agent context
```

## Tech Stack

- **Backend**: FastAPI, LangGraph, CrewAI, LangChain, Pydantic v2
- **Frontend**: React + Vite
- **Streaming**: WebSocket (`/ws/analyze`)
- **LLM Providers**: OpenAI / Anthropic (env-configurable)

## Repository Structure

```text
finance-war-room/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── requirements.txt
│   ├── .env.example
│   ├── agents/
│   ├── tools/
│   ├── graph/
│   └── models/
├── frontend/
│   ├── src/App.jsx
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example
└── README.md
```

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm
- OpenAI or Anthropic API key

### 1) Backend Setup

```bash
cd backend
py -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python main.py
```

Backend default URL: `http://localhost:8000`  
Docs: `http://localhost:8000/docs`

### 2) Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`  
If 5173 is occupied, Vite automatically chooses another port (for example 5174).

## Environment Variables

### Backend (`backend/.env`)

Required:

- `OPENAI_API_KEY` (if `LLM_PROVIDER=openai`)

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

- `VITE_API_BASE=http://localhost:8000`
- `VITE_WS_URL=ws://localhost:8000/ws/analyze` (optional override)

## API Endpoints

- `GET /` - basic service metadata
- `GET /sample-profile` - sample input profile
- `POST /analyze` - full pipeline analysis from profile JSON
- `POST /analyze/sample` - run analysis on sample profile
- `POST /profile/from-text` - convert natural language into validated profile
- `WS /ws/analyze` - stream step-by-step events and final results

## Frontend Usage

1. Open the app.
2. Choose mode:
   - **Demo** for simulated output
   - **Live API** for backend-driven analysis
3. Provide input:
   - **Describe Profile** to type in natural language, or
   - **Edit Profile** for direct JSON editing
4. Click **Run Analysis**.
5. Review streaming logs and final agent reports.

## Deployment (Recommended)

- **Frontend**: Vercel
- **Backend**: Render / Railway / Fly / VM

Production backend env recommendations:

- `APP_ENV=production`
- `RELOAD=false`
- `CORS_ALLOW_LOCALHOST=false`
- `CORS_ORIGINS=https://<your-frontend-domain>`

Production frontend env recommendations:

- `VITE_API_BASE=https://<your-backend-domain>`
- `VITE_WS_URL=wss://<your-backend-domain>/ws/analyze`

## Troubleshooting

- **Cannot open `http://0.0.0.0:8000` in browser**: use `http://localhost:8000`.
- **CORS preflight fails**: ensure frontend origin is included in `CORS_ORIGINS`.
- **WebSocket fails in production**: use `wss://` URL and verify reverse proxy support.
- **401 from LLM provider**: verify API key and selected provider.
- **Slow first request on free hosting**: likely cold start behavior.

## Security Notes

- Never commit `.env` or API keys.
- Rotate keys immediately if exposed.
- Keep production secrets only in hosting platform environment variables.

## License

Add your preferred license (MIT, Apache-2.0, etc.) in a `LICENSE` file.
